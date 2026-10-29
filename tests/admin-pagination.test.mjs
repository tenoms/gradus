import test from "node:test";
import assert from "node:assert/strict";
import { startHttpApp, testLearner } from "./http-app.mjs";

const start = () => startHttpApp({ yybRequest: async () => [
  { id: 7, nickname: "学习账号", status: "alive", openid: "private-account-value" },
] });
async function get(app, auth, route) {
  const response = await app.request(route, { auth });
  assert.equal(response.status, 200, route);
  return response.json();
}

test("management user pages count all matches and expose account ownership outside the current page", async () => {
  const app = await start();
  try {
    const admin = await app.setup();
    const created = [];
    for (let index = 0; index < 23; index++) {
      const user = await app.createUser(admin, testLearner(`member.${index}`, index === 0 ? "7" : "", {
        displayName: `${index % 2 === 0 ? "甲组" : "乙组"}成员 ${index}`,
        role: index % 7 === 0 ? "admin" : "learner",
      }));
      created.push(user);
      if (index < 5) assert.equal((await app.request(`/api/admin/users/${user.id}`, { auth: admin, method: "PATCH", body: { status: "disabled" } })).status, 200);
    }
    const first = await get(app, admin, "/api/admin/users");
    assert.deepEqual(first.pagination, { page: 1, pageSize: 20, total: 24, totalPages: 2 });
    assert.equal(first.users.length, 20);
    assert.equal(first.users.some(user => user.id === created[0].id), false);
    const last = await get(app, admin, "/api/admin/users?page=999");
    assert.deepEqual(last.pagination, { page: 2, pageSize: 20, total: 24, totalPages: 2 });
    assert.equal(last.users.length, 4);
    assert.equal(new Set([...first.users, ...last.users].map(user => user.id)).size, 24);
    const filtered = await get(app, admin, "/api/admin/users?q=%E7%94%B2%E7%BB%84&role=learner&status=disabled&pageSize=1&page=2");
    assert.deepEqual(filtered.pagination, { page: 2, pageSize: 1, total: 2, totalPages: 2 });
    assert.equal(filtered.users.length, 1);
    assert.ok(filtered.users.every(user => user.role === "learner" && user.status === "disabled" && user.displayName.includes("甲组")));
    const accounts = await get(app, admin, "/api/admin/accounts");
    assert.deepEqual(accounts.accounts[0].assignedTo, { id: created[0].id, displayName: created[0].displayName });
    assert.equal(JSON.stringify(accounts).includes("private-account-value"), false);
    assert.equal((await app.request("/api/admin/users", { auth: admin, body: testLearner("duplicate.binding", "7") })).status, 409);
    const empty = await get(app, admin, "/api/admin/users?q=missing-member&page=9");
    assert.deepEqual(empty.pagination, { page: 1, pageSize: 20, total: 0, totalPages: 1 });
    assert.deepEqual(empty.users, []);
  } finally { await app.close(); }
});

test("audit pagination reaches records older than 100 entries and filters the entire history", async () => {
  const app = await start();
  try {
    const admin = await app.setup();
    for (let index = 0; index < 210; index++) app.app.locals.identityStore.audit(
      { displayName: index === 0 ? "历史操作人" : "近期操作人" },
      index === 0 ? "fixture.legacy" : "user.updated",
      index === 0 ? "最早记录" : `成员 ${index}`,
      index === 0 ? "100% complete marker" : "成员更新",
    );
    const first = await get(app, admin, "/api/admin/audit?pageSize=10");
    assert.deepEqual(first.pagination, { page: 1, pageSize: 10, total: 211, totalPages: 22 });
    assert.equal(first.entries.length, 10);
    assert.ok(first.actions.includes("fixture.legacy"), "action choices must include old actions absent from the current page");
    const last = await get(app, admin, "/api/admin/audit?page=22&pageSize=10");
    assert.equal(last.entries.length, 1);
    assert.equal(last.entries[0].action, "system.setup");
    const legacy = await get(app, admin, "/api/admin/audit?action=fixture.legacy&q=marker&page=50");
    assert.deepEqual(legacy.pagination, { page: 1, pageSize: 20, total: 1, totalPages: 1 });
    assert.equal(legacy.entries[0].targetName, "最早记录");
    const literal = await get(app, admin, "/api/admin/audit?q=%25");
    assert.equal(literal.pagination.total, 1, "search treats percent literally rather than as a SQL wildcard");
    const localized = await get(app, admin, `/api/admin/audit?q=${encodeURIComponent("更新用户")}&page=11`);
    assert.equal(localized.pagination.total, 209);
    assert.equal(localized.entries.length, 9);
    const overview = await get(app, admin, "/api/admin/overview");
    assert.equal(overview.recentAudit.length, 8, "overview remains a short preview");
  } finally { await app.close(); }
});

test("announcement pages clamp after deletion while learning continues to receive published announcements", async () => {
  const app = await start();
  try {
    const admin = await app.setup();
    for (let index = 0; index < 23; index++) {
      const response = await app.request("/api/admin/announcements", { auth: admin, body: { title: `${index % 2 === 0 ? "甲组" : "乙组"}通知 ${index}`, body: `第 ${index} 次学习安排` } });
      assert.equal(response.status, 201);
    }
    const first = await get(app, admin, "/api/admin/announcements?pageSize=10");
    const last = await get(app, admin, "/api/admin/announcements?pageSize=10&page=3");
    assert.deepEqual(last.pagination, { page: 3, pageSize: 10, total: 23, totalPages: 3 });
    assert.equal(last.announcements.length, 3);
    assert.equal(first.announcements.some(item => last.announcements.some(other => other.id === item.id)), false);
    const filtered = await get(app, admin, `/api/admin/announcements?q=${encodeURIComponent("甲组")}&pageSize=10&page=2`);
    assert.deepEqual(filtered.pagination, { page: 2, pageSize: 10, total: 12, totalPages: 2 });
    assert.equal(filtered.announcements.length, 2);
    const learning = await app.login("learning");
    assert.equal((await get(app, learning, "/api/learning/announcements")).announcements.length, 23);
    for (const announcement of last.announcements) assert.equal((await app.request(`/api/admin/announcements/${announcement.id}`, { auth: admin, method: "DELETE" })).status, 200);
    const clamped = await get(app, admin, "/api/admin/announcements?pageSize=10&page=3");
    assert.deepEqual(clamped.pagination, { page: 2, pageSize: 10, total: 20, totalPages: 2 });
    assert.equal(clamped.announcements.length, 10);
  } finally { await app.close(); }
});

test("management list queries reject malformed pagination and preserve space authentication", async () => {
  const app = await start();
  try {
    const admin = await app.setup();
    const invalid = ["page=0", "page=-1", "page=1.5", "page=abc", "page=9007199254740992", "page=1&page=2", "pageSize=0", "pageSize=101", "pageSize=1.5", "q=one&q=two", `q=${"x".repeat(161)}`];
    for (const path of ["users", "audit", "announcements"]) for (const query of invalid)
      assert.equal((await app.request(`/api/admin/${path}?${query}`, { auth: admin })).status, 400, `${path}?${query}`);
    for (const query of ["role=owner", "status=other", "role=admin&role=learner"])
      assert.equal((await app.request(`/api/admin/users?${query}`, { auth: admin })).status, 400, query);
    assert.equal((await app.request("/api/admin/audit?action=one&action=two", { auth: admin })).status, 400);
    const learning = await app.login("learning");
    for (const path of ["users", "audit", "announcements"])
      assert.equal((await app.request(`/api/admin/${path}?page=2`, { auth: learning })).status, 401);
  } finally { await app.close(); }
});

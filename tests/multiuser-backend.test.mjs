import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.mjs";

const admin = { username: "admin", password: "administration-123", displayName: "管理员" };
const learner = (username, yybRef) => ({ username, password: "learner-password-123", displayName: username, yybRef });
const fixture = {
  yybRequest: async () => [
    { id: 7, nickname: "学习账号一", status: "alive", openid: "never-return-openid" },
    { id: 8, nickname: "学习账号二", status: "alive" },
    { id: 9, nickname: "未分配账号", status: "alive" },
  ],
  loginPlatform: async (name, account) => ({
    connected: true, token: `private-${account.ref}-${name}`, stuId: `student-${account.ref}`,
    user: name === "math" ? { StuID: `student-${account.ref}`, UserNick: account.nickname } : { userId: `student-${account.ref}`, nickName: account.nickname },
  }),
  computerRequest: async (url, input, platform) => ({ code: 200, data: { userId: platform.user.userId } }),
};

async function start(overrides = {}) {
  const app = createApp({ databasePath: ":memory:", ...fixture, ...overrides });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookieOwners = new Map();
  async function request(route, { cookie, body, method = body ? "POST" : "GET", ...options } = {}) {
    const owner = cookieOwners.get(cookie);
    const response = await fetch(base + route, { ...options, method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}),
        ...(owner ? { "X-Study-User": owner } : {}), ...options.headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (response.ok && ["/api/system/setup", "/api/auth/login", "/api/auth/session"].includes(route)) {
      const session = await response.clone().json();
      const issuedCookie = response.headers.get("set-cookie") || cookie;
      if (issuedCookie && session.user?.id) cookieOwners.set(issuedCookie, session.user.id);
    }
    return response;
  }
  return {
    request, app,
    async setup() {
      const response = await request("/api/system/setup", { body: admin });
      assert.equal(response.status, 201);
      return { cookie: response.headers.get("set-cookie"), session: await response.json() };
    },
    async login(username = admin.username, password = admin.password) {
      const response = await request("/api/auth/login", { body: { username, password } });
      assert.equal(response.status, 200);
      return response.headers.get("set-cookie");
    },
    async close() { await new Promise((resolve) => server.close(resolve)); app.locals.close(); },
  };
}

test("production defaults require independent Web identity before exposing YYB or administrator data", async () => {
  let upstreamReads = 0;
  const app = await start({ yybRequest: async () => { upstreamReads++; return fixture.yybRequest(); } });
  try {
    for (const route of ["/api/auth/accounts", "/api/auth/avatar/7", "/api/admin/users", "/api/study/data", "/api/announcements"])
      assert.equal((await app.request(route)).status, 401, route);
    assert.equal((await app.request("/api/auth/connect", { body: { ref: "7" } })).status, 401);
    assert.equal(upstreamReads, 0);
    assert.deepEqual(await (await app.request("/api/system/setup")).json(), { setupRequired: true });
    const { cookie, session } = await app.setup();
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.equal(session.user.role, "admin");
    assert.equal(session.account, null);
    assert.equal(session.platforms.math.connected, false);
    assert.equal((await app.request("/api/system/setup", { body: admin })).status, 409);
    assert.deepEqual(await (await app.request("/api/system/setup")).json(), { setupRequired: false });
    assert.equal((await app.request("/api/auth/login", { body: { username: admin.username, password: "wrong" } })).status, 401);
    const users = await (await app.request("/api/admin/users", { cookie })).json();
    assert.equal(users.users.length, 1);
    assert.equal(JSON.stringify(users).includes("password"), false);
    assert.equal((await app.request("/api/admin/users", { headers: { origin: "invalid-origin" }, cookie })).status, 403);
  } finally { await app.close(); }
});

test("learner directory, platform connection and management privileges are isolated by assigned identity", async () => {
  const app = await start();
  try {
    const { cookie: adminCookie } = await app.setup();
    const create = async (input) => {
      const response = await app.request("/api/admin/users", { cookie: adminCookie, body: input });
      assert.equal(response.status, 201);
      return (await response.json()).user;
    };
    const first = await create(learner("learner.one", "7"));
    await create(learner("learner.two", "8"));
    const firstCookie = await app.login("learner.one", "learner-password-123");
    const secondCookie = await app.login("learner.two", "learner-password-123");
    const visible = await (await app.request("/api/auth/accounts", { cookie: firstCookie })).json();
    assert.deepEqual(visible.accounts.map((item) => item.ref), ["7"]);
    assert.equal(JSON.stringify(visible).includes("never-return"), false);
    assert.equal((await app.request("/api/auth/avatar/8", { cookie: firstCookie })).status, 403);
    for (const [route, method, body] of [
      ["/api/admin/users", "GET"], ["/api/admin/accounts", "GET"], ["/api/admin/audit", "GET"],
      ["/api/admin/overview", "GET"], ["/api/admin/users", "POST", learner("intruder", "9")],
      [`/api/admin/users/${first.id}`, "PATCH", { role: "admin" }],
    ]) assert.equal((await app.request(route, { cookie: firstCookie, method, body })).status, 403, route);
    assert.equal((await app.request("/api/auth/connect", { cookie: firstCookie, body: { ref: "8" } })).status, 403);
    assert.equal((await app.request("/api/auth/connect", { cookie: adminCookie, body: { ref: "7" } })).status, 409);
    for (const [cookie, ref] of [[firstCookie, "7"], [secondCookie, "8"]]) {
      const connected = await app.request("/api/auth/connect", { cookie, body: { ref } });
      assert.equal(connected.status, 200);
      const freshCookie = connected.headers.get("set-cookie") || cookie;
      const response = await app.request("/api/platform/computer", { cookie: freshCookie, body: { path: "/api/exam/wx/practice/knowledge" } });
      assert.equal((await response.json()).data.userId, `student-${ref}`);
      assert.equal((await (await app.request("/api/auth/session", { cookie: freshCookie })).json()).user.yybRef, ref);
      assert.equal((await (await app.request("/api/auth/session", { cookie })).json()).authenticated, true, "platform connection preserves the independent Web session");
    }
  } finally { await app.close(); }
});

test("learning records belong to the authenticated Web user, reject stale revisions and validate imports", async () => {
  const app = await start();
  try {
    const { cookie } = await app.setup();
    await app.request("/api/admin/users", { cookie, body: learner("student", "7") });
    const learnerCookie = await app.login("student", "learner-password-123");
    const task = { id: "task-one", title: "学习计划", platform: "math", date: "2026-10-29", done: false, createdAt: "2026-10-29T00:00:00.000Z" };
    const data = { tasks: [task], activities: [{ id: "activity-one", title: "章节练习", platform: "computer", type: "practice", at: "2026-10-29T00:00:00.000Z", total: 10, correct: 8, path: "/study/practice" }], goalMinutes: 90 };
    const saved = await app.request("/api/study/data", { method: "PUT", cookie: learnerCookie, body: { data, revision: 0, userId: "another-user" } });
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), { data, revision: 1 });
    const other = await (await app.request("/api/study/data", { cookie })).json();
    assert.deepEqual(other, { data: { tasks: [], activities: [], goalMinutes: 60 }, revision: 0 });
    const stale = await app.request("/api/study/data", { method: "PUT", cookie: learnerCookie, body: { data: { ...data, tasks: [] }, revision: 0 } });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).details.revision, 1);
    for (const invalid of [
      { ...data, tasks: [{ ...task, done: "true" }] },
      { ...data, tasks: [task, task] },
      { ...data, activities: [{ ...data.activities[0], path: "https://external.test" }] },
      { ...data, goalMinutes: 999 },
    ]) assert.equal((await app.request("/api/study/data", { method: "PUT", cookie: learnerCookie, body: { data: invalid, revision: 1 } })).status, 400);
    assert.deepEqual(await (await app.request("/api/study/data", { cookie: learnerCookie })).json(), { data, revision: 1 });
  } finally { await app.close(); }
});

test("administrator lifecycle preserves the last admin, unique bindings and immediate revocation", async () => {
  const app = await start();
  try {
    const { cookie, session } = await app.setup();
    for (const patch of [{ role: "learner" }, { status: "disabled" }])
      assert.equal((await app.request(`/api/admin/users/${session.user.id}`, { method: "PATCH", cookie, body: patch })).status, 409);
    const user = (await (await app.request("/api/admin/users", { cookie, body: learner("student", "7") })).json()).user;
    assert.equal((await app.request("/api/admin/users", { cookie, body: learner("student2", "7") })).status, 409);
    const loggedIn = await app.login("student", "learner-password-123");
    await app.request(`/api/admin/users/${user.id}`, { method: "PATCH", cookie, body: { status: "disabled" } });
    assert.equal((await app.request("/api/study/data", { cookie: loggedIn })).status, 401);
    assert.equal((await app.request("/api/auth/login", { body: { username: "student", password: "learner-password-123" } })).status, 401);
    await app.request(`/api/admin/users/${user.id}`, { method: "PATCH", cookie, body: { status: "active", yybRef: null } });
    const again = await app.login("student", "learner-password-123");
    assert.deepEqual((await (await app.request("/api/auth/accounts", { cookie: again })).json()).accounts, []);
    const reset = await app.request(`/api/admin/users/${user.id}/password`, { cookie, body: { password: "changed-password-123" } });
    assert.equal(reset.status, 200);
    assert.equal((await app.request("/api/study/data", { cookie: again })).status, 401);
    await app.login("student", "changed-password-123");
    const audit = (await (await app.request("/api/admin/audit", { cookie })).json()).entries;
    assert.ok(audit.some((entry) => entry.action === "user.password_reset" && entry.targetName === "student"));
    assert.equal(JSON.stringify(audit).includes("changed-password"), false);
  } finally { await app.close(); }
});

test("a stale tab cannot read or synchronize its previous owner's learning records under another user's shared cookie", async () => {
  const app = await start();
  try {
    const { cookie, session } = await app.setup();
    const second = (await (await app.request("/api/admin/users", { cookie, body: learner("student", "7") })).json()).user;
    const secondCookie = await app.login("student", "learner-password-123");
    const data = { tasks: [], activities: [], goalMinutes: 180 };
    for (const method of ["GET", "PUT"]) {
      const response = await app.request("/api/study/data", { method, cookie: secondCookie,
        headers: { "X-Study-User": session.user.id },
        ...(method === "PUT" ? { body: { data, revision: 0 } } : {}),
      });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, "USER_SCOPE_CHANGED");
    }
    const missing = await app.request("/api/study/data", { cookie: secondCookie, headers: { "X-Study-User": "" } });
    assert.equal(missing.status, 403);
    assert.deepEqual(await (await app.request("/api/study/data", { cookie: secondCookie, headers: { "X-Study-User": second.id } })).json(),
      { data: { tasks: [], activities: [], goalMinutes: 60 }, revision: 0 });
  } finally { await app.close(); }
});

test("role downgrades apply to existing sessions and password resets remove upstream connections", async () => {
  const app = await start();
  try {
    const { cookie } = await app.setup();
    const user = (await (await app.request("/api/admin/users", { cookie, body: { ...learner("secondadmin", "7"), role: "admin" } })).json()).user;
    const secondCookie = await app.login("secondadmin", "learner-password-123");
    await app.request("/api/auth/connect", { cookie: secondCookie, body: { ref: "7" } });
    assert.equal((await app.request("/api/admin/users", { cookie: secondCookie })).status, 200);
    await app.request(`/api/admin/users/${user.id}`, { cookie, method: "PATCH", body: { role: "learner" } });
    assert.equal((await app.request("/api/admin/users", { cookie: secondCookie })).status, 403);
    assert.equal((await (await app.request("/api/auth/session", { cookie: secondCookie })).json()).platforms.math.connected, true);
    await app.request(`/api/admin/users/${user.id}/password`, { cookie, body: { password: "changed-password-123" } });
    assert.equal((await (await app.request("/api/auth/session", { cookie: secondCookie })).json()).authenticated, false);
    const fresh = await app.login("secondadmin", "changed-password-123");
    assert.equal((await (await app.request("/api/auth/session", { cookie: fresh })).json()).platforms.math.connected, false);
  } finally { await app.close(); }
});

test("stale identity headers stop upstream submissions, uploads, management changes and logout before acting as a newly signed-in user", async () => {
  let proxyCalls = 0;
  const app = await start({ computerRequest: async () => { proxyCalls++; return { code: 200 }; } });
  try {
    const { cookie, session } = await app.setup();
    const second = (await (await app.request("/api/admin/users", { cookie, body: { ...learner("secondadmin", "8"), role: "admin" } })).json()).user;
    const newCookie = await app.login("secondadmin", "learner-password-123");
    assert.equal((await app.request("/api/auth/connect", { cookie: newCookie, body: { ref: "8" } })).status, 200);
    for (const [route, method, body] of [
      ["/api/platform/computer", "POST", { path: "/api/exam/wx/practice/submitExam", method: "POST", data: { answers: [] } }],
      ["/api/platform/computer/upload", "POST", {}],
      ["/api/platform/math/photo", "POST", {}],
      ["/api/platform/math/first-score", "POST", {}],
      ["/api/auth/accounts", "GET"],
      ["/api/auth/connect", "POST", { ref: "8" }],
      ["/api/auth/password", "POST", { currentPassword: "learner-password-123", password: "changed-password-123" }],
      ["/api/admin/users", "GET"],
      [`/api/admin/users/${second.id}`, "PATCH", { status: "disabled" }],
      ["/api/auth/logout", "POST", {}],
    ]) {
      const response = await app.request(route, { method, body, cookie: newCookie, headers: { "X-Study-User": session.user.id } });
      assert.equal(response.status, 403, route);
      assert.equal((await response.json()).code, "USER_SCOPE_CHANGED", route);
    }
    assert.equal(proxyCalls, 0);
    assert.equal((await (await app.request("/api/auth/session", { cookie: newCookie })).json()).authenticated, true);
    assert.equal((await (await app.request("/api/auth/session", { cookie: newCookie })).json()).user.status, "active");
  } finally { await app.close(); }
});

test("unassigning a connected learning account invalidates that user's upstream connection", async () => {
  const app = await start();
  try {
    const { cookie } = await app.setup();
    const user = (await (await app.request("/api/admin/users", { cookie, body: learner("student", "7") })).json()).user;
    const loginCookie = await app.login("student", "learner-password-123");
    const connect = await app.request("/api/auth/connect", { cookie: loginCookie, body: { ref: "7" } });
    const connectedCookie = connect.headers.get("set-cookie") || loginCookie;
    await app.request(`/api/admin/users/${user.id}`, { method: "PATCH", cookie, body: { yybRef: "8" } });
    const current = await (await app.request("/api/auth/session", { cookie: connectedCookie })).json();
    assert.equal(current.authenticated, true);
    assert.equal(current.platforms.math.connected, false);
    assert.equal((await app.request("/api/platform/computer", { cookie: connectedCookie, body: { path: "/api/exam/wx/practice/knowledge" } })).status, 401);
  } finally { await app.close(); }
});

test("users can change their own password after verifying it while retaining only their current session", async () => {
  const app = await start();
  try {
    const { cookie } = await app.setup();
    const otherCookie = await app.login();
    const wrong = await app.request("/api/auth/password", { cookie, body: { currentPassword: "wrong", password: "changed-password-123" } });
    assert.equal(wrong.status, 400);
    assert.equal((await app.request("/api/study/data", { cookie: otherCookie })).status, 200);
    const changed = await app.request("/api/auth/password", { cookie, body: { currentPassword: admin.password, password: "changed-password-123" } });
    assert.equal(changed.status, 200);
    assert.equal((await changed.json()).otherSessionsRevoked, true);
    assert.equal((await app.request("/api/study/data", { cookie })).status, 200);
    assert.equal((await app.request("/api/study/data", { cookie: otherCookie })).status, 401);
    assert.equal((await app.request("/api/auth/login", { body: admin })).status, 401);
    await app.login(admin.username, "changed-password-123");
  } finally { await app.close(); }
});

test("announcements are published through the administrator and visible to signed-in learners", async () => {
  const app = await start();
  try {
    const { cookie } = await app.setup();
    await app.request("/api/admin/users", { cookie, body: learner("student", "7") });
    const learnerCookie = await app.login("student", "learner-password-123");
    const published = await app.request("/api/admin/announcements", { cookie, body: { title: "本周学习", body: "完成一套真题" } });
    assert.equal(published.status, 201);
    const { announcement } = await published.json();
    assert.equal((await app.request("/api/admin/announcements", { cookie: learnerCookie, body: { title: "非法", body: "非法" } })).status, 403);
    assert.equal((await (await app.request("/api/announcements", { cookie: learnerCookie })).json()).announcements[0].id, announcement.id);
    const overview = await (await app.request("/api/admin/overview", { cookie })).json();
    assert.equal(overview.stats.users, 2);
    assert.equal(overview.stats.connectedUsers, 0);
    assert.equal((await app.request(`/api/admin/announcements/${announcement.id}`, { method: "DELETE", cookie })).status, 200);
    assert.deepEqual((await (await app.request("/api/announcements", { cookie: learnerCookie })).json()).announcements, []);
  } finally { await app.close(); }
});

test("SQLite preserves identities, login sessions and learning data across restarts without retaining upstream tokens", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "study-users-"));
  const databasePath = path.join(directory, "study.sqlite");
  let app = await start({ databasePath });
  try {
    const { cookie } = await app.setup();
    const connected = await app.request("/api/auth/connect", { cookie, body: { ref: "9" } });
    const persistentCookie = connected.headers.get("set-cookie") || cookie;
    assert.equal(connected.status, 200);
    const data = { tasks: [], activities: [], goalMinutes: 120 };
    await app.request("/api/study/data", { method: "PUT", cookie: persistentCookie, body: { data, revision: 0 } });
    await app.close();
    const bytes = readFileSync(databasePath).toString("utf8");
    assert.equal(bytes.includes(admin.password), false);
    assert.equal(bytes.includes(persistentCookie.split(";")[0].split("=")[1]), false);
    assert.equal(bytes.includes("private-9-"), false);
    app = await start({ databasePath });
    const session = await (await app.request("/api/auth/session", { cookie: persistentCookie })).json();
    assert.equal(session.authenticated, true);
    assert.equal(session.user.role, "admin");
    assert.equal(session.user.yybRef, "9");
    assert.equal(session.platforms.math.connected, false);
    assert.deepEqual(await (await app.request("/api/study/data", { cookie: persistentCookie })).json(), { data, revision: 1 });
  } finally { await app.close(); rmSync(directory, { recursive: true, force: true }); }
});

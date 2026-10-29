import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startHttpApp, testAdmin as admin, testLearner as learner } from "./http-app.mjs";

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
  mathRequest: async () => ({ SuccessResponse: true, data: [] }),
  probe: async ({ target }) => ({ target, ok: true, checkedAt: new Date().toISOString(), checks: [{ name: "fixture connection", ok: true, message: "test fixture only" }] }),
};
const start = (overrides = {}) => startHttpApp({ ...fixture, ...overrides });
const emptyData = () => ({ tasks: [], activities: [], goalMinutes: 60 });
const session = async (app, auth, space = auth.space) => (await app.request(`/api/${space}/auth/session`, { auth })).json();
const connect = (app, auth, ref) => app.request("/api/learning/auth/connect", { auth, body: { ref } });
const createAndLogin = async (app, administrator, username = "student", ref = "7", role = "learner") => {
  const user = await app.createUser(administrator, learner(username, ref, { role }));
  const auth = await app.login("learning", username, "learner-password-123");
  return { user, auth };
};

test("production defaults expose distinct application sessions and reject anonymous protected routes", async () => {
  let upstreamReads = 0;
  const app = await start({ yybRequest: async () => { upstreamReads++; return fixture.yybRequest(); } });
  try {
    for (const route of ["/api/learning/auth/accounts", "/api/learning/auth/avatar/7", "/api/admin/users", "/api/learning/study/data", "/api/learning/announcements", "/api/admin/configuration"])
      assert.equal((await app.request(route)).status, 401, route);
    assert.equal((await app.request("/api/learning/auth/connect", { body: { ref: "7" } })).status, 401);
    assert.equal(upstreamReads, 0);
    assert.deepEqual(await (await app.request("/api/system/setup")).json(), { setupRequired: true });
    const administrator = await app.setup();
    assert.match(administrator.setCookie, /^study_admin_session=/);
    assert.match(administrator.setCookie, /Path=\/api\/admin(?:;|$)/);
    assert.match(administrator.setCookie, /HttpOnly/);
    assert.match(administrator.setCookie, /SameSite=Lax/);
    assert.equal(administrator.session.space, "admin");
    assert.equal(administrator.session.user.role, "admin");
    assert.equal(administrator.session.platforms, undefined);
    assert.equal(administrator.session.account, undefined);
    assert.equal((await app.request("/api/system/setup", { body: admin })).status, 409);
    assert.deepEqual(await (await app.request("/api/system/setup")).json(), { setupRequired: false });
    assert.equal((await app.request("/api/admin/auth/login", { body: { username: admin.username, password: "wrong" } })).status, 401);
    const users = await (await app.request("/api/admin/users", { auth: administrator })).json();
    assert.equal(users.users.length, 1);
    assert.equal(JSON.stringify(users).includes("password"), false);
    assert.equal((await app.request("/api/admin/users", { headers: { origin: "invalid-origin" }, auth: administrator })).status, 403);
    for (const route of ["/api/auth/session", "/api/auth/accounts", "/api/platform/computer", "/api/study/data"])
      assert.equal((await app.request(route)).status, 404, "removed mixed-space route remains unavailable");
  } finally { await app.close(); }
});

test("management and learning login cookies and logout lifecycles remain independent", async () => {
  const app = await start();
  try {
    const administrator = await app.setup();
    const learning = await app.login("learning");
    assert.match(learning.setCookie, /^study_learning_session=/);
    assert.match(learning.setCookie, /Path=\/api\/learning(?:;|$)/);
    assert.equal(learning.session.space, "learning");
    assert.equal(learning.session.platforms.math.connected, false);
    assert.equal((await session(app, administrator)).authenticated, true);
    assert.equal((await session(app, learning)).authenticated, true);
    const bothCookies = `${administrator.cookie}; ${learning.cookie}`;
    const logout = await app.request("/api/admin/auth/logout", { auth: administrator, method: "POST", headers: { cookie: bothCookies } });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /study_admin_session=; Path=\/api\/admin/);
    assert.equal((await session(app, administrator)).authenticated, false);
    assert.equal((await session(app, learning)).authenticated, true);
    const nextAdmin = await app.login("admin");
    assert.equal((await app.request("/api/learning/auth/logout", { auth: learning, method: "POST" })).status, 200);
    assert.equal((await session(app, learning)).authenticated, false);
    assert.equal((await session(app, nextAdmin)).authenticated, true);
  } finally { await app.close(); }
});

test("a token issued to one space cannot be reused across spaces even with a renamed cookie", async () => {
  const app = await start();
  try {
    const administrator = await app.setup();
    const learning = await app.login("learning");
    for (const [source, target, route] of [[administrator, "learning", "/api/learning/study/data"], [learning, "admin", "/api/admin/configuration"]]) {
      const cookie = source.cookie.replace(/^study_(?:admin|learning)_session=/, `study_${target}_session=`);
      const denied = await app.request(route, { auth: source, headers: { cookie } });
      assert.equal(denied.status, 401, route);
      assert.equal((await session(app, { ...source, cookie }, target)).authenticated, false);
    }
  } finally { await app.close(); }
});

test("learner roles cannot log into management and learning sessions see only allocated YYB accounts", async () => {
  const app = await start();
  try {
    const administrator = await app.setup();
    const first = await createAndLogin(app, administrator, "learner.one", "7");
    const second = await createAndLogin(app, administrator, "learner.two", "8");
    const forbiddenLogin = await app.request("/api/admin/auth/login", { body: { username: "learner.one", password: "learner-password-123" } });
    assert.equal(forbiddenLogin.status, 403);
    assert.equal(forbiddenLogin.headers.get("set-cookie"), null);
    const directory = await (await app.request("/api/learning/auth/accounts", { auth: first.auth })).json();
    assert.deepEqual(directory.accounts.map(account => account.ref), ["7"]);
    assert.equal(JSON.stringify(directory).includes("never-return"), false);
    assert.equal((await app.request("/api/learning/auth/avatar/8", { auth: first.auth })).status, 403);
    for (const route of ["/api/admin/users", "/api/admin/accounts", "/api/admin/overview", "/api/admin/audit", "/api/admin/configuration"])
      assert.equal((await app.request(route, { auth: first.auth })).status, 401, "a learning cookie never authenticates management");
    assert.equal((await connect(app, first.auth, "8")).status, 403);
    for (const { auth, user } of [first, second]) {
      const connected = await connect(app, auth, user.yybRef);
      assert.equal(connected.status, 200);
      assert.equal(connected.headers.get("set-cookie"), null, "connecting does not replace a Web login");
      const response = await app.request("/api/learning/platform/computer", { auth, body: { path: "/api/exam/wx/practice/knowledge" } });
      assert.equal((await response.json()).data.userId, `student-${user.yybRef}`);
      assert.equal((await session(app, auth)).user.yybRef, user.yybRef);
    }
    const administrativeDirectory = await (await app.request("/api/admin/accounts", { auth: administrator })).json();
    assert.equal(administrativeDirectory.accounts.length, 3);
  } finally { await app.close(); }
});

test("administrators entering learning have no directory or connection bypass", async () => {
  const app = await start();
  try {
    const administrator = await app.setup();
    const learning = await app.login("learning");
    assert.deepEqual((await (await app.request("/api/learning/auth/accounts", { auth: learning })).json()).accounts, []);
    assert.equal((await connect(app, learning, "9")).status, 403);
    const assignment = await app.request(`/api/admin/users/${administrator.userId}`, { auth: administrator, method: "PATCH", body: { yybRef: "9" } });
    assert.equal(assignment.status, 200);
    const directory = await (await app.request("/api/learning/auth/accounts", { auth: learning })).json();
    assert.deepEqual(directory.accounts.map(account => account.ref), ["9"]);
    assert.equal((await connect(app, learning, "7")).status, 403);
    assert.equal((await connect(app, learning, "9")).status, 200);
  } finally { await app.close(); }
});

test("learning records remain owned by the learning principal with revision and import validation", async () => {
  const app = await start();
  try {
    const administrator = await app.setup();
    const first = await createAndLogin(app, administrator);
    const second = await createAndLogin(app, administrator, "other.student", "8");
    const task = { id: "task-one", title: "学习计划", platform: "math", date: "2026-10-29", done: false, createdAt: "2026-10-29T00:00:00.000Z" };
    const data = { tasks: [task], activities: [{ id: "activity-one", title: "章节练习", platform: "computer", type: "practice", at: "2026-10-29T00:00:00.000Z", total: 10, correct: 8, path: "/study/practice" }], goalMinutes: 90 };
    const saved = await app.request("/api/learning/study/data", { auth: first.auth, method: "PUT", body: { data, revision: 0, userId: second.user.id } });
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), { data, revision: 1 });
    assert.deepEqual(await (await app.request("/api/learning/study/data", { auth: second.auth })).json(), { data: emptyData(), revision: 0 });
    const stale = await app.request("/api/learning/study/data", { auth: first.auth, method: "PUT", body: { data: { ...data, tasks: [] }, revision: 0 } });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).details.revision, 1);
    for (const invalid of [{ ...data, tasks: [{ ...task, done: "true" }] }, { ...data, tasks: [task, task] }, { ...data, activities: [{ ...data.activities[0], path: "https://external.test" }] }, { ...data, goalMinutes: 999 }])
      assert.equal((await app.request("/api/learning/study/data", { auth: first.auth, method: "PUT", body: { data: invalid, revision: 1 } })).status, 400);
    assert.deepEqual(await (await app.request("/api/learning/study/data", { auth: first.auth })).json(), { data, revision: 1 });
  } finally { await app.close(); }
});

test("the last administrator and unique account assignments are enforced through management", async () => {
  const app = await start();
  try {
    const administrator = await app.setup();
    for (const patch of [{ role: "learner" }, { status: "disabled" }])
      assert.equal((await app.request(`/api/admin/users/${administrator.userId}`, { auth: administrator, method: "PATCH", body: patch })).status, 409);
    const { user, auth } = await createAndLogin(app, administrator);
    assert.equal((await app.request("/api/admin/users", { auth: administrator, body: learner("duplicate", "7") })).status, 409);
    await connect(app, auth, "7");
    assert.equal((await app.request(`/api/admin/users/${user.id}`, { auth: administrator, method: "PATCH", body: { yybRef: "8" } })).status, 200);
    const updated = await session(app, auth);
    assert.equal(updated.authenticated, true);
    assert.equal(updated.platforms.math.connected, false);
    assert.equal((await app.request("/api/learning/platform/computer", { auth, body: { path: "/api/exam/wx/practice/knowledge" } })).status, 401);
    await app.request(`/api/admin/users/${user.id}`, { auth: administrator, method: "PATCH", body: { yybRef: null } });
    assert.deepEqual((await (await app.request("/api/learning/auth/accounts", { auth })).json()).accounts, []);
    assert.equal((await connect(app, auth, "8")).status, 403);
  } finally { await app.close(); }
});

test("disabling users and resetting passwords revoke both spaces and upstream connections immediately", async () => {
  const app = await start();
  try {
    const administrator = await app.setup();
    const second = await createAndLogin(app, administrator, "second.admin", "7", "admin");
    const management = await app.login("admin", "second.admin", "learner-password-123");
    await connect(app, second.auth, "7");
    await app.request(`/api/admin/users/${second.user.id}`, { auth: administrator, method: "PATCH", body: { status: "disabled" } });
    assert.equal((await session(app, second.auth)).authenticated, false);
    assert.equal((await session(app, management)).authenticated, false);
    assert.equal((await app.request("/api/learning/auth/login", { body: { username: "second.admin", password: "learner-password-123" } })).status, 401);
    await app.request(`/api/admin/users/${second.user.id}`, { auth: administrator, method: "PATCH", body: { status: "active" } });
    const freshLearning = await app.login("learning", "second.admin", "learner-password-123");
    const freshAdmin = await app.login("admin", "second.admin", "learner-password-123");
    assert.equal((await session(app, freshLearning)).platforms.math.connected, false);
    await connect(app, freshLearning, "7");
    assert.equal((await app.request(`/api/admin/users/${second.user.id}/password`, { auth: administrator, body: { password: "changed-password-123" } })).status, 200);
    assert.equal((await session(app, freshLearning)).authenticated, false);
    assert.equal((await session(app, freshAdmin)).authenticated, false);
    const reset = await app.login("learning", "second.admin", "changed-password-123");
    assert.equal((await session(app, reset)).platforms.math.connected, false);
    const audit = (await (await app.request("/api/admin/audit", { auth: administrator })).json()).entries;
    assert.ok(audit.some(entry => entry.action === "user.password_reset" && entry.targetName === "second.admin"));
    assert.equal(JSON.stringify(audit).includes("changed-password"), false);
  } finally { await app.close(); }
});

test("administrator demotion immediately removes management access while learning retains its own session", async () => {
  const app = await start();
  try {
    const administrator = await app.setup();
    const second = await createAndLogin(app, administrator, "second.admin", "7", "admin");
    const management = await app.login("admin", "second.admin", "learner-password-123");
    await connect(app, second.auth, "7");
    await app.request(`/api/admin/users/${second.user.id}`, { auth: administrator, method: "PATCH", body: { role: "learner" } });
    assert.equal((await app.request("/api/admin/users", { auth: management })).status, 401);
    assert.equal((await session(app, management)).authenticated, false);
    assert.equal((await session(app, second.auth)).platforms.math.connected, true);
    assert.equal((await session(app, second.auth)).user.role, "learner");
  } finally { await app.close(); }
});

test("stale principal headers stop reads, submissions, uploads, management changes, passwords and logout", async () => {
  let proxyCalls = 0;
  const app = await start({ computerRequest: async () => { proxyCalls++; return { code: 200 }; } });
  try {
    const administrator = await app.setup();
    const second = await createAndLogin(app, administrator, "second.admin", "8", "admin");
    const management = await app.login("admin", "second.admin", "learner-password-123");
    await connect(app, second.auth, "8");
    for (const [route, auth, method, body] of [
      ["/api/learning/study/data", second.auth, "GET"],
      ["/api/learning/study/data", second.auth, "PUT", { data: emptyData(), revision: 0 }],
      ["/api/learning/platform/computer", second.auth, "POST", { path: "/api/exam/wx/practice/submitExam", method: "POST", data: { answers: [] } }],
      ["/api/learning/platform/computer/upload", second.auth, "POST", {}],
      ["/api/learning/platform/math/photo", second.auth, "POST", {}],
      ["/api/learning/platform/math/first-score", second.auth, "POST", {}],
      ["/api/learning/auth/accounts", second.auth, "GET"],
      ["/api/learning/auth/connect", second.auth, "POST", { ref: "8" }],
      ["/api/learning/auth/password", second.auth, "POST", { currentPassword: "learner-password-123", password: "changed-password-123" }],
      ["/api/admin/users", management, "GET"],
      [`/api/admin/users/${second.user.id}`, management, "PATCH", { status: "disabled" }],
      ["/api/admin/configuration", management, "PUT", { revision: 0, config: {} }],
      ["/api/admin/auth/logout", management, "POST", {}],
      ["/api/learning/auth/logout", second.auth, "POST", {}],
    ]) {
      const response = await app.request(route, { auth, method, body, headers: { "X-Study-User": administrator.userId } });
      assert.equal(response.status, 403, route);
      assert.equal((await response.json()).code, "USER_SCOPE_CHANGED", route);
    }
    assert.equal(proxyCalls, 0);
    assert.equal((await session(app, second.auth)).authenticated, true);
    assert.equal((await session(app, management)).authenticated, true);
    assert.deepEqual(await (await app.request("/api/learning/study/data", { auth: second.auth })).json(), { data: emptyData(), revision: 0 });
    assert.equal((await app.request("/api/learning/study/data", { auth: second.auth, headers: { "X-Study-User": "" } })).status, 403);
  } finally { await app.close(); }
});

test("personal password changes verify the old password and revoke other sessions in either space", async () => {
  const app = await start();
  try {
    const administrator = await app.setup();
    const otherManagement = await app.login("admin");
    const learning = await app.login("learning");
    assert.equal((await app.request("/api/admin/auth/password", { auth: administrator, body: { currentPassword: "wrong", password: "changed-password-123" } })).status, 400);
    assert.equal((await session(app, learning)).authenticated, true);
    const changed = await app.request("/api/admin/auth/password", { auth: administrator, body: { currentPassword: admin.password, password: "changed-password-123" } });
    assert.equal(changed.status, 200);
    assert.equal((await changed.json()).otherSessionsRevoked, true);
    assert.equal((await session(app, administrator)).authenticated, true);
    assert.equal((await session(app, otherManagement)).authenticated, false);
    assert.equal((await session(app, learning)).authenticated, false);
    assert.equal((await app.request("/api/admin/auth/login", { body: admin })).status, 401);
    await app.login("admin", admin.username, "changed-password-123");
    await app.login("learning", admin.username, "changed-password-123");
  } finally { await app.close(); }
});

test("configuration is management-only, never returns credentials and invalidates affected learning connections", async () => {
  const app = await start();
  try {
    const administrator = await app.setup();
    const student = await createAndLogin(app, administrator);
    await connect(app, student.auth, "7");
    const initial = await (await app.request("/api/admin/configuration", { auth: administrator })).json();
    const update = await app.request("/api/admin/configuration", { auth: administrator, method: "PUT", body: {
      revision: initial.revision, config: { yyb: { apiKey: "known-admin-secret" }, math: { ocrUsername: "known-ocr-user", ocrPassword: "known-ocr-password" } },
    } });
    assert.equal(update.status, 200);
    const value = await update.json();
    assert.equal(value.secretStatus["yyb.apiKey"], true);
    assert.equal(value.secretStatus["math.ocrPassword"], true);
    assert.equal(JSON.stringify(value).includes("known-"), false);
    assert.deepEqual(value.affectedPlatforms.sort(), ["computer", "math"]);
    const current = await session(app, student.auth);
    assert.equal(current.platforms.math.connected, false);
    assert.equal(current.platforms.computer.connected, false);
    assert.equal(JSON.stringify(current).includes("known-"), false);
    assert.equal((await app.request("/api/admin/configuration", { auth: student.auth })).status, 401);
    assert.equal((await app.request("/api/learning/configuration", { auth: student.auth })).status, 404);
    assert.equal((await app.request("/api/admin/configuration", { auth: administrator, method: "PUT", body: { revision: initial.revision, config: {} } })).status, 409);
    const disable = await app.request("/api/admin/configuration", { auth: administrator, method: "PUT", body: { revision: value.revision, config: { computer: { enabled: false } } } });
    assert.equal(disable.status, 200);
    assert.equal((await connect(app, student.auth, "7")).status, 200);
    assert.equal((await session(app, student.auth)).platforms.computer.connected, false);
    assert.equal((await session(app, student.auth)).platforms.math.connected, true);
    const audit = (await (await app.request("/api/admin/audit", { auth: administrator })).json()).entries;
    assert.ok(audit.some(entry => entry.action === "configuration.updated"));
    assert.equal(JSON.stringify(audit).includes("known-"), false);
  } finally { await app.close(); }
});

test("announcements are managed in the management space and read from learning", async () => {
  const app = await start();
  try {
    const administrator = await app.setup();
    const { auth } = await createAndLogin(app, administrator);
    const published = await app.request("/api/admin/announcements", { auth: administrator, body: { title: "本周学习", body: "完成一套真题" } });
    assert.equal(published.status, 201);
    const { announcement } = await published.json();
    assert.equal((await app.request("/api/admin/announcements", { auth, body: { title: "非法", body: "非法" } })).status, 401);
    assert.equal((await (await app.request("/api/learning/announcements", { auth })).json()).announcements[0].id, announcement.id);
    const overview = await (await app.request("/api/admin/overview", { auth: administrator })).json();
    assert.equal(overview.stats.users, 2);
    assert.equal(overview.stats.connectedUsers, 0);
    assert.equal((await app.request(`/api/admin/announcements/${announcement.id}`, { auth: administrator, method: "DELETE" })).status, 200);
    assert.deepEqual((await (await app.request("/api/learning/announcements", { auth })).json()).announcements, []);
  } finally { await app.close(); }
});

test("SQLite persists space-bound sessions, users, settings and study data without persisting upstream tokens", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "study-spaces-"));
  const databasePath = path.join(directory, "identity.sqlite");
  let app = await start({ databasePath });
  let closed = false;
  try {
    const administrator = await app.setup();
    await app.request(`/api/admin/users/${administrator.userId}`, { auth: administrator, method: "PATCH", body: { yybRef: "9" } });
    const learning = await app.login("learning");
    assert.equal((await connect(app, learning, "9")).status, 200);
    const data = { tasks: [], activities: [], goalMinutes: 120 };
    await app.request("/api/learning/study/data", { auth: learning, method: "PUT", body: { data, revision: 0 } });
    const initial = await (await app.request("/api/admin/configuration", { auth: administrator })).json();
    await app.request("/api/admin/configuration", { auth: administrator, method: "PUT", body: { revision: initial.revision, config: { math: { stationId: 5 } } } });
    await app.close(); closed = true;
    const bytes = readFileSync(databasePath).toString("utf8");
    assert.equal(bytes.includes(admin.password), false);
    assert.equal(bytes.includes(administrator.cookie.split("=")[1]), false);
    assert.equal(bytes.includes(learning.cookie.split("=")[1]), false);
    assert.equal(bytes.includes("private-9-"), false);
    app = await start({ databasePath }); closed = false;
    assert.equal((await session(app, administrator)).authenticated, true);
    const current = await session(app, learning);
    assert.equal(current.authenticated, true);
    assert.equal(current.user.yybRef, "9");
    assert.equal(current.platforms.math.connected, false);
    assert.deepEqual(await (await app.request("/api/learning/study/data", { auth: learning })).json(), { data, revision: 1 });
    assert.equal((await (await app.request("/api/admin/configuration", { auth: administrator })).json()).config.math.stationId, 5);
  } finally { if (!closed) await app.close(); rmSync(directory, { recursive: true, force: true }); }
});

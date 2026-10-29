import test from "node:test";
import assert from "node:assert/strict";
import { startHttpApp, testAdmin as admin, testLearner as learner } from "../support/http-app.mjs";

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
const createAndLogin = async (app, administrator, username = "student", ref = "7", role = "learner") => {
  const user = await app.createUser(administrator, learner(username, ref, { role }));
  const auth = await app.login("learning", username, "learner-password-123");
  return { user, auth };
};

test("production defaults expose distinct application sessions and reject anonymous protected routes", async () => {
  let upstreamReads = 0;
  const app = await start({ yybRequest: async () => { upstreamReads++; return fixture.yybRequest(); } });
  try {
    for (const route of ["/api/admin/users", "/api/learning/study/data", "/api/learning/announcements", "/api/admin/configuration"])
      assert.equal((await app.request(route)).status, 401, route);
    assert.equal((await app.request("/api/learning/auth/connect", { body: { ref: "7" } })).status, 404);
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

test("learners cannot manage accounts and resource access is automatic after Web login",async()=>{
  const calls=[];const app=await start({loginPlatform:async(name,account)=>{calls.push({name,ref:account.ref});return fixture.loginPlatform(name,account);}});
  try{
    const admin=await app.setup(),first=await createAndLogin(app,admin,"learner.one","7"),second=await createAndLogin(app,admin,"learner.two","8");
    assert.equal(calls.length,0);
    assert.equal((await app.request('/api/admin/auth/login',{body:{username:'learner.one',password:'learner-password-123'}})).status,403);
    for(const route of ['/api/admin/users','/api/admin/accounts','/api/admin/overview','/api/admin/audit','/api/admin/configuration'])assert.equal((await app.request(route,{auth:first.auth})).status,401);
    for(const {auth}of [first,second]){
      const response=await app.request('/api/learning/platform/computer',{auth,body:{path:'/api/exam/wx/practice/knowledge'}});assert.equal(response.status,200);
      assert.equal((await response.json()).data.userId,undefined);
      const value=await session(app,auth);assert.equal(value.platforms.computer.user.userId,auth.userId);assert.equal(value.account,null);
    }
    assert.deepEqual(calls.map(row=>row.ref),['7','8']);
  }finally{await app.close();}
});

test("administrators entering learning have a local identity and use the configured pool only for missing resources",async()=>{
  const calls=[];const app=await start({loginPlatform:async(name,account)=>{calls.push(account.ref);return fixture.loginPlatform(name,account);}});
  try{
    const admin=await app.setup();await app.request(`/api/admin/users/${admin.userId}`,{auth:admin,method:'PATCH',body:{yybRef:'9'}});
    const learning=await app.login('learning');assert.equal(calls.length,0);assert.equal(learning.session.platforms.math.user.StuID,learning.userId);
    assert.equal((await app.request('/api/learning/platform/computer',{auth:learning,body:{path:'/api/exam/wx/practice/knowledge'}})).status,200);assert.deepEqual(calls,['9']);
  }finally{await app.close();}
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

test("the last administrator is retained and source assignment changes never invalidate Web identity",async()=>{
 const app=await start();try{
  const admin=await app.setup();for(const patch of [{role:'learner'},{status:'disabled'}])assert.equal((await app.request(`/api/admin/users/${admin.userId}`,{auth:admin,method:'PATCH',body:patch})).status,409);
  const {user,auth}=await createAndLogin(app,admin);assert.equal((await app.request('/api/admin/users',{auth:admin,body:learner('duplicate','7')})).status,201);
  await app.request(`/api/admin/users/${user.id}`,{auth:admin,method:'PATCH',body:{yybRef:'8'}});
  const changed=await session(app,auth);assert.equal(changed.authenticated,true);assert.equal(changed.platforms.math.user.StuID,user.id);assert.equal(changed.platforms.computer.available,true);
  assert.equal((await app.request('/api/learning/platform/computer',{auth,body:{path:'/api/exam/wx/practice/knowledge'}})).status,200);
 }finally{await app.close();}
});

test("disabling users and resetting passwords revoke both spaces and upstream connections immediately", async () => {
  const app = await start();
  try {
    const administrator = await app.setup();
    const second = await createAndLogin(app, administrator, "second.admin", "7", "admin");
    const management = await app.login("admin", "second.admin", "learner-password-123");
    await app.request(`/api/admin/users/${second.user.id}`, { auth: administrator, method: "PATCH", body: { status: "disabled" } });
    assert.equal((await session(app, second.auth)).authenticated, false);
    assert.equal((await session(app, management)).authenticated, false);
    assert.equal((await app.request("/api/learning/auth/login", { body: { username: "second.admin", password: "learner-password-123" } })).status, 401);
    await app.request(`/api/admin/users/${second.user.id}`, { auth: administrator, method: "PATCH", body: { status: "active" } });
    const freshLearning = await app.login("learning", "second.admin", "learner-password-123");
    const freshAdmin = await app.login("admin", "second.admin", "learner-password-123");
    assert.equal((await session(app, freshLearning)).platforms.math.connected, false);
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
    await app.request(`/api/admin/users/${second.user.id}`, { auth: administrator, method: "PATCH", body: { role: "learner" } });
    assert.equal((await app.request("/api/admin/users", { auth: management })).status, 401);
    assert.equal((await session(app, management)).authenticated, false);
    assert.equal((await session(app, second.auth)).platforms.math.available, true);
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
    for (const [route, auth, method, body] of [
      ["/api/learning/study/data", second.auth, "GET"],
      ["/api/learning/study/data", second.auth, "PUT", { data: emptyData(), revision: 0 }],
      ["/api/learning/platform/computer", second.auth, "POST", { path: "/api/exam/wx/practice/submitExam", method: "POST", data: { answers: [] } }],
      ["/api/learning/platform/computer/upload", second.auth, "POST", {}],
      ["/api/learning/platform/math/photo", second.auth, "POST", {}],
      ["/api/learning/platform/math/first-score", second.auth, "POST", {}],
      ["/api/learning/auth/accounts", second.auth, "GET"],
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
    assert.equal((await session(app, student.auth)).platforms.computer.connected, false);
    assert.equal((await session(app, student.auth)).platforms.math.available, true);
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

test("PostgreSQL persists space-bound sessions, users, settings and study data without persisting upstream tokens", async () => {
  const { createDatabase } = await import('../../server/infrastructure/database.mjs');
  const { randomUUID } = await import('node:crypto');
  const schemaPrefix = `test_${randomUUID().replaceAll('-', '')}`;
  let database = await createDatabase({ schemaPrefix });
  let app = await start({ database });
  let closed = false;
  try {
    const administrator = await app.setup();
    await app.request(`/api/admin/users/${administrator.userId}`, { auth: administrator, method: "PATCH", body: { yybRef: "9" } });
    const learning = await app.login("learning");
    assert.equal((await app.request("/api/learning/platform/computer", { auth: learning, body: { path: "/api/exam/wx/practice/knowledge", query: { majorId: "subject", examType: 3 } } })).status, 200);
    const data = { tasks: [], activities: [], goalMinutes: 120 };
    await app.request("/api/learning/study/data", { auth: learning, method: "PUT", body: { data, revision: 0 } });
    const initial = await (await app.request("/api/admin/configuration", { auth: administrator })).json();
    await app.request("/api/admin/configuration", { auth: administrator, method: "PUT", body: { revision: initial.revision, config: { math: { stationId: 5 } } } });
    const tables = (await database.query('SELECT table_name FROM information_schema.tables WHERE table_schema=$1', [database.webSchema])).rows;
    const serialized = JSON.stringify(await Promise.all(tables.map(async row => (await database.query(`SELECT row_to_json(r) AS data FROM ${database.web(row.table_name)} r`)).rows)));
    assert.equal(serialized.includes(admin.password), false);
    assert.equal(serialized.includes(administrator.cookie.split("=")[1]), false);
    assert.equal(serialized.includes(learning.cookie.split("=")[1]), false);
    assert.equal(serialized.includes("private-9-"), false);
    await app.close(); closed = true;
    database = await createDatabase({ schemaPrefix });
    app = await start({ database }); closed = false;
    assert.equal((await session(app, administrator)).authenticated, true);
    const current = await session(app, learning);
    assert.equal(current.authenticated, true);
    assert.equal(current.user.yybRef, undefined);
    assert.equal(current.platforms.math.user.StuID,learning.userId);
    assert.equal(current.platforms.math.connected, false);
    assert.deepEqual(await (await app.request("/api/learning/study/data", { auth: learning })).json(), { data, revision: 1 });
    assert.equal((await (await app.request("/api/admin/configuration", { auth: administrator })).json()).config.math.stationId, 5);
  } finally {
    if (closed) database = await createDatabase({ schemaPrefix });
    await database.drop();
    if (!closed) await app.close(); else await database.close();
  }
});

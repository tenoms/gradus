import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { startHttpApp, testLearner } from "./http-app.mjs";
import { createPlatformConfigStore, readPlatformDefaults } from "../server/platform-config.mjs";
import { ApiError } from "../server/upstream.mjs";

function fixture() {
  const calls = [];
  let expire = false;
  const configuration = createPlatformConfigStore({ filename: ":memory:", defaults: readPlatformDefaults({ env: { YYB_BASE_URL: "https://system-yyb.test", YYB_API_KEY: "system-private-key" }, readLocal: false }) });
  return {
    calls, configuration,
    expire: () => { expire = true; },
    requestJson: async (input, options = {}) => {
      const url = new URL(input);
      calls.push({ url, options });
      if (url.pathname === "/accounts") return { code: 0, data: [{ id: "same-ref", nickname: "学习账号", status: "alive" }, { id: "other-ref", nickname: "另一账号", status: "alive" }] };
      if (url.pathname === "/wxapp/getCode") return { code: 0, data: { code: `code-from-${url.host}` } };
      if (url.pathname.endsWith("GetListByAll")) return { SuccessResponse: true, data: [{ Parm3: "1" }] };
      if (url.pathname.includes("CheckCode")) return { data: { SysUserInfo: { StuID: "fixture-student" } } };
      if (url.pathname === "/api/OAuth2/Login") return { Data: { access_token: "math-private-token", User: { StuID: "fixture-student" } } };
      if (url.pathname === "/api/auth/wx/token") return { access_token: "computer-private-token" };
      if (url.pathname === "/api/user/wx/user/detail") return { code: 200, data: { userId: "fixture-user" } };
      if (url.pathname === "/api/exam/wx/practice/knowledge" && expire) { expire = false; throw new ApiError("expired", 401); }
      return { code: 200, SuccessResponse: true, data: [] };
    },
  };
}
const get = async (app, auth, route) => {
  const response = await app.request(route, { auth });
  assert.equal(response.status, 200);
  return response.json();
};
const settings = (app, auth, body) => app.request("/api/learning/account/yyb", { auth, method: "PUT", body });
const connect = (app, auth, ref = "same-ref") => app.request("/api/learning/auth/connect", { auth, body: { ref } });
async function learner(app, admin, name) {
  await app.createUser(admin, testLearner(name, ""));
  return app.login("learning", name, "learner-password-123");
}

test("own YYB directories, selection and two-platform login stay scoped to each owner without system credentials", async () => {
  const f = fixture(), app = await startHttpApp(f);
  try {
    const admin = await app.setup();
    await app.request(`/api/admin/users/${admin.userId}`, { auth: admin, method: "PATCH", body: { yybRef: "same-ref" } });
    const system = await app.login("learning");
    const first = await learner(app, admin, "own.first"), second = await learner(app, admin, "own.second");
    assert.equal((await app.request("/api/learning/account/yyb")).status, 401);
    assert.equal((await settings(app, first, { mode: "custom", baseUrl: "https://first-yyb.test/", apiKey: "first-private-key" })).status, 200);
    assert.equal((await settings(app, second, { mode: "custom", baseUrl: "https://second-yyb.test" })).status, 200);
    assert.deepEqual((await get(app, system, "/api/learning/auth/accounts")).accounts.map(a => a.ref), ["same-ref"]);
    assert.equal((await connect(app, system, "other-ref")).status, 403);
    for (const auth of [first, second]) {
      assert.equal((await get(app, auth, "/api/learning/auth/accounts")).accounts.length, 2);
      const connected = await connect(app, auth);
      assert.equal(connected.status, 200);
      const value = await connected.json();
      assert.equal(value.platforms.math.connected, true);
      assert.equal(value.platforms.computer.connected, true);
      assert.equal(value.user.yyb.ref, "same-ref");
      assert.equal(value.user.yybRef, "");
      assert.equal(JSON.stringify(value).includes("private-key"), false);
      assert.equal((await get(app, auth, "/api/learning/auth/session")).platforms.math.connected, true);
    }
    const ownCalls = f.calls.filter(call => /first-yyb|second-yyb/.test(call.url.host));
    assert.ok(ownCalls.some(call => call.url.pathname === "/accounts"));
    assert.equal(ownCalls.filter(call => call.url.pathname === "/wxapp/getCode").length, 4);
    for (const call of ownCalls) assert.equal(call.options.headers.Authorization, call.url.host === "first-yyb.test" ? "Bearer first-private-key" : undefined);
    const users = (await get(app, admin, "/api/admin/users")).users;
    const metadata = users.find(user => user.id === first.userId).yyb;
    assert.deepEqual(metadata, { mode: "custom", baseUrl: "https://first-yyb.test", apiKeyConfigured: true, ref: "same-ref" });
    assert.equal(JSON.stringify(users).includes("private-key"), false);
  } finally { await app.close(); }
});

test("endpoint changes clear selection and credentials, refresh uses the owner, and global YYB changes leave own connections intact", async () => {
  const f = fixture(), app = await startHttpApp(f);
  try {
    const admin = await app.setup(), own = await learner(app, admin, "own.refresh");
    await settings(app, own, { mode: "custom", baseUrl: "https://owner-yyb.test", apiKey: "owner-private-key" });
    assert.equal((await connect(app, own)).status, 200);
    f.expire();
    const read = await app.request("/api/learning/platform/computer", { auth: own, body: { path: "/api/exam/wx/practice/knowledge", query: { majorId: "subject" } } });
    assert.equal(read.status, 200);
    const retry = f.calls.filter(call => call.url.pathname === "/wxapp/getCode").at(-1);
    assert.equal(retry.url.host, "owner-yyb.test");
    assert.equal(retry.options.headers.Authorization, "Bearer owner-private-key");
    assert.equal((await app.request(`/api/admin/users/${own.userId}`, { auth: admin, method: "PATCH", body: { displayName: "新的名称" } })).status, 200);
    assert.equal((await get(app, own, "/api/learning/auth/session")).platforms.computer.connected, true);
    assert.equal((await app.request("/api/admin/configuration", { auth: admin, method: "PUT", body: { revision: 0, config: { yyb: { baseUrl: "https://changed-system.test" } } } })).status, 200);
    assert.equal((await get(app, own, "/api/learning/auth/session")).platforms.math.connected, true);
    const retained = await settings(app, own, { mode: "custom", baseUrl: "https://owner-yyb.test/", apiKey: "" });
    assert.equal((await retained.json()).apiKeyConfigured, true);
    await connect(app, own);
    const changed = await settings(app, own, { mode: "custom", baseUrl: "https://new-owner.test/" });
    assert.deepEqual(await changed.json(), { mode: "custom", baseUrl: "https://new-owner.test", apiKeyConfigured: false, ref: "" });
    assert.equal((await get(app, own, "/api/learning/auth/session")).platforms.math.connected, false);
    await get(app, own, "/api/learning/auth/accounts");
    assert.equal(f.calls.at(-1).url.host, "new-owner.test");
    assert.equal(f.calls.at(-1).options.headers.Authorization, undefined);
    assert.equal((await connect(app, own)).status, 200);
    await settings(app, own, { mode: "system" });
    assert.deepEqual((await get(app, own, "/api/learning/auth/accounts")).accounts, []);
    assert.equal((await connect(app, own)).status, 403);
  } finally { await app.close(); }
});

test("avatar requests use the user's endpoint and key rather than the system source", async () => {
  const avatars = [];
  const upstream = createServer((req, res) => { avatars.push({ url: req.url, authorization: req.headers.authorization }); res.writeHead(200, { "content-type": "image/png" }); res.end(Buffer.from([137, 80, 78, 71])); });
  upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
  const endpoint = `http://127.0.0.1:${upstream.address().port}`;
  const f = fixture(), app = await startHttpApp(f);
  try {
    const admin = await app.setup(), own = await learner(app, admin, "own.avatar");
    await settings(app, own, { mode: "custom", baseUrl: endpoint, apiKey: "avatar-private-key" });
    const avatar = await app.request("/api/learning/auth/avatar/same-ref", { auth: own });
    assert.equal(avatar.status, 200);
    assert.equal(avatar.headers.get("content-type"), "image/png");
    assert.deepEqual(avatars, [{ url: "/accounts/avatar?ref=same-ref", authorization: "Bearer avatar-private-key" }]);
  } finally { await app.close(); await new Promise(resolve => upstream.close(resolve)); }
});

test("personal YYB settings persist privately and reject invalid endpoints or cross-user writes", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "study-own-yyb-")), databasePath = path.join(folder, "identity.sqlite");
  let f = fixture(), app = await startHttpApp({ ...f, databasePath });
  try {
    const admin = await app.setup(), own = await learner(app, admin, "own.durable"), other = await learner(app, admin, "own.other");
    for (const baseUrl of ["", "ftp://wrong.test", "https://name:password@wrong.test", "https://wrong.test?secret=1", "https://wrong.test/#fragment"]) {
      assert.equal((await settings(app, own, { mode: "custom", baseUrl })).status, 400);
    }
    await settings(app, own, { mode: "custom", baseUrl: "https://private-yyb.test", apiKey: "durable-private-key", userId: other.userId });
    await connect(app, own, "other-ref");
    assert.equal((await get(app, other, "/api/learning/account/yyb")).mode, "system");
    assert.equal((await stat(databasePath)).mode & 0o777, 0o600);
    await app.close();
    f = fixture(); app = await startHttpApp({ ...f, databasePath });
    const reconnected = await app.login("learning", "own.durable", "learner-password-123");
    assert.deepEqual(await get(app, reconnected, "/api/learning/account/yyb"), { mode: "custom", baseUrl: "https://private-yyb.test", apiKeyConfigured: true, ref: "other-ref" });
    assert.equal((await connect(app, reconnected, "other-ref")).status, 200);
    const directory = f.calls.find(call => call.url.pathname === "/accounts");
    assert.equal(directory.options.headers.Authorization, "Bearer durable-private-key");
    const cleared = await settings(app, reconnected, { clearApiKey: true });
    assert.equal((await cleared.json()).apiKeyConfigured, false);
  } finally { await app.close(); await rm(folder, { recursive: true, force: true }); }
});

test("math phone-binding and WeChat business errors remain visible without reporting a connected identity", async () => {
  const f = fixture(), transport = f.requestJson;
  let check = { errcode: 0, ErrorCodeValue: 0, errmsg: "需绑定手机号码" };
  const app = await startHttpApp({ ...f, requestJson: (url, options) => new URL(url).pathname.includes("CheckCode") ? Promise.resolve(check) : transport(url, options) });
  try {
    const admin = await app.setup(), own = await learner(app, admin, "own.unbound");
    await settings(app, own, { mode: "custom", baseUrl: "https://owner-yyb.test" });
    let result = await (await connect(app, own)).json();
    assert.equal(result.platforms.computer.connected, true);
    assert.equal(result.platforms.math.connected, false);
    assert.match(result.platforms.math.error, /需绑定手机号码.*数学小程序.*重新连接/);
    check = { errcode: 40029, errmsg: "invalid code" };
    result = await (await connect(app, own)).json();
    assert.equal(result.platforms.math.connected, false);
    assert.match(result.platforms.math.error, /invalid code.*40029/);
    check = { msg: "登陆成功", data: { SysUserInfo: {} } };
    result = await (await connect(app, own)).json();
    assert.equal(result.platforms.math.connected, false);
    assert.match(result.platforms.math.error, /未返回学习身份/);
    assert.doesNotMatch(result.platforms.math.error, /^登陆成功/);
  } finally { await app.close(); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import { readPlatformDefaults } from "../server/platform-config.mjs";
import { startHttpApp } from "./http-app.mjs";

function configuredStore() {
  const defaults = readPlatformDefaults({ env: { YYB_BASE_URL: "https://yyb.original.test" }, readLocal: false });
  return defaults;
}
function transport(calls) {
  return async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.pathname === "/accounts") return { code: 0, data: [{ id: "bound-account", nickname: "fixture" }] };
    if (url.pathname === "/wxapp/getCode") return { code: 0, data: { code: "fixture-code" } };
    if (url.pathname.endsWith("GetListByAll")) return { SuccessResponse: true, data: [{ Parm3: "1" }] };
    if (url.pathname.includes("CheckCode")) return { data: { SysUserInfo: { StuID: "fixture-student" } } };
    if (url.pathname === "/api/OAuth2/Login") return { Data: { access_token: "math-private-token", User: { StuID: "fixture-student" } } };
    if (url.pathname === "/api/auth/wx/token") return { access_token: "computer-private-token" };
    if (url.pathname === "/api/user/wx/user/detail") return { code: 200, data: { userId: "fixture-user" } };
    if (url.pathname === "/api/exam/wx/course/get_play_info/v2") {
      const cipher = createCipheriv("aes-128-cbc", Buffer.from("1234567890abcdef"), Buffer.from("fedcba0987654321"));
      return { code: 200, data: { mediaList: [{ playURL: Buffer.concat([cipher.update("https://media.test/authorized.m3u8"), cipher.final()]).toString("base64") }] } };
    }
    return { code: 200, SuccessResponse: true, data: [] };
  };
}
async function assignAndLogin(app, admin) {
  const assigned = await app.request(`/api/admin/users/${admin.userId}`, { auth: admin, method: "PATCH", body: { yybRef: "bound-account" } });
  assert.equal(assigned.status, 200);
  const learning = await app.login("learning");
  return learning;
}
async function readResources(app, auth) {
  for (const [name, path] of [["math", "/api/question_list/GetQuestionByQuestionNew"], ["computer", "/api/exam/wx/practice/knowledge"]]) {
    assert.equal((await app.request(`/api/learning/platform/${name}`, { auth, body: { path, query: { ID: 42, majorId: "fixture", examType: 3 } } })).status, 200);
  }
}
async function photo(app, auth) {
  const form = new FormData();
  form.set("image", new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), "fixture.png");
  return fetch(`${app.base}/api/learning/platform/math/photo`, { method: "POST", headers: { cookie: auth.cookie, "X-Study-User": auth.userId }, body: form });
}

test("saved management configuration reaches YYB login, uploads and OCR instead of fixed environment values", async () => {
  const calls = [];
  const app = await startHttpApp({ configurationDefaults: configuredStore(), requestJson: transport(calls) });
  try {
    const admin = await app.setup();
    const saved = await app.request("/api/admin/configuration", { auth: admin, method: "PUT", body: { revision: 0, config: {
      yyb: { baseUrl: "https://yyb.saved.test", apiKey: "saved-yyb-secret" },
      math: { baseUrl: "https://math.saved.test", appId: "wx1111111111111111", stationId: 9, loginId: 8, ocrUrl: "https://ocr.saved.test/recognize", ocrUsername: "saved-ocr-user", ocrPassword: "saved-ocr-password" },
      computer: { baseUrl: "https://computer.saved.test", appId: "wx2222222222222222", tenantCode: "saved-tenant", oauthClientId: "saved-client", oauthClientSecret: "saved-oauth-secret", videoKey: "1234567890abcdef", videoIv: "fedcba0987654321" },
    } } });
    assert.equal(saved.status, 200);
    const learning = await assignAndLogin(app, admin);
    assert.equal(calls.length, 0, "Web login does not contact the resource source");
    await readResources(app, learning);
    const codeRequests = calls.filter(call => call.url.pathname === "/wxapp/getCode");
    assert.deepEqual(codeRequests.map(call => JSON.parse(call.options.body).app_id).sort(), ["wx1111111111111111", "wx2222222222222222"]);
    assert.ok(codeRequests.every(call => call.url.host === "yyb.saved.test" && call.options.headers.Authorization === "Bearer saved-yyb-secret"));
    const check = calls.find(call => call.url.pathname.includes("CheckCode"));
    assert.equal(check.url.host, "math.saved.test");
    assert.equal(check.url.searchParams.get("Id"), "8");
    assert.equal(calls.find(call => call.url.pathname.endsWith("GetListByAll")).url.searchParams.get("System_Station_ID"), "9");
    const oauth = calls.find(call => call.url.pathname === "/api/auth/wx/token");
    assert.equal(oauth.url.host, "computer.saved.test");
    assert.equal(oauth.options.headers["Tenant-Code"], "saved-tenant");
    assert.equal(oauth.options.headers.Authorization, `Basic ${Buffer.from("saved-client:saved-oauth-secret").toString("base64")}`);
    const upload = (name, path) => app.request(`/api/learning/platform/${name}/upload?path=${encodeURIComponent(path)}`, { auth: learning, method: "POST", body: Buffer.from("fixture-body"), headers: { "content-type": "multipart/form-data; boundary=fixture" } });
    assert.equal((await upload("math", "/api/sys_attachment/UpFile")).status, 200);
    assert.equal(calls.at(-1).url.host, "math.saved.test");
    assert.equal((await upload("computer", "/api/user/v1/attachment/upload/")).status, 200);
    assert.equal(calls.at(-1).url.host, "computer.saved.test");
    assert.equal(calls.at(-1).options.headers["Tenant-Code"], "saved-tenant");
    assert.equal((await upload("computer", "/api/exam/wx/searchExercise/text/similarity")).status, 200);
    assert.equal(calls.at(-1).options.headers["Tenant-Code"], "2", "this original protocol uses its own tenant");
    assert.equal((await photo(app, learning)).status, 200);
    assert.equal(calls.at(-1).url.href, "https://ocr.saved.test/recognize");
    assert.equal(calls.at(-1).options.body.get("username"), "saved-ocr-user");
    assert.equal(calls.at(-1).options.body.get("password"), "saved-ocr-password");
  } finally { await app.close(); }
});

test("cleared credentials stay cleared while disabled sources preserve the Web learning identity", async () => {
  const calls = [];
  const app = await startHttpApp({ configurationDefaults: configuredStore(), requestJson: transport(calls) });
  try {
    const admin = await app.setup();
    const first = await app.request("/api/admin/configuration", { auth: admin, method: "PUT", body: { revision: 0, config: {
      yyb: { apiKey: "stored-yyb-secret" }, math: { ocrUsername: "stored-user", ocrPassword: "stored-password" },
      computer: { videoKey: "1234567890abcdef", videoIv: "fedcba0987654321" },
    } } });
    assert.equal(first.status, 200);
    const learning = await assignAndLogin(app, admin);
    assert.equal(calls.length, 0, "Web login does not contact the resource source");
    await readResources(app, learning);
    const cleared = await app.request("/api/admin/configuration", { auth: admin, method: "PUT", body: { revision: 1, config: {}, clearSecrets: ["yyb.apiKey", "math.ocrUsername", "math.ocrPassword", "computer.oauthClientSecret", "computer.videoKey"] } });
    assert.equal(cleared.status, 200);
    const value = await cleared.json();
    for (const key of ["yyb.apiKey", "math.ocrUsername", "math.ocrPassword", "computer.oauthClientSecret", "computer.videoKey"]) assert.equal(value.secretStatus[key], false);
    const current = await (await app.request("/api/learning/auth/session", { auth: learning })).json();
    assert.equal(current.platforms.math.connected, false);
    assert.equal(current.platforms.computer.connected, false);
    assert.equal(current.platforms.math.available, true);
    assert.equal(current.platforms.computer.available, true);
    assert.equal(current.platforms.math.user.StuID, learning.userId);
    await readResources(app, learning);
    const directory = calls.filter(call => call.url.pathname === "/accounts").at(-1);
    assert.equal(directory.options.headers.Authorization, undefined);
    const oauth = calls.filter(call => call.url.pathname === "/api/auth/wx/token").at(-1);
    assert.equal(oauth.options.headers.Authorization, `Basic ${Buffer.from("web_app:").toString("base64")}`);
    const before = calls.length;
    assert.equal((await photo(app, learning)).status, 503);
    assert.equal(calls.length, before, "missing OCR credentials stop before any upload");
    const playback = await app.request("/api/learning/platform/computer", { auth: learning, body: { path: "/api/exam/wx/course/get_play_info/v2" } });
    assert.equal(playback.status, 503, "a cleared playback key must not fall back to local defaults");
    const disabled = await app.request("/api/admin/configuration", { auth: admin, method: "PUT", body: { revision: 2, config: { math: { enabled: false }, computer: { enabled: false } } } });
    assert.equal(disabled.status, 200);
    const afterDisable = calls.length;
    const upload = await app.request("/api/learning/platform/computer/upload?path=%2Fapi%2Fuser%2Fv1%2Fattachment%2Fupload%2F", { auth: learning, method: "POST", body: Buffer.from("fixture-body"), headers: { "content-type": "multipart/form-data; boundary=fixture" } });
    assert.equal(upload.status, 503);
    assert.equal(calls.length, afterDisable);
  } finally { await app.close(); }
});

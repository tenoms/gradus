import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPlatformConfigStore, readPlatformDefaults } from "../../server/integrations/platform-config.mjs";
import { ApiError } from "../../server/infrastructure/api-error.mjs";
import { createUpstreamClient } from "../../server/integrations/upstream.mjs";
import { createTestDatabase } from "../support/database.mjs";

const defaults = () => readPlatformDefaults({ env: { YYB_BASE_URL: "https://yyb.test", YYB_API_KEY: "yyb-test-secret" }, configFile: false });
const memory = async () => {
  const database = await createTestDatabase();
  const store = await createPlatformConfigStore({ database, defaults: defaults() });
  return { ...store, database, close: () => database.close() };
};

test("public configuration hides every credential while empty fields preserve and explicit clears remove them", async () => {
  const store = await memory();
  try {
    const first = store.publicConfig();
    assert.equal(first.secretStatus["yyb.apiKey"], true);
    assert.equal(first.config.yyb.apiKey, undefined);
    assert.equal(JSON.stringify(first).includes("yyb-test-secret"), false);
    const second = await store.update({ revision: first.revision, config: { math: { ocrUsername: "ocr-user", ocrPassword: "ocr-secret" }, computer: { videoKey: "1234567890abcdef", videoIv: "fedcba0987654321" } } });
    assert.deepEqual(second.affectedPlatforms, ["math", "computer"]);
    assert.equal(second.secretStatus["math.ocrPassword"], true);
    assert.equal(JSON.stringify(second).includes("ocr-secret"), false);
    const unchanged = await store.update({ revision: second.revision, config: { math: { ocrPassword: "" } } });
    assert.equal(unchanged.revision, second.revision);
    assert.equal(store.snapshot().math.ocrPassword, "ocr-secret");
    const cleared = await store.update({ revision: unchanged.revision, config: {}, clearSecrets: ["math.ocrPassword"] });
    assert.equal(cleared.secretStatus["math.ocrPassword"], false);
    assert.equal(store.snapshot().math.ocrPassword, "");
    await assert.rejects(() => store.update({ revision: cleared.revision, config: { yyb: { apiKey: "new-secret" } }, clearSecrets: ["yyb.apiKey"] }), { status: 400 });
    assert.equal(store.snapshot().yyb.apiKey, "yyb-test-secret");
  } finally { await store.close(); }
});

test("configuration updates persist and reject stale admin revisions across PostgreSQL clients", async () => {
  const database = await createTestDatabase();
  let store = await createPlatformConfigStore({ database, defaults: defaults() });
  try {
    const updated = await store.update({ revision: 0, config: { yyb: { baseUrl: "https://changed.test/" } } });
    assert.deepEqual(updated.affectedPlatforms, ["math", "computer"]);
    assert.equal(updated.config.yyb.baseUrl, "https://changed.test");
    await assert.rejects(() => store.update({ revision: 0, config: { math: { enabled: false } } }), { status: 409 });
    await store.close();
    store = await createPlatformConfigStore({ database, defaults: { ...defaults(), yyb: { baseUrl: "https://ignored.test", apiKey: "ignored" } } });
    assert.equal(store.publicConfig().revision, 1);
    assert.equal(store.snapshot().yyb.baseUrl, "https://changed.test");
    assert.equal(store.snapshot().yyb.apiKey, "yyb-test-secret");
    const copy = store.snapshot(); copy.math.enabled = false;
    assert.equal(store.snapshot().math.enabled, true);
  } finally { await database.close(); }
});

test("deployment files seed new stores once and cannot restore credentials cleared in management", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "study-platform-store-"));
  const configFile = path.join(directory, "deployment.json");
  const database = await createTestDatabase();
  try {
    writeFileSync(configFile, JSON.stringify({ platforms: { yyb: { baseUrl: "https://file-source.test", apiKey: "file-key" }, math: { ocrPassword: "file-password" } } }));
    const first = await createPlatformConfigStore({ database, env: {}, configFile });
    assert.equal(first.snapshot().yyb.apiKey, "file-key");
    await first.update({ revision: 0, config: {}, clearSecrets: ["yyb.apiKey", "math.ocrPassword"] });
    writeFileSync(configFile, JSON.stringify({ platforms: { yyb: { baseUrl: "https://replacement-source.test", apiKey: "replacement-key" }, math: { ocrPassword: "replacement-password" } } }));
    const restarted = await createPlatformConfigStore({ database, env: { YYB_API_KEY: "environment-key" }, configFile });
    assert.equal(restarted.snapshot().yyb.baseUrl, "https://file-source.test");
    assert.equal(restarted.snapshot().yyb.apiKey, "");
    assert.equal(restarted.snapshot().math.ocrPassword, "");
    assert.equal(restarted.publicConfig().revision, 1);
  } finally { await database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("invalid platform fields cannot partially save a configuration", async () => {
  const store = await memory();
  try {
    for (const config of [
      { math: { stationId: 0 } }, { math: { loginId: 1.2 } }, { math: { enabled: "false" } },
      { yyb: { baseUrl: "file:///etc/passwd" } }, { yyb: { baseUrl: "https://user:password@example.test" } },
      { computer: { videoKey: "short" } }, { computer: { tenantCode: "" } },
      { computer: { appId: "not-an-app-id" } }, { math: { unexpected: "value" } },
    ]) await assert.rejects(() => store.update({ revision: 0, config }), { status: 400 });
    await assert.rejects(() => store.update({ revision: 0, config: {}, clearSecrets: ["math.baseUrl"] }), { status: 400 });
    assert.equal(store.publicConfig().revision, 0);
  } finally { await store.close(); }
});

test("the same upstream client immediately uses saved endpoints, tenant settings and enabled state", async () => {
  const store = await memory(); const seen = [];
  const client = createUpstreamClient(() => store.snapshot(), { requestJson: async (url, options) => { seen.push({ url: String(url), options }); return { code: 200, data: [] }; } });
  try {
    await client.computerRequest("/api/test");
    assert.match(seen.at(-1).url, /^https:\/\/teach\.computer-upstream\.invalid/);
    await store.update({ revision: 0, config: { computer: { baseUrl: "https://computer.new", tenantCode: "changed" } } });
    await client.computerRequest("/api/test");
    assert.equal(new URL(seen.at(-1).url).host, "computer.new");
    assert.equal(seen.at(-1).options.headers["Tenant-Code"], "changed");
    await store.update({ revision: 1, config: { computer: { enabled: false } } });
    const calls = seen.length;
    await assert.rejects(client.computerRequest("/api/test"), { status: 503 });
    await assert.rejects(client.loginPlatform("computer", { ref: "test" }), { status: 503 });
    assert.equal(seen.length, calls);
  } finally { await store.close(); }
});

test("configured application identities, OAuth credentials and math station settings are used throughout login", async () => {
  const config = defaults();
  config.math.appId = "wx1111111111111111"; config.math.stationId = 7; config.math.loginId = 8;
  config.computer.appId = "wx2222222222222222"; config.computer.tenantCode = "tenant-test";
  config.computer.oauthClientId = "configured-client"; config.computer.oauthClientSecret = "configured-secret";
  const seen = [];
  const client = createUpstreamClient(() => config, { requestJson: async (input, options) => {
    const url = new URL(input); seen.push({ url, options });
    if (url.pathname === "/wxapp/getCode") return { code: 0, data: { code: "test-login-code" } };
    if (url.pathname.endsWith("GetListByAll")) return { SuccessResponse: true, data: [{ Parm3: "1" }] };
    if (url.pathname.includes("CheckCode")) return { data: { SysUserInfo: { StuID: "test-student" } } };
    if (url.pathname === "/api/OAuth2/Login") return { Data: { access_token: "test-math-token", User: { StuID: "test-student" } } };
    if (url.pathname === "/api/auth/wx/token") return { access_token: "test-computer-token" };
    if (url.pathname === "/api/user/wx/user/detail") return { code: 200, data: { userId: "test-user" } };
    throw new Error("unexpected request");
  } });
  await client.loginPlatform("math", { ref: "fixture-ref" });
  await client.loginPlatform("computer", { ref: "fixture-ref" });
  const codeCalls = seen.filter(call => call.url.pathname === "/wxapp/getCode");
  assert.deepEqual(codeCalls.map(call => JSON.parse(call.options.body).app_id), [config.math.appId, config.computer.appId]);
  assert.equal(seen.find(call => call.url.pathname.endsWith("GetListByAll")).url.searchParams.get("System_Station_ID"), "7");
  assert.equal(seen.find(call => call.url.pathname.endsWith("CheckCodeVT2")).url.searchParams.get("Id"), "8");
  const oauth = seen.find(call => call.url.pathname === "/api/auth/wx/token");
  assert.equal(oauth.options.headers.Authorization, `Basic ${Buffer.from("configured-client:configured-secret").toString("base64")}`);
  assert.equal(oauth.options.headers["Tenant-Code"], "tenant-test");
});

test("runtime video decryption uses this client's saved key instead of global environment", async () => {
  const config = defaults(); config.computer.videoKey = "1234567890abcdef"; config.computer.videoIv = "fedcba0987654321";
  const cipher = createCipheriv("aes-128-cbc", Buffer.from(config.computer.videoKey), Buffer.from(config.computer.videoIv));
  const encrypted = Buffer.concat([cipher.update("https://media.test/authorized.m3u8"), cipher.final()]).toString("base64");
  const client = createUpstreamClient(() => config, { requestJson: async () => ({ code: 200, data: { mediaList: [{ playURL: encrypted }] } }) });
  const result = await client.computerRequest("/api/exam/wx/course/get_play_info/v2");
  assert.equal(result.data.mediaList[0].playURL, "https://media.test/authorized.m3u8");
});

test("runtime math station overrides browser query and encrypted command station fields without mutating callers", async () => {
  const config = defaults(); config.math.stationId = 9;
  const seen = [];
  const client = createUpstreamClient(() => config, { requestJson: async (url, options) => { seen.push({ url: new URL(url), options }); return { SuccessResponse: true, data: [] }; } });
  const input = { method: "GET", query: { System_Station_ID: 1 }, data: { System_Station_ID: 1 } };
  await client.mathRequest("/api/example", input);
  assert.deepEqual(seen[0].url.searchParams.getAll("System_Station_ID"), ["9", "9"]);
  assert.equal(input.query.System_Station_ID, 1);
  const parameters = { System_Station_ID: 1, StuID: "student" };
  for (const data of [parameters, JSON.stringify(parameters)]) {
    await client.mathRequest("/api/Master/AutoModel", { method: "POST", data: { command: "GetUserInfoByStuID", data } });
    const encrypted = seen.at(-1).options.body.get("data");
    const key = Buffer.from(createHash("md5").update("D").digest("hex"));
    const decipher = createDecipheriv("aes-256-cbc", key, Buffer.from("59b87344b54f3197"));
    const decoded = Buffer.concat([decipher.update(encrypted, "base64"), decipher.final()]).toString();
    assert.equal(JSON.parse(JSON.parse(decoded)).System_Station_ID, 9);
  }
  assert.equal(parameters.System_Station_ID, 1);
});

test("math form requests serialize null and undefined as empty fields while preserving actual values and structured fields", async () => {
  let form;
  const client = createUpstreamClient(defaults(), { requestJson: async (_url, options) => { form = options.body; return { SuccessResponse: true }; } });
  await client.mathRequest("/api/sys_users/Inner_sys_users", { method: "POST", data: {
    nullable: null, omitted: undefined, zero: 0, falseValue: false, empty: "",
    details: { title: "内容", optional: null }, values: [1, null],
  } });
  assert.equal(form.get("nullable"), "");
  assert.equal(form.get("omitted"), "");
  assert.equal(form.get("zero"), "0");
  assert.equal(form.get("falseValue"), "false");
  assert.equal(form.get("empty"), "");
  assert.deepEqual(JSON.parse(form.get("details")), { title: "内容", optional: null });
  assert.deepEqual(JSON.parse(form.get("values")), [1, null]);
});

test("connection probes distinguish anonymous reachability from account verification and expose no credentials", async () => {
  const config = defaults();
  const client = createUpstreamClient(() => config, { requestJson: async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname === "/health") return { code: 0, data: { ok: true } };
    if (url.pathname === "/accounts") return { code: 0, data: [{ id: "fixture-ref", nickname: "private-name" }] };
    if (url.pathname === "/wxapp/getCode") return { code: 0, data: { code: "private-login-code" } };
    if (url.pathname.endsWith("GetListByAll")) return { SuccessResponse: true, data: [{ Parm3: "1" }] };
    if (url.pathname.includes("CheckCode")) return { data: { SysUserInfo: { StuID: "private-student" } } };
    if (url.pathname === "/api/OAuth2/Login") return { Data: { access_token: "private-math-token", User: { StuID: "private-student" } } };
    if (url.pathname === "/api/auth/wx/token") return { access_token: "private-computer-token" };
    if (url.pathname === "/api/Master/AutoModel") return { SuccessResponse: true, data: [[{ StuID: "private-student" }]] };
    if (url.pathname === "/api/user/wx/user/detail") {
      if (!options.headers.Authorization) throw new ApiError("authentication required", 401);
      return { code: 200, data: { userId: "private-user" } };
    }
    throw new Error("unexpected request");
  } });
  const anonymous = await client.probe({ target: "all" });
  assert.equal(anonymous.ok, true);
  assert.equal(anonymous.checks.length, 4);
  const withAccount = await client.probe({ target: "all", ref: "fixture-ref" });
  assert.equal(withAccount.ok, true);
  assert.equal(withAccount.checks.length, 6);
  const serialized = JSON.stringify(withAccount);
  for (const secret of ["fixture-ref", "private-name", "private-login-code", "private-student", "private-math-token", "private-computer-token", "yyb-test-secret"])
    assert.equal(serialized.includes(secret), false);
});

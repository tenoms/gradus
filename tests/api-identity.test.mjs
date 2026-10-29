import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

// Transform the actual source: ApiError uses parameter properties that strip-only mode cannot erase.
const source = stripTypeScriptTypes(readFileSync(new URL("../src/shared/api/client.ts", import.meta.url), "utf8"), { mode: "transform" });
const { catalogResource, invalidateCatalogResources, api, studyFetch, setApiIdentity, configureApiSpace, getSession, resolveApiPath, ApiError } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json" },
});

beforeEach(() => {
  globalThis.window = new EventTarget();
  setApiIdentity(undefined);
  configureApiSpace("learning");
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  setApiIdentity(undefined);
  configureApiSpace("learning");
});

test("JSON requests carry the identity displayed to the caller together with cookies and caller headers", async () => {
  let sent;
  globalThis.fetch = async (path, options) => { sent = { path, ...options }; return json({ saved: true }); };
  setApiIdentity("user-a");
  const result = await api("/api/study/data", {
    method: "PUT", body: JSON.stringify({ revision: 1 }), headers: new Headers({ "X-Request-Label": "save-plan" }),
  });
  assert.deepEqual(result, { saved: true });
  assert.equal(sent.path, "/api/learning/study/data");
  assert.equal(new Headers(sent.headers).get("X-Study-User"), "user-a");
  assert.equal(new Headers(sent.headers).get("X-Request-Label"), "save-plan");
  assert.equal(new Headers(sent.headers).get("Content-Type"), "application/json");
  assert.equal(sent.credentials, "same-origin");
});

test("multipart uploads carry identity without setting a Content-Type that would break the browser's boundary", async () => {
  let sent;
  globalThis.fetch = async (path, options) => { sent = { path, ...options }; return json({ uploaded: true }); };
  const form = new FormData();
  form.append("file", new Blob(["image-bytes"], { type: "image/png" }), "answer.png");
  setApiIdentity("user-a");
  const response = await studyFetch("/api/platform/math/upload", { method: "POST", body: form });
  assert.deepEqual(await response.json(), { uploaded: true });
  assert.equal(sent.path, "/api/learning/platform/math/upload");
  assert.equal(sent.body, form);
  assert.equal(new Headers(sent.headers).get("X-Study-User"), "user-a");
  assert.equal(new Headers(sent.headers).has("Content-Type"), false);
  assert.equal(sent.credentials, "same-origin");
});

test("an operation with an explicit owner retains that owner even after global identity has changed", async () => {
  let sent;
  globalThis.fetch = async (path, options) => { sent = options; return json({ error: "账号已切换", code: "USER_SCOPE_CHANGED" }, 403); };
  setApiIdentity("user-b");
  await assert.rejects(api("/api/study/data", { headers: { "X-Study-User": "user-a" } }), { status: 403 });
  assert.equal(new Headers(sent.headers).get("X-Study-User"), "user-a");
});

test("initial login can be sent before a Web identity exists", async () => {
  let sent;
  globalThis.fetch = async (path, options) => { sent = options; return json({ authenticated: true, user: { id: "new-user" } }); };
  await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "student", password: "password-123" }) });
  assert.equal(new Headers(sent.headers).has("X-Study-User"), false);
});

for (const [name, invoke] of [["api", api], ["studyFetch", studyFetch]]) {
  test(`${name} rejects a response for a previous identity when accounts switch during the request`, async () => {
    const network = deferred();
    let sent;
    globalThis.fetch = (path, options) => { sent = options; return network.promise; };
    let expiredEvents = 0;
    window.addEventListener("study-session-expired", () => { expiredEvents++; });
    setApiIdentity("user-a");
    const pending = invoke("/api/platform/computer");
    setApiIdentity("user-b");
    network.resolve(json({ error: "previous user's session expired" }, 401));
    await assert.rejects(pending, /账号已切换/);
    assert.equal(new Headers(sent.headers).get("X-Study-User"), "user-a");
    assert.equal(expiredEvents, 0, "an old request must not expire the newly signed-in user's session");
  });
}

test("api rejects old private data if identity changes while the response body is being read", async () => {
  const reading = deferred();
  const body = deferred();
  globalThis.fetch = async () => ({ ok: true, status: 200, json: () => { reading.resolve(); return body.promise; } });
  setApiIdentity("user-a");
  const pending = api("/api/study/data");
  await reading.promise;
  setApiIdentity("user-b");
  body.resolve({ privateRecords: ["user-a's plan"] });
  await assert.rejects(pending, /账号已切换/);
});

test("a scope mismatch dispatches identity refresh and preserves the response body for error handling", async () => {
  let identityEvents = 0;
  window.addEventListener("study-identity-changed", () => { identityEvents++; });
  globalThis.fetch = async () => json({ error: "请刷新学习空间", code: "USER_SCOPE_CHANGED" }, 403);
  setApiIdentity("user-a");
  const raw = await studyFetch("/api/platform/math/upload");
  assert.equal(raw.status, 403);
  assert.equal((await raw.json()).code, "USER_SCOPE_CHANGED");
  assert.equal(identityEvents, 1);
  await assert.rejects(api("/api/study/data"), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 403);
    assert.equal(error.data.code, "USER_SCOPE_CHANGED");
    return true;
  });
  assert.equal(identityEvents, 2);
});

test("an ordinary permission denial does not trigger an identity-change refresh loop", async () => {
  let identityEvents = 0;
  window.addEventListener("study-identity-changed", () => { identityEvents++; });
  globalThis.fetch = async () => json({ error: "需要管理员权限" }, 403);
  setApiIdentity("learner");
  await assert.rejects(api("/api/admin/users"), { status: 403 });
  assert.equal(identityEvents, 0);
});

test("studyFetch rejects an obsolete request if identity changes while a forbidden response is being inspected", async () => {
  const reading = deferred();
  const body = deferred();
  let identityEvents = 0;
  window.addEventListener("study-identity-changed", () => { identityEvents++; });
  globalThis.fetch = async () => ({
    ok: false, status: 403,
    clone: () => ({ json: () => { reading.resolve(); return body.promise; } }),
  });
  setApiIdentity("user-a");
  const pending = studyFetch("/api/platform/math/upload");
  await reading.promise;
  setApiIdentity("user-b");
  body.resolve({ code: "USER_SCOPE_CHANGED" });
  await assert.rejects(pending, /账号已切换/);
  assert.equal(identityEvents, 0, "an obsolete response must not refresh the new user's identity");
});


test("management and learning authentication use separate session and logout request paths", async () => {
  const paths = [];
  globalThis.fetch = async (path, options) => { paths.push([path, options.credentials]); return json({ authenticated: false }); };
  configureApiSpace("admin");
  await getSession();
  await api("/api/auth/login", { method: "POST", body: "{}" });
  await api("/api/auth/logout", { method: "POST" });
  configureApiSpace("learning");
  await getSession();
  await api("/api/auth/login", { method: "POST", body: "{}" });
  await api("/api/auth/logout", { method: "POST" });
  assert.deepEqual(paths, [
    ["/api/admin/auth/session", "same-origin"], ["/api/admin/auth/login", "same-origin"], ["/api/admin/auth/logout", "same-origin"],
    ["/api/learning/auth/session", "same-origin"], ["/api/learning/auth/login", "same-origin"], ["/api/learning/auth/logout", "same-origin"],
  ]);
});

test("learning data and platform operations stay in the learning namespace while management endpoints stay explicit", () => {
  for (const space of ["admin", "learning"]) {
    configureApiSpace(space);
    assert.equal(resolveApiPath("/api/platform/computer"), "/api/learning/platform/computer");
    assert.equal(resolveApiPath("/api/platform/math/upload?path=%2Fapi%2Fupload"), "/api/learning/platform/math/upload?path=%2Fapi%2Fupload");
    assert.equal(resolveApiPath("/api/study/data"), "/api/learning/study/data");
    assert.equal(resolveApiPath("/api/announcements"), "/api/learning/announcements");
    assert.equal(resolveApiPath("/api/admin/configuration"), "/api/admin/configuration");
    assert.equal(resolveApiPath("/api/system/setup"), "/api/system/setup");
    assert.equal(resolveApiPath("/api/learning/auth/session"), "/api/learning/auth/session");
  }
});


test("catalogue reads join concurrent loads and reuse stable data until refresh or expiry", async () => {
  let calls = 0;
  const first = deferred();
  const load = () => { calls++; return first.promise; };
  const one = catalogResource("book-1", load);
  const two = catalogResource("book-1", load);
  assert.equal(calls, 1);
  first.resolve({ rows: [1, 2] });
  assert.deepEqual(await Promise.all([one, two]), [{ rows: [1, 2] }, { rows: [1, 2] }]);
  await catalogResource("book-1", load);
  assert.equal(calls, 1, "returning to the catalogue reuses the completed read");
  invalidateCatalogResources();
  await catalogResource("book-1", load);
  assert.equal(calls, 2, "explicit refresh requests a new response");
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + 61_000;
    await catalogResource("book-1", load);
    assert.equal(calls, 3, "catalogues expire after a minute");
  } finally { Date.now = originalNow; }
});

test("personal catalogue progress joins only in-flight reads and retries failures", async () => {
  let calls = 0;
  let response = deferred();
  const load = () => { calls++; return response.promise; };
  const pending = catalogResource("chapter-progress", load, 0);
  const joined = catalogResource("chapter-progress", load, 0);
  response.resolve({ completed: 1 });
  await Promise.all([pending, joined]);
  assert.equal(calls, 1);
  response = deferred();
  const fresh = catalogResource("chapter-progress", load, 0);
  response.resolve({ completed: 2 });
  assert.deepEqual(await fresh, { completed: 2 });
  assert.equal(calls, 2, "returning after an answer must read current progress");
  await assert.rejects(catalogResource("failed-catalogue", () => Promise.reject(new Error("offline"))), /offline/);
  assert.deepEqual(await catalogResource("failed-catalogue", async () => ["retry"]), ["retry"]);
});

test("catalogues are scoped to the displayed user and space and clear pending reads on refresh", async () => {
  let calls = 0;
  const load = async () => ++calls;
  setApiIdentity("first");
  assert.equal(await catalogResource("shared-key", load), 1);
  configureApiSpace("admin");
  assert.equal(await catalogResource("shared-key", load), 2);
  setApiIdentity("second");
  assert.equal(await catalogResource("shared-key", load), 3);
  setApiIdentity("first");
  assert.equal(await catalogResource("shared-key", load), 4, "relogin discards the previous user's resources");
  const old = deferred();
  const pending = catalogResource("pending", () => old.promise);
  invalidateCatalogResources();
  const refreshed = await catalogResource("pending", async () => "new");
  old.resolve("old");
  await pending;
  assert.equal(refreshed, "new");
  assert.equal(await catalogResource("pending", async () => "unexpected"), "new");
});

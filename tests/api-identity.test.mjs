import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

// Transform the actual source: ApiError uses parameter properties that strip-only mode cannot erase.
const source = stripTypeScriptTypes(readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8"), { mode: "transform" });
const { api, studyFetch, setApiIdentity, ApiError } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
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
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  setApiIdentity(undefined);
});

test("JSON requests carry the identity displayed to the caller together with cookies and caller headers", async () => {
  let sent;
  globalThis.fetch = async (path, options) => { sent = { path, ...options }; return json({ saved: true }); };
  setApiIdentity("user-a");
  const result = await api("/api/study/data", {
    method: "PUT", body: JSON.stringify({ revision: 1 }), headers: new Headers({ "X-Request-Label": "save-plan" }),
  });
  assert.deepEqual(result, { saved: true });
  assert.equal(sent.path, "/api/study/data");
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

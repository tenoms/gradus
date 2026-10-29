import test from "node:test";
import assert from "node:assert/strict";
import { startHttpApp } from "./http-app.mjs";

test("request diagnostics retain the exact route template for nested auth and learning account handlers", async () => {
  const app = await startHttpApp();
  try {
    const admin = await app.setup();
    const learning = await app.login("learning");
    const requests = [];
    for (const [path, options, expected] of [
      ["/api/learning/auth/session", {}, "/api/learning/auth/session"],
      ["/api/learning/auth/accounts", {}, "/api/learning/auth/accounts"],
      ["/api/learning/auth/password", { body: { currentPassword: "wrong", password: "new-password-123" } }, "/api/learning/auth/password"],
    ]) {
      const response = await app.request(path, { auth: learning, ...options });
      requests.push({ id: response.headers.get("X-Request-ID"), expected });
      await response.arrayBuffer();
    }
    const snapshot = await (await app.request("/api/admin/operations", { auth: admin })).json();
    for (const { id, expected } of requests) assert.equal(snapshot.recentRequests.find(entry => entry.id === id)?.route, expected);
  } finally { await app.close(); }
});

test("diagnostic route templates never retain user and account path values or unmatched URL details", async () => {
  const app = await startHttpApp();
  try {
    const admin = await app.setup();
    const learning = await app.login("learning");
    const privateValue = "private-path-identifier-sentinel";
    const user = await app.request(`/api/admin/users/${privateValue}`, { auth: admin, method: "PATCH", body: { displayName: "private-body-sentinel" } });
    assert.equal(user.status, 404);
    const avatar = await app.request(`/api/learning/auth/avatar/${privateValue}?secret=private-query-sentinel`, { auth: learning });
    assert.equal(avatar.status, 404);
    const unmatched = await app.request(`/api/admin/unmatched/${privateValue}?secret=private-query-sentinel`, { auth: admin });
    assert.equal(unmatched.status, 404);
    const snapshot = await (await app.request("/api/admin/operations", { auth: admin })).json();
    assert.equal(snapshot.recentRequests.find(entry => entry.id === user.headers.get("X-Request-ID"))?.route, "/api/admin/users/:id");
    const serialized = JSON.stringify(snapshot);
    for (const privateField of [privateValue, "private-body-sentinel", "private-query-sentinel", admin.userId, admin.cookie, learning.cookie]) assert.equal(serialized.includes(privateField), false);
  } finally { await app.close(); }
});

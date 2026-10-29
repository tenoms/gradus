import test from "node:test";
import assert from "node:assert/strict";
import { startHttpApp } from "../support/http-app.mjs";

test("operational diagnostics correlate requests without retaining credentials, body, query or user identifiers", async () => {
  const app = await startHttpApp();
  try {
    const admin = await app.setup();
    const learning = await app.login("learning");
    const secret = "private-diagnostic-sentinel";
    const result = await app.request(`/api/learning/auth/password?secret=${secret}`, { auth: learning, body: { currentPassword: secret, password: secret } });
    assert.equal(result.status, 400);
    const id = result.headers.get("X-Request-ID");
    assert.ok(id);
    assert.equal((await result.json()).requestId, id);
    assert.equal((await app.request("/api/admin/operations", { auth: learning })).status, 401);
    const response = await app.request("/api/admin/operations", { auth: admin });
    const snapshot = await response.json();
    const entry = snapshot.recentRequests.find(entry => entry.id === id);
    assert.equal(entry.status, 400);
    assert.equal(entry.space, "learning");
    assert.ok(entry.route.endsWith("/auth/password"));
    assert.equal(JSON.stringify(snapshot).includes(secret), false);
    assert.equal(JSON.stringify(snapshot).includes(learning.userId), false);
    assert.equal(JSON.stringify(snapshot).includes(learning.cookie), false);
  } finally { await app.close(); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { startHttpApp } from "./http-app.mjs";

test("learning sign-in and session read report the same valid personal platform connections", async () => {
  const app = await startHttpApp({
    yybRequest: async () => [{ id: 7, nickname: "学习账号", status: "alive" }],
    loginPlatform: async name => ({ connected: true, token: "private-platform-token", user: name === "math" ? { StuID: "current-student" } : { userId: "current-student" } }),
  });
  try {
    const admin = await app.setup();
    await app.request(`/api/admin/users/${admin.userId}`, { auth: admin, method: "PATCH", body: { yybRef: "7" } });
    let learning = await app.login("learning");
    assert.equal((await app.request("/api/learning/auth/connect", { auth: learning, body: { ref: "7" } })).status, 200);
    await app.request("/api/learning/auth/logout", { auth: learning, method: "POST" });
    learning = await app.login("learning");
    assert.equal(learning.session.platforms.math.connected, true);
    assert.equal(learning.session.platforms.computer.connected, true);
    const snapshot = await (await app.request("/api/learning/auth/session", { auth: learning })).json();
    assert.deepEqual(learning.session, snapshot);
    assert.equal(JSON.stringify(snapshot).includes("private-platform-token"), false);
    const adminSession = await (await app.request("/api/admin/auth/session", { auth: admin })).json();
    assert.equal(Object.hasOwn(adminSession, "platforms"), false);
  } finally { await app.close(); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createHash } from "node:crypto";
import { startHttpApp, testLearner } from "../support/http-app.mjs";

test("math native playback resolves original media through an authenticated learning route without YYB", async () => {
  const vid = "1234567890abcdef1234567890abcdef_1", url = "https://media.example.test/lesson.mp4";
  const digest = createHash("md5").update(vid).digest("hex");
  const cipher = createCipheriv("aes-128-cbc", Buffer.from(digest.slice(0, 16)), Buffer.from(digest.slice(16)));
  const response = { body: Buffer.concat([cipher.update(Buffer.from(JSON.stringify({ mp4: [url], duration: "50" })).toString("base64")), cipher.final()]).toString("hex") };
  const calls = [];
  const app = await startHttpApp({ requestJson: async source => { calls.push(String(source)); return response; } });
  try {
    const admin = await app.setup();
    await app.createUser(admin, testLearner("math.video", ""));
    const auth = await app.login("learning", "math.video", "learner-password-123");
    const path = "/api/learning/platform/math/video";
    assert.equal((await app.request(path, { body: { vid } })).status, 401);
    assert.equal((await app.request(path, { auth: admin, body: { vid } })).status, 401);
    assert.equal(calls.length, 0);
    const playable = await app.request(path, { auth, body: { vid } });
    assert.equal(playable.status, 200);
    assert.equal(playable.headers.get("cache-control"), "no-store");
    assert.deepEqual(await playable.json(), { url, poster: "", duration: 50 });
    assert.deepEqual(calls, [`https://player.polyv.net/secure/${vid}.json`]);
    assert.equal((await app.request(path, { auth, body: { vid: "../invalid" } })).status, 400);
    assert.equal(calls.length, 1);
  } finally { await app.close(); }
});

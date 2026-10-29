import test from "node:test";
import assert from "node:assert/strict";
import { startHttpApp, testLearner } from "../support/http-app.mjs";
import { createStudyClock } from "../../src/features/learning/time/study-clock.mjs";
import { createStudySync } from "../../src/features/learning/state/study-sync.mjs";

test("real learning time persists cumulatively through the learner API and stays private without YYB", async () => {
  const app = await startHttpApp({ yybRequest: () => assert.fail("Web study time must not need a source account") });
  try {
    const admin = await app.setup();
    await app.createUser(admin, testLearner("time.first", ""));
    await app.createUser(admin, testLearner("time.second", ""));
    const first = await app.login("learning", "time.first", "learner-password-123");
    const second = await app.login("learning", "time.second", "learner-password-123");
    async function request(auth, body) {
      const response = await app.request("/api/learning/study/data", { auth, ...(body ? { method: "PUT", body } : {}) });
      assert.equal(response.status, 200);
      return response.json();
    }
    const sync = createStudySync({
      transport: { get: () => request(first), put: body => request(first, body) },
      readCache: () => null, writeCache: () => {}, onChange: () => {},
    });
    await sync.sync();
    let timestamp = Date.parse("2026-10-30T01:00:00Z"), sequence = 0;
    const clock = createStudyClock({ now: () => timestamp, makeId: () => "reading-session", flushMs: 1000,
      report: activity => sync.change({ id: `time-operation-${++sequence}`, kind: "activity.add", activity }),
    });
    const reading = clock.register({ platform: "math", title: "真实题目阅读", path: "/study/question-bank" });
    clock.setForeground(true);
    timestamp += 12000; clock.tick(); await sync.sync();
    assert.equal((await request(first)).data.activities[0].durationSeconds, 12);
    timestamp += 8000; clock.setForeground(false); await sync.sync();
    timestamp += 600000; clock.tick();
    assert.equal((await request(first)).data.activities[0].durationSeconds, 20);
    clock.setForeground(true); timestamp += 7000; reading.stop(); await sync.sync();
    const stored = (await request(first)).data.activities;
    assert.equal(stored.length, 1, "periodic saves update one cumulative activity");
    assert.equal(stored[0].durationSeconds, 27);
    assert.equal(stored[0].type, "study-time");
    assert.equal(stored[0].studyMode, "reading");
    assert.equal(stored[0].total, undefined);
    assert.deepEqual((await request(second)).data.activities, []);
    const relogged = await app.login("learning", "time.first", "learner-password-123");
    assert.deepEqual((await request(relogged)).data.activities, stored);
    sync.stop();
  } finally { await app.close(); }
});

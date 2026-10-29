import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../server/infrastructure/database.mjs";
import { startHttpApp, testLearner } from "../support/http-app.mjs";
import { createStudySync, emptyStudyData } from "../../src/features/learning/state/study-sync.mjs";

test("an account's preparation settings are shared by independent logins, isolated and persisted across restarts", async () => {
  const schemaPrefix = `test_${randomUUID().replaceAll('-', '')}`;
  let database = await createDatabase({ schemaPrefix });
  let app = await startHttpApp({ database });
  let closed = false;
  try {
    const admin = await app.setup();
    await app.createUser(admin, testLearner("plan.student", ""));
    await app.createUser(admin, testLearner("other.student", ""));
    const firstDevice = await app.login("learning", "plan.student", "learner-password-123");
    const secondDevice = await app.login("learning", "plan.student", "learner-password-123");
    const otherAccount = await app.login("learning", "other.student", "learner-password-123");
    const data = { ...emptyStudyData(), mathPlan: { subject: "数二", stage: "强化" } };
    const saved = await app.request("/api/learning/study/data", { auth: firstDevice, method: "PUT", body: { data, revision: 0 } });
    assert.equal(saved.status, 200);
    assert.deepEqual(await (await app.request("/api/learning/study/data", { auth: secondDevice })).json(), { data, revision: 1 });
    assert.equal((await (await app.request("/api/learning/study/data", { auth: otherAccount })).json()).data.mathPlan, undefined);
    for (const mathPlan of [null, { subject: "数四", stage: "基础" }, { subject: "数一", stage: "未知" }, { subject: "数三" }]) {
      const invalid = await app.request("/api/learning/study/data", { auth: secondDevice, method: "PUT", body: { data: { ...data, mathPlan }, revision: 1 } });
      assert.equal(invalid.status, 400);
    }
    await app.close(); closed = true;
    database = await createDatabase({ schemaPrefix });
    app = await startHttpApp({ database }); closed = false;
    const reconnected = await app.login("learning", "plan.student", "learner-password-123");
    assert.deepEqual(await (await app.request("/api/learning/study/data", { auth: reconnected })).json(), { data, revision: 1 });
  } finally {
    if (closed) database = await createDatabase({ schemaPrefix });
    await database.drop();
    if (!closed) await app.close(); else await database.close();
  }
});

function device(transport, cache = null) {
  let saved;
  const sync = createStudySync({ transport, readCache: () => cache, writeCache: value => { saved = structuredClone(value); }, onChange: () => {} });
  return { sync, get cache() { return saved; } };
}

test("a device with no browser cache automatically receives saved preparation settings", async () => {
  let cloud = { data: emptyStudyData(), revision: 0 };
  const transport = { get: async () => structuredClone(cloud), put: async value => (cloud = { data: structuredClone(value.data), revision: value.revision + 1 }) };
  const first = device(transport);
  await first.sync.sync();
  first.sync.change({ id: "plan-change", kind: "math-plan.set", mathPlan: { subject: "数三", stage: "冲刺" } });
  await first.sync.sync();
  const second = device(transport);
  await second.sync.sync();
  assert.deepEqual(second.sync.data.mathPlan, { subject: "数三", stage: "冲刺" });
  assert.deepEqual(second.cache.pending, []);
});

test("offline preparation changes rebase onto cloud study records without replacing them", async () => {
  const offline = device({ get: async () => { throw new Error("offline"); }, put: async () => { throw new Error("offline"); } });
  offline.sync.change({ id: "offline-plan", kind: "math-plan.set", mathPlan: { subject: "数二", stage: "真题" } });
  await offline.sync.sync();
  assert.equal(offline.sync.status.state, "error");
  offline.sync.stop();
  const task = { id: "cloud-task", title: "复盘错题", platform: "math", date: "2026-10-29", createdAt: "2026-10-29T00:00:00Z", done: false };
  const cloud = { ...emptyStudyData(), tasks: [task], goalMinutes: 90 };
  const reconnected = device({ get: async () => ({ data: cloud, revision: 5 }), put: async value => ({ ...value, revision: 6 }) }, offline.cache);
  await reconnected.sync.sync();
  assert.deepEqual(reconnected.sync.data.mathPlan, { subject: "数二", stage: "真题" });
  assert.deepEqual(reconnected.sync.data.tasks, [task]);
  assert.equal(reconnected.sync.data.goalMinutes, 90);
  assert.deepEqual(reconnected.cache.pending, []);
});

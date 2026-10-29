import test from "node:test";
import assert from "node:assert/strict";
import { createStudySync, emptyStudyData } from "../src/features/learning/state/study-sync.mjs";

const task = (id) => ({ id, title: id, platform: "math", date: "2026-10-29", done: false, createdAt: "2026-10-29T03:00:00Z" });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function client(transport, cache = null) {
  let saved, latest;
  const sync = createStudySync({ transport, readCache: () => cache, writeCache: value => { saved = structuredClone(value); }, onChange: (data, status) => { latest = { data, status }; } });
  return { sync, get saved() { return saved; }, get latest() { return latest; } };
}

test("changes made during initial hydration merge with existing cloud tasks", async () => {
  const gate = deferred();
  const c = client({ get: () => gate.promise, put: async value => ({ ...value, revision: value.revision + 1 }) });
  const ready = c.sync.sync();
  c.sync.change({ id: "op1", kind: "task.add", task: task("local") });
  gate.resolve({ data: { ...emptyStudyData(), tasks: [task("remote")] }, revision: 2 });
  await ready;
  assert.deepEqual(c.sync.data.tasks.map(t => t.id), ["remote", "local"]);
  assert.equal(c.saved.pending.length, 0);
});

test("a revision conflict rebases pending changes without losing another device's work", async () => {
  let reads = 0, writes = 0;
  const c = client({
    get: async () => ({ data: { ...emptyStudyData(), tasks: reads++ ? [task("other-device")] : [] }, revision: reads }),
    put: async value => { if (!writes++) throw Object.assign(new Error("conflict"), { status: 409 }); return { ...value, revision: value.revision + 1 }; },
  });
  await c.sync.sync();
  c.sync.change({ id: "op", kind: "task.add", task: task("mine") });
  await c.sync.sync();
  assert.deepEqual(c.sync.data.tasks.map(t => t.id), ["other-device", "mine"]);
  assert.equal(c.saved.pending.length, 0);
});

test("operations appended during an in-flight save are included in a later revision", async () => {
  const gate = deferred();
  let writes = 0;
  const c = client({ get: async () => ({ data: emptyStudyData(), revision: 0 }), put: async value => { if (!writes++) await gate.promise; return { ...value, revision: value.revision + 1 }; } });
  await c.sync.sync();
  c.sync.change({ id: "first", kind: "task.add", task: task("first") });
  c.sync.change({ id: "second", kind: "task.add", task: task("second") });
  gate.resolve();
  await c.sync.sync();
  assert.equal(writes, 2);
  assert.deepEqual(c.sync.data.tasks.map(t => t.id), ["first", "second"]);
  assert.equal(c.saved.pending.length, 0);
});

test("offline pending changes survive re-creation and sync once with the user's cloud data", async () => {
  const offline = client({ get: async () => { throw new Error("offline"); }, put: async () => { throw new Error("offline"); } });
  offline.sync.change({ id: "op", kind: "task.add", task: task("cached") });
  await offline.sync.sync();
  assert.equal(offline.latest.status.state, "error");
  assert.equal(offline.saved.pending.length, 1);
  offline.sync.stop();
  const online = client({ get: async () => ({ data: emptyStudyData(), revision: 1 }), put: async value => ({ ...value, revision: 2 }) }, offline.saved);
  await online.sync.sync();
  assert.deepEqual(online.sync.data.tasks.map(t => t.id), ["cached"]);
  assert.equal(online.saved.pending.length, 0);
});

test("stopped user synchronizer cannot notify or save after another user takes over", async () => {
  const gate = deferred(); let writes = 0, callbacks = 0;
  const sync = createStudySync({ transport: { get: () => gate.promise, put: async value => { writes++; return value; } }, readCache: () => null, writeCache: () => {}, onChange: () => { callbacks++; } });
  const ready = sync.sync();
  sync.change({ id: "op", kind: "goal.set", goalMinutes: 120 });
  sync.stop();
  const previous = callbacks;
  gate.resolve({ data: emptyStudyData(), revision: 0 });
  await ready;
  assert.equal(writes, 0);
  assert.equal(callbacks, previous);
});

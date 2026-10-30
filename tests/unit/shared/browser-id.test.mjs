import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createId } from "../../../src/shared/lib/id.mjs";
import { createStudyClock } from "../../../src/features/learning/time/study-clock.mjs";
import { applyStudyChange, emptyStudyData } from "../../../src/features/learning/state/study-sync.mjs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function browserCrypto(t, crypto) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: crypto });
  t.after(() => Object.defineProperty(globalThis, "crypto", original));
}
const httpCrypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };

test("ID generation uses the browser's native UUID method when available", t => {
  browserCrypto(t, { randomUUID: () => "native-id" });
  assert.equal(createId(), "native-id");
});

test("HTTP browsers without randomUUID can generate distinct UUIDs", t => {
  browserCrypto(t, httpCrypto);
  const ids = Array.from({ length: 1000 }, createId);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, uuid);
});

test("click checkpoints and media timing work without randomUUID", t => {
  browserCrypto(t, httpCrypto);
  let now = Date.parse("2026-10-30T04:00:00Z");
  const reports = [];
  const clock = createStudyClock({ now: () => now, report: activity => reports.push(activity) });
  const media = clock.register({ platform: "computer", title: "408 课程", path: "/study/computer/courses", mode: "media" });
  clock.setForeground(true);
  now += 2000;
  clock.interact();
  now += 3000;
  clock.interact();
  media.stop();
  assert.equal(reports.length, 1);
  assert.equal(reports[0].durationSeconds, 5);
  assert.match(reports[0].id, uuid);
});

test("task and activity actions remain usable on HTTP browsers", async t => {
  browserCrypto(t, httpCrypto);
  const source = await readFile(new URL("../../../src/features/learning/state/store.ts", import.meta.url), "utf8");
  const executable = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/import[\s\S]*?from ["'][^"']+["'];/g, "")
    .replace(/^export /gm, "");
  const store = runInNewContext(`${executable}\n({ addTask, toggleTask, recordActivity, useStudyData });`, {
    createId, createStudyClock, applyStudyChange, emptyStudyData,
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    localStorage: { setItem() {} }, window: { addEventListener() {} },
  });
  store.addTask({ title: "学习408", platform: "computer", date: "2026-10-30" });
  const task = store.useStudyData().tasks[0];
  assert.match(task.id, uuid);
  store.toggleTask(task.id);
  assert.equal(store.useStudyData().tasks[0].done, true);
  store.recordActivity({ platform: "computer", type: "course", title: "观看课程", path: "/study/computer/courses" });
  assert.match(store.useStudyData().activities[0].id, uuid);
});

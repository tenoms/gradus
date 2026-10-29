import test from "node:test";
import assert from "node:assert/strict";
import { createStudyClock } from "../../../src/features/learning/time/study-clock.mjs";
import { applyStudyChange, emptyStudyData } from "../../../src/features/learning/state/study-sync.mjs";

function fixture(start = Date.parse("2026-10-29T04:00:00Z")) {
  let timestamp = start, sequence = 0;
  const reports = [];
  const clock = createStudyClock({ now: () => timestamp, makeId: () => `session-${++sequence}`, report: activity => reports.push(activity), flushMs: 1000 });
  return {
    clock, reports,
    register: (title = "阅读题目", options = {}) => clock.register({ platform: "math", title, path: "/study/question-bank", ...options }),
    advance(seconds) { timestamp += seconds * 1000; clock.tick(); },
    data() { return reports.reduce((data, activity) => applyStudyChange(data, { kind: "activity.add", activity }), emptyStudyData()); },
  };
}

test("reading records foreground time without requiring an answer or progress submission", () => {
  const f = fixture(), handle = f.register();
  f.advance(10);
  assert.equal(f.reports.length, 0);
  f.clock.setForeground(true);
  f.advance(12);
  handle.stop();
  assert.equal(f.data().activities[0].durationSeconds, 12);
  assert.equal(f.data().activities[0].total, undefined);
});

test("checkpoints replace the same cumulative activity and retries do not duplicate duration", () => {
  const f = fixture();
  f.register(); f.clock.setForeground(true);
  f.advance(20); f.advance(20);
  assert.deepEqual(f.reports.map(row => row.durationSeconds), [20, 40]);
  assert.equal(f.reports[0].id, f.reports[1].id);
  let data = f.data();
  data = applyStudyChange(data, { kind: "activity.add", activity: f.reports[1] });
  assert.equal(data.activities.length, 1);
  assert.equal(data.activities[0].durationSeconds, 40);
});

test("background and five-minute inactivity are excluded, and interaction resumes reading", () => {
  const f = fixture();
  f.register(); f.clock.setForeground(true);
  f.advance(12);
  f.clock.setForeground(false); f.advance(600);
  assert.equal(f.data().activities[0].durationSeconds, 12);
  f.clock.setForeground(true); f.advance(400);
  assert.equal(f.data().activities[0].durationSeconds, 312);
  f.clock.interact(); f.advance(8);
  assert.equal(f.data().activities[0].durationSeconds, 320);
});

test("playing media overrides reading without double counting and replay does not depend on saved position", () => {
  const f = fixture();
  f.register(); f.clock.setForeground(true); f.advance(10);
  const media = f.register("复看视频", { mode: "media", enabled: false });
  media.setEnabled(true); f.advance(320);
  media.setEnabled(false); f.clock.interact(); f.advance(5);
  const durations = Object.fromEntries(f.data().activities.map(a => [a.title, a.durationSeconds]));
  assert.deepEqual(durations, { "阅读题目": 15, "复看视频": 320 });
  media.setEnabled(true); f.advance(3); media.stop();
  assert.equal(f.data().activities.find(a => a.title === "复看视频").durationSeconds, 323);
});

test("only the current reading context accrues time, and inactive content does not accrue", () => {
  const f = fixture();
  f.register("父题目"); f.clock.setForeground(true); f.advance(2);
  const child = f.register("子练习"); f.advance(3);
  child.setEnabled(false); f.advance(4);
  child.stop();
  assert.deepEqual(Object.fromEntries(f.data().activities.map(a => [a.title, a.durationSeconds])), { "父题目": 6, "子练习": 3 });
});

test("study crossing Shanghai midnight is split into two dates", () => {
  const f = fixture(Date.parse("2026-10-29T15:59:58Z"));
  f.register(); f.clock.setForeground(true); f.advance(5);
  const entries = f.data().activities;
  assert.deepEqual(entries.map(a => [new Date(a.at).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }), a.durationSeconds]), [["2026-10-30", 3], ["2026-10-29", 2]]);
  assert.notEqual(entries[0].id, entries[1].id);
});

test("scope reset flushes the previous session and old handles cannot time the next account", () => {
  const f = fixture();
  const old = f.register("旧账号"); f.clock.setForeground(true); f.advance(2.7);
  f.clock.reset(); old.setEnabled(true); f.advance(20);
  assert.equal(f.data().activities[0].durationSeconds, 2);
  f.register("新账号"); f.clock.setForeground(true); f.advance(3);
  assert.deepEqual(Object.fromEntries(f.data().activities.map(a => [a.title, a.durationSeconds])), { "旧账号": 2, "新账号": 3 });
});

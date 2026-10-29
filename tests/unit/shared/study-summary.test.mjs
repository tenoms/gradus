import test from "node:test";
import assert from "node:assert/strict";
import { formatStudyDuration, studyDate, studyDurationValue, studySummary, studyWeek } from "../../../src/features/learning/study-summary.mjs";

const event = (id, values = {}) => ({ id, at: "2026-10-29T16:30:00.000Z", platform: "math", type: "practice", title: "章节练习", ...values });

test("timing sessions contribute time and learning days without adding practice or actions", () => {
  const answer = event("answer", { total: 2, correct: 1, durationSeconds: 40 });
  const timer = event("timer", { type: "study-time", durationSeconds: 35, total: 99, correct: 99 });
  const otherDay = event("other-day", { type: "study-time", at: "2026-10-30T16:30:00Z", durationSeconds: 20, platform: "computer" });
  const emptyTimer = event("empty", { type: "study-time", at: "2026-10-31T16:30:00Z", durationSeconds: 0 });
  const summary = studySummary([answer, timer, otherDay, emptyTimer]);
  assert.deepEqual(summary, { events: [answer], durationSeconds: 95, questions: 2, correct: 1, graded: 2, days: 2 });
  assert.deepEqual(studySummary([answer, timer, otherDay], { date: "2026-10-30" }), {
    events: [answer], durationSeconds: 75, questions: 2, correct: 1, graded: 2, days: 1,
  });
  assert.equal(studySummary([answer, timer, otherDay], { platform: "computer" }).durationSeconds, 20);
});

test("weekly action counts exclude timing updates and use Shanghai calendar dates", () => {
  const rows = [
    event("yesterday", { at: "2026-10-29T15:59:59Z", total: 3 }),
    event("today", { at: "2026-10-29T16:00:00Z" }),
    event("timer", { type: "study-time", durationSeconds: 25 }),
  ];
  assert.equal(studyDate("2026-10-29T15:59:59Z"), "2026-10-29");
  assert.equal(studyDate("2026-10-29T16:00:00Z"), "2026-10-30");
  const week = studyWeek(rows, "2026-10-29T16:30:00Z");
  assert.deepEqual(week.map(day => day.date), ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
  assert.deepEqual(week.slice(-2), [{ date: "2026-10-29", count: 3 }, { date: "2026-10-30", count: 1 }]);
});

test("short recorded learning remains visible in seconds without rounding minutes up", () => {
  assert.deepEqual(studyDurationValue(0), { value: 0, unit: "秒" });
  assert.deepEqual(studyDurationValue(35.9), { value: 35, unit: "秒" });
  assert.deepEqual(studyDurationValue(59.9), { value: 59, unit: "秒" });
  assert.deepEqual(studyDurationValue(60), { value: 1, unit: "分钟" });
  assert.deepEqual(studyDurationValue(119), { value: 1, unit: "分钟" });
  assert.equal(formatStudyDuration(35), "35 秒");
  assert.equal(formatStudyDuration(65), "1 分 5 秒");
  assert.equal(formatStudyDuration(7500), "2 小时 5 分");
});

import test from "node:test";
import assert from "node:assert/strict";
import { filterStudyActivities, formatStudyDuration, studyDate, studyDurationValue, studyPeriodRange, studySummary, studyTimeBreakdown, studyTrend, studyWeek } from "../../../src/features/learning/study-summary.mjs";
import { validateStudyData } from "../../../shared/study-data.mjs";

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

test("subject and calendar-period filters share inclusive Shanghai dates and exclude future records", () => {
  const now = "2026-10-29T20:00:00Z";
  assert.deepEqual(studyPeriodRange(7, now), { fromDate: "2026-10-24", toDate: "2026-10-30" });
  assert.deepEqual(studyPeriodRange(30, now), { fromDate: "2026-10-01", toDate: "2026-10-30" });
  const rows = [
    event("old", { at: "2026-10-23T15:59:59Z", total: 100 }),
    event("math-start", { at: "2026-10-23T16:00:00Z", total: 3 }),
    event("computer-end", { at: "2026-10-30T15:59:59Z", platform: "computer", total: 5 }),
    event("future", { at: "2026-10-30T16:00:00Z", total: 200 }),
  ];
  assert.deepEqual(filterStudyActivities(rows, studyPeriodRange(7, now)).map(a => a.id), ["math-start", "computer-end"]);
  assert.equal(studySummary(rows, { ...studyPeriodRange(7, now), platform: "computer" }).questions, 5);
  assert.equal(studySummary(rows, studyPeriodRange("all", now)).questions, 108);
});

test("partly graded submissions keep pending answers out of the correctness denominator", () => {
  const rows = [event("mixed", { platform: "computer", total: 5, graded: 2, correct: 1 }), event("pending", { platform: "computer", total: 3, graded: 0 }), event("old-graded", { total: 2, correct: 2 })];
  const computer = studySummary(rows, { platform: "computer" });
  assert.equal(computer.questions, 8);
  assert.equal(computer.graded, 2);
  assert.equal(computer.correct, 1);
  assert.equal(computer.questions - computer.graded, 6);
  assert.equal(studySummary(rows).graded, 4, "older explicitly scored activities retain their denominator");
});

test("time breakdown uses saved study modes and keeps older unclassified time honest", () => {
  const rows = [
    event("reading", { type: "study-time", studyMode: "reading", durationSeconds: 120 }),
    event("media", { platform: "computer", type: "study-time", studyMode: "media", durationSeconds: 300 }),
    event("legacy", { type: "course", durationSeconds: 40 }),
  ];
  assert.deepEqual(studyTimeBreakdown(rows).map(row => [row.key, row.durationSeconds]), [["reading", 120], ["media", 300], ["unclassified", 40]]);
  assert.equal(studyTimeBreakdown(rows).reduce((sum, row) => sum + row.durationSeconds, 0), studySummary(rows).durationSeconds);
  assert.deepEqual(studyTimeBreakdown(rows, { platform: "computer" }).map(row => row.durationSeconds), [0, 300, 0]);
  const data = validateStudyData({ tasks: [], activities: [rows[0], event("score", { total: 5, correct: 1, graded: 2 })], goalMinutes: 60 });
  assert.equal(data.activities[0].studyMode, "reading");
  assert.equal(data.activities[1].graded, 2);
  assert.throws(() => validateStudyData({ ...data, activities: [event("invalid", { studyMode: "guessed" })] }), /学习方式/);
});

test("subject trends separate answered questions, action counts and actual learning time", () => {
  const rows = [event("answer", { platform: "computer", total: 4 }), event("time", { platform: "computer", type: "study-time", durationSeconds: 65 }), event("math", { total: 9 })];
  const options = { now: "2026-10-29T20:00:00Z", platform: "computer", days: 30 };
  assert.equal(studyTrend(rows, { ...options, metric: "questions" }).at(-1).count, 4);
  assert.equal(studyTrend(rows, { ...options, metric: "activities" }).at(-1).count, 1);
  assert.equal(studyTrend(rows, { ...options, metric: "duration" }).at(-1).count, 65);
  assert.equal(studyTrend(rows, options).length, 30);
});

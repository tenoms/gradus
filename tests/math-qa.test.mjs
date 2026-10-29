import test from "node:test";
import assert from "node:assert/strict";
import {
  qaTeacherRights,
  qaVoicePayload,
  qaReportDetailParams,
} from "../src/platforms/math-qa.ts";
test("teacher editing keeps author ownership without local response expiry", () => {
  const info = { State: 2, TeacherID: 7, UpdateTime: "2000-01-01 00:00:00" };
  assert.equal(qaTeacherRights(info, { TeacherID: "7" }).editAnswer, true);
  assert.equal(qaTeacherRights(info, { TeacherID: "7" }).follow, true);
  assert.equal(qaTeacherRights(info, { TeacherID: 8 }).write, false);
  assert.equal(qaTeacherRights(info, { TeacherID: 7 }, true).write, false);
});
test("voice answers and followup use original independent records and never send the teacher as a student", () => {
  const input = {
    orderId: 4,
    questionId: 5,
    teacherId: 6,
    url: "https://example.test/audio.wav",
    at: "2026-10-29 12:00:00",
  };
  const answer = qaVoicePayload({ ...input, isAnswer: true });
  const follow = qaVoicePayload({ ...input, isAnswer: false });
  assert.equal(answer.BaseContent, "语音回答：");
  assert.equal(answer.BasFiles, input.url);
  assert.equal(follow.BusID, 4);
  assert.equal(follow.BusValue, input.url);
  assert.equal(follow.BusType, "语音");
  assert.equal("StuID" in follow, false);
});
test("report detail preserves original BKID, ChapterID and Month parameter names", () => {
  assert.equal(qaReportDetailParams("actor", "book", 17, "book").BKID, 17);
  assert.equal(
    qaReportDetailParams("actor", "chapter", 18, "chapter").ChapterID,
    18,
  );
  assert.equal(
    qaReportDetailParams("actor", "month", undefined, "2026-10").Month,
    "2026-10",
  );
});

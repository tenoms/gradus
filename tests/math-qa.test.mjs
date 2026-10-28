import test from "node:test";
import assert from "node:assert/strict";
import {
  qaStudentCanFollow,
  qaTeacherRights,
  qaVoicePayload,
  qaReportDetailParams,
} from "../src/platforms/math-qa.ts";
test("student followup uses service EndTime instead of extending it from teacher update time", () => {
  const now = Date.parse("2026-10-29T12:00:00+08:00");
  assert.equal(
    qaStudentCanFollow(
      {
        State: 2,
        EndTime: "2026-10-29 11:59:00",
        UpdateTime: "2026-10-29 11:00:00",
      },
      now,
    ),
    false,
  );
  assert.equal(
    qaStudentCanFollow({ State: 2, EndTime: "2026-10-29 12:01:00" }, now),
    true,
  );
});
test("only the assigned teacher can edit, history is read only and answer editing expires after three hours", () => {
  const now = Date.parse("2026-10-29T12:00:00+08:00");
  const info = { State: 2, TeacherID: 7, UpdateTime: "2026-10-29 10:00:00" };
  assert.equal(
    qaTeacherRights(info, { TeacherID: "7" }, false, now).editAnswer,
    true,
  );
  assert.equal(
    qaTeacherRights(info, { TeacherID: 8 }, false, now).write,
    false,
  );
  assert.equal(qaTeacherRights(info, { TeacherID: 7 }, true, now).write, false);
  assert.equal(
    qaTeacherRights(
      { ...info, UpdateTime: "2026-10-29 08:59:00" },
      { TeacherID: 7 },
      false,
      now,
    ).editAnswer,
    false,
  );
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

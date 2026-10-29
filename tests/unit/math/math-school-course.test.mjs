import test from "node:test";
import assert from "node:assert/strict";
import {
  schoolAllAnswered,
  schoolCompletionRecord,
  schoolQuestionRecord,
} from "../../../src/features/math/schools/school-course-model.mjs";
const context = {
  stuid: "fixture-student",
  CourseID: 11,
  CalendarID: 22,
  ProductID: "33",
  PaperID: 44,
};
test("院校逐题训练保留原记录编号与BusType3合约，隔离纸卷与题目编号", () => {
  const payload = schoolQuestionRecord(
    {
      QuestionID: 55,
      _question_list: { BookID: 66 },
      _c_course_users_record: { ID: 77, Answer: "old", AnswerState: 1 },
    },
    context,
    "8,9",
    false,
    true,
  );
  assert.deepEqual(payload, {
    ID: 77,
    StuID: "fixture-student",
    CourseID: 11,
    CalendarID: 22,
    ProductID: 33,
    BusType: 3,
    BusID: 44,
    BusRelationID: 55,
    BookID: 66,
    BusValue: 0,
    Answer: "8,9",
    AnswerState: 0,
  });
});
test("院校主观题允许按原协议空答案自评，正确1错误0", () => {
  assert.equal(
    schoolQuestionRecord({ QuestionID: 55 }, context, "", true).AnswerState,
    1,
  );
  assert.equal(
    schoolQuestionRecord({ QuestionID: 55 }, context, "", true).Answer,
    "",
  );
  assert.equal(
    schoolQuestionRecord({ QuestionID: 55 }, context, "", true).BusValue,
    "",
  );
  assert.equal(
    schoolQuestionRecord(
      { QuestionID: 55, _c_course_users_record: { BusValue: "existing" } },
      context,
      "",
      true,
    ).BusValue,
    "existing",
  );
});
test("仅全题已有服务端记录时允许完成课程训练", () => {
  assert.equal(schoolAllAnswered([]), false);
  assert.equal(
    schoolAllAnswered([
      { _c_course_users_record: { ID: 3 } },
      { _c_course_users_record: { ID: 0 } },
    ]),
    false,
  );
  assert.equal(
    schoolAllAnswered([
      { _c_course_users_record: { ID: 3 } },
      { _c_course_users_record: { ID: 4 } },
    ]),
    true,
  );
});
test("完成记录是PaperID总记录，逐题ID不混入解锁合约", () => {
  assert.deepEqual(schoolCompletionRecord(context), {
    ID: 0,
    StuID: "fixture-student",
    CourseID: 11,
    CalendarID: 22,
    ProductID: 33,
    BusType: 3,
    BusID: 44,
    BusRelationID: 0,
    BusValue: "",
    AnswerState: 1,
    IsFinished: 1,
  });
});

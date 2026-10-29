import test from "node:test";
import assert from "node:assert/strict";
import {
  mathHistoryCommands,
  mathHistoryParams,
  mathHistoryQuestion,
} from "../../../src/features/math/profile/math-history.ts";
test("study history pagination is an offset and papers retain the original Notes scope", () => {
  assert.equal(
    mathHistoryCommands.拍照搜题,
    "GetUserCourseQrcodePhotoBookListPager1",
  );
  assert.deepEqual(mathHistoryParams("actor", 2, 20, "真题"), {
    StuID: "actor",
    Page: 40,
    PageSize: 20,
    Notes: "真题",
  });
});
test("history navigation keeps source question ID separate from the printed question number", () => {
  const row = mathHistoryQuestion({
    ID: 92250,
    questionID: "12",
    bookID: 2171,
    QuestionPage: "17",
    bookName: "教辅",
  });
  assert.equal(row.QuestionID, 92250);
  assert.equal(row.QuestionSort, "12");
  assert.equal(row.BookID, 2171);
});

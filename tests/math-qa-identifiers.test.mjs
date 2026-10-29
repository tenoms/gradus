import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMathQuestionOrder } from "../src/features/math/community/math-qa.ts";
test("student joined list separates order ID, entity QID and printed question number", () => {
  const row = normalizeMathQuestionOrder({
    ID: 92250,
    QID: 92250,
    OrderID: 119145,
    QuestionID: "1",
    StateID: 0,
    Title: "fixture",
  });
  assert.equal(row.ID, 119145);
  assert.equal(row.QuestionID, 92250);
  assert.equal(row.QuestionSort, "1");
  assert.equal(row.State, 0);
});
test("detail QuestionID1 is the entity while QuestionID is the printed number", () => {
  const row = normalizeMathQuestionOrder({
    ID: 119145,
    QuestionID: "1",
    QuestionID1: 92250,
    State: 2,
  });
  assert.equal(row.ID, 119145);
  assert.equal(row.QuestionID, 92250);
  assert.equal(row.QuestionSort, "1");
  assert.equal(row.State, 2);
});
test("unjoined teacher order shape keeps original order and question identities", () => {
  const row = normalizeMathQuestionOrder({
    ID: 123,
    QuestionID: 456,
    State: 1,
    TeacherID: 789,
  });
  assert.equal(row.ID, 123);
  assert.equal(row.QuestionID, 456);
  assert.equal(row.State, 1);
  assert.equal(row.TeacherID, 789);
});
test("normalizing a selected row twice preserves the printed number", () => {
  const row = normalizeMathQuestionOrder({
    ID: 92250,
    QID: 92250,
    OrderID: 119145,
    QuestionID: "1",
    StateID: 0,
  });
  assert.deepEqual(normalizeMathQuestionOrder(row), row);
});

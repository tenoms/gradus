import test from "node:test";
import assert from "node:assert/strict";
import { answerProgress } from "../../../src/features/learning/workbench/answer-progress.mjs";
import { computerQuestionProgress } from "../../../src/features/computer/practice/question-workflow.mjs";

test("saved answers show their grade instead of treating persistence as correctness", () => {
  assert.deepEqual(answerProgress({ saved: true, correct: false }), { state: "incorrect", label: "回答错误" });
  assert.deepEqual(answerProgress({ saved: true, correct: true }), { state: "correct", label: "已答对" });
  assert.equal(answerProgress({ saved: true }).state, "saved", "saved ungraded and self-check answers stay neutral");
  assert.equal(answerProgress({ saved: true, correct: false, revealed: false }).state, "saved", "paper grading stays hidden before hand-in");
  assert.equal(answerProgress({ draft: true, correct: false }).state, "draft", "an unsuccessful save does not mark a draft wrong");
  assert.equal(answerProgress().state, "unanswered");
  assert.equal(answerProgress({ skipped: true, saved: true, correct: false }).state, "skipped");
});

test("computer progress restores numeric or string grades and keeps skipped or self-check answers neutral", () => {
  for (const examType of [3, 10, 18, 19]) {
    const launch = { examType };
    assert.equal(computerQuestionProgress(launch, { answerType: "2" }).state, "incorrect");
    assert.equal(computerQuestionProgress(launch, { answerType: 1 }).state, "correct");
    assert.equal(computerQuestionProgress(launch, { answerType: 3 }).state, "saved");
    assert.equal(computerQuestionProgress(launch, { answerType: 4 }).state, "skipped");
    assert.equal(computerQuestionProgress(launch, undefined, true).state, "draft");
    assert.equal(computerQuestionProgress(launch).state, "unanswered");
  }
  assert.equal(computerQuestionProgress({ examType: 3 }, { answerType: 2 }, false, false, true).state, "skipped");
  assert.equal(computerQuestionProgress({ examType: 3, readOnly: true }, { answerType: 1, answerSource: 15, answer: "" }).state, "skipped", "restored upstream skips are not correct answers");
  assert.equal(computerQuestionProgress({ examType: 2 }, { answerType: 2, answer: "" }, false, true).state, "unanswered", "auto-filled empty hand-in records remain unanswered");
  assert.equal(computerQuestionProgress({ examType: 3 }, { answerType: 2, answer: "0" }).state, "incorrect", "a false judgment is an actual answer");
  assert.equal(computerQuestionProgress({ examType: 3 }, { answerType: 2, answer: "", llmAnswer: "graded response" }).state, "incorrect");
});

test("computer complete-paper answer cards reveal grades only after hand-in or in explicit review", () => {
  for (const examType of [1, 2, 4, 7, 9, 15, 20, 21, 22]) {
    const launch = { examType }, record = { answerType: 2 };
    assert.equal(computerQuestionProgress(launch, record).state, "saved");
    assert.equal(computerQuestionProgress(launch, undefined, true).state, "draft");
    assert.equal(computerQuestionProgress(launch, record, false, true).state, "incorrect");
    assert.equal(computerQuestionProgress({ ...launch, readOnly: true }, record).state, "incorrect");
  }
});

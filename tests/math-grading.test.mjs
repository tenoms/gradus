import test from "node:test";
import assert from "node:assert/strict";
import {
  gradeMathAnswer,
  mergeMathQuestion,
} from "../src/platforms/math-grading.ts";

test("exercise wrapper and nested question retain the original answer when refreshed detail omits it", () => {
  const question = mergeMathQuestion(
    {
      QuestionID: 12,
      TypeAnswer: "3",
      _question_list: { ID: 12, QuestionTxt: "原题干" },
    },
    { ID: 12, QuestionTxt: "刷新题干" },
  );
  assert.equal(question.TypeAnswer, "3");
  assert.deepEqual(gradeMathAnswer(question, [], [], "3"), {
    answer: "3",
    correct: true,
    source: "answer-key",
  });
  assert.equal(
    mergeMathQuestion(
      { TypeAnswer: "outer", _question_list: { TypeAnswer: "nested" } },
      {},
    ).TypeAnswer,
    "nested",
  );
});

test("album mastery states are never used as a nested question answer key", () => {
  for (const Answer of [0, 1, 2]) {
    const question = mergeMathQuestion(
      { Answer, _question_list: { ID: 12, QuestionTxt: "主观题" } },
      { ID: 12 },
    );
    assert.equal(gradeMathAnswer(question, [], [], "1").correct, undefined);
  }
  assert.equal(
    gradeMathAnswer(
      mergeMathQuestion(
        { Answer: 2, _question_list: { Answer: "实际答案" } },
        {},
      ),
      [],
      [],
      "实际答案",
    ).correct,
    true,
  );
});

test("question detail preserves the original practice answer key when detail omits it", () => {
  const question = mergeMathQuestion(
    { ID: 12, TypeAnswer: "3", QuestionTxt: "旧题干" },
    { ID: 12, QuestionTxt: "新题干" },
  );
  assert.equal(question.QuestionTxt, "新题干");
  assert.equal(gradeMathAnswer(question, [], [], "3").correct, true);
  assert.equal(gradeMathAnswer(question, [], [], "4").correct, false);
});
test("missing answer keys remain ungraded and never become a wrong answer", () => {
  assert.equal(
    gradeMathAnswer({ QuestionTxt: "证明题" }, [], [], "我的证明").correct,
    undefined,
  );
  assert.equal(
    gradeMathAnswer(
      {},
      [
        { ID: 1, IsAnswer: 0 },
        { ID: 2, IsAnswer: 0 },
      ],
      ["1"],
      "",
    ).correct,
    undefined,
  );
});
test("multiple choice compares option IDs independently of order", () => {
  const options = [
    { ID: 21, IsAnswer: "1" },
    { ID: 22, IsAnswer: 0 },
    { ID: 23, IsAnswer: 1 },
  ];
  assert.equal(gradeMathAnswer({}, options, ["23", "21"], "").correct, true);
  assert.equal(gradeMathAnswer({}, options, ["21"], "").correct, false);
  assert.equal(
    gradeMathAnswer({}, options, ["21", "22", "23"], "").correct,
    false,
  );
});

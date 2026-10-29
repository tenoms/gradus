import test from "node:test";
import assert from "node:assert/strict";
import { computerKnowledgeMajorId } from "../src/components/computer/computer-knowledge.mjs";
import { computerAnswerMode, computerImmediateChoice, computerChoiceAnswer, computerQuestionVideoSource, computerQuestionVideoPermission, computerNextVideoCount, computerQuestionVideoAllowed } from "../src/components/computer/question-workflow.mjs";

test("single and judgment practice choices save immediately while complete papers stay drafts", () => {
  for (const launch of [{ examType: 3 }, { examType: 10 }, { examType: 6, redo: {} }, { examType: 6, random: true }]) {
    assert.equal(computerAnswerMode(launch), "practice");
    assert.equal(computerImmediateChoice(launch, 1), true);
    assert.equal(computerImmediateChoice(launch, 5), true);
    for (const type of [2, 3, 4, 7]) assert.equal(computerImmediateChoice(launch, type), false);
  }
  for (const examType of [1, 2, 4, 6, 7, 9, 15, 20, 21, 22]) {
    assert.equal(computerAnswerMode({ examType }), "paper");
    assert.equal(computerImmediateChoice({ examType }, 1), false);
  }
  assert.equal(computerImmediateChoice({ examType: 3, readOnly: true }, 1), false);
  assert.equal(computerImmediateChoice({ examType: 18, voice: true }, 1), false);
});

test("the clicked option becomes the submitted answer including false judgment and multi-select removal", () => {
  assert.equal(computerChoiceAnswer(1, "A", "B"), "B");
  assert.equal(computerChoiceAnswer(5, "1", 0), "0");
  assert.equal(computerChoiceAnswer(2, "C,A", "B"), "A,B,C");
  assert.equal(computerChoiceAnswer(2, "C,A", "A"), "C");
  assert.equal(computerChoiceAnswer(2, "A", "A"), "");
});

test("question media distinguishes signed media URLs from external video pages", () => {
  assert.deepEqual(computerQuestionVideoSource({ videoUrl: "https://media.example/lesson.m3u8?signature=abc#time" }), { url: "https://media.example/lesson.m3u8?signature=abc#time", kind: "media" });
  assert.equal(computerQuestionVideoSource({ videoUrl: "https://media.example/watch?id=42" }).kind, "page");
  assert.equal(computerQuestionVideoSource({ videoUrl: "https://media.example/lesson.mp4" }).kind, "media");
  for (const videoUrl of ["javascript:alert(1)", "//media.example/lesson.mp4", "http://", "", null, 42]) assert.equal(computerQuestionVideoSource({ videoUrl }), null);
});

test("video trial preserves increment-before-check semantics and explicit authorization wins", () => {
  let count = 0;
  const trial = [];
  for (let visit = 0; visit < 5; visit++) {
    count = computerNextVideoCount(count);
    trial.push(computerQuestionVideoAllowed(count, false));
  }
  assert.deepEqual(trial, [true, true, false, false, false]);
  assert.equal(count, 4);
  assert.equal(computerQuestionVideoAllowed(count, true), true);
  assert.equal(computerQuestionVideoAllowed(count, "true"), false);
});

test("video permissions preserve source subject/category codes and a supplied school permission", () => {
  assert.equal(computerQuestionVideoPermission({ majorId: "701769479767592960" }), "wx_video_ky_data");
  assert.equal(computerQuestionVideoPermission({ majorId: "701769479767592960", examCategory: 2 }), "wx_video_term_data");
  assert.equal(computerQuestionVideoPermission({ majorId: "804349070033424384", examCategory: 2 }), "wx_video_term_java");
  assert.equal(computerQuestionVideoPermission({ majorId: "unknown", schoolPermission: "wx_video_school_specific" }), "wx_video_school_specific");
  assert.equal(computerQuestionVideoPermission({ majorId: "unknown" }), "");
  assert.equal(computerQuestionVideoPermission({ majorId: "804349070033424384", examCategory: 1 }), "");
});

test("cross-subject question video checks the subject from its knowledge path", () => {
  const question = { exerciseProperty: { knowledgeTags: ["701769479767592960,701807269960093696"] } };
  const majorId = computerKnowledgeMajorId(question, "704332467330486272");
  assert.equal(computerQuestionVideoPermission({ majorId }), "wx_video_ky_data");
});

import test from "node:test";
import assert from "node:assert/strict";
import { hasMathQuestionContent, mathQuestionPrompt, mathQuestionChoice, mathQuestionMedia } from "../src/components/math/math-question-presentation.mjs";

test("math prompts prefer resolve text while preserving original scans as a separate reference", () => {
  const image = "https://fixture.example/question.png";
  assert.deepEqual(mathQuestionPrompt({ QuestionTxt: "旧题干", QuestionImg: image }, [{ Type: "题干", Content: "求 $\\int_0^1 x^2 dx$" }]), { content: ["求 $\\int_0^1 x^2 dx$"], image });
  assert.deepEqual(mathQuestionPrompt({ QuestionTxt: "<p><br></p>", QuestionContent: "新的题干", QuestionImg: image }, [{ Content: "&nbsp;" }]), { content: ["新的题干"], image });
});

test("image-only questions do not turn a title or empty editor HTML into a replacement stem", () => {
  const image = "https://fixture.example/original.jpg";
  assert.deepEqual(mathQuestionPrompt({ QuestionTxt: "<p>&nbsp;\u200b<br></p>", Title: "第 3 题", QuestionImg: image }), { content: [], image });
  assert.deepEqual(mathQuestionPrompt({ Title: "只有文字的题目" }), { content: ["只有文字的题目"], image: "" });
  for (const value of [null, undefined, {}, [], "", "  ", "<p><br></p>", "&nbsp;", "<script>alert(1)</script>"]) assert.equal(hasMathQuestionContent(value), false);
});

test("math prompt content keeps inline diagrams, HTML tables, formula-only stems and zero", () => {
  for (const value of ["$x^2$", '<img src="https://fixture.example/diagram.png">', "![图](https://fixture.example/graph.png)", "<table><tr><td>1</td></tr></table>", 0]) assert.equal(hasMathQuestionContent(value), true);
  const diagram = '<p>如图求面积</p><img src="https://fixture.example/diagram.png">';
  assert.deepEqual(mathQuestionPrompt({ QuestionTxt: diagram }).content, [diagram]);
});

test("single math choices save on selection while multi-select, unknown keys and existing records keep explicit submission", () => {
  const single = [{ ID: 11, IsAnswer: "1" }, { ID: 12, IsAnswer: 0 }];
  assert.deepEqual(mathQuestionChoice(single), { multiple: false, immediate: true });
  assert.deepEqual(mathQuestionChoice(single, { Type: "判断题" }), { multiple: false, immediate: true });
  assert.deepEqual(mathQuestionChoice([{ ID: 11, IsAnswer: 1 }, { ID: 12, IsAnswer: 1 }]), { multiple: true, immediate: false });
  assert.deepEqual(mathQuestionChoice(single, { QuestionType: "多选题" }), { multiple: true, immediate: false });
  assert.equal(mathQuestionChoice(single, {}, { readOnly: true }).immediate, false);
  assert.equal(mathQuestionChoice([{ ID: 11 }, { ID: 12 }]).immediate, false);
});

test("math video media accepts source BusValue URLs, signed direct links and Polyv IDs without download links", () => {
  assert.deepEqual(mathQuestionMedia({ BusType: "视频解析", BusValue: "https://fixture.example/stream?token=opaque" }), { kind: "video", url: "https://fixture.example/stream?token=opaque" });
  assert.deepEqual(mathQuestionMedia({ BusType: "视频解析", BusValue: "original-polyv-vid" }), { kind: "polyv", url: "" });
  assert.deepEqual(mathQuestionMedia({ PolyvVID: "vid" }), { kind: "polyv", url: "" });
  assert.deepEqual(mathQuestionMedia({ PolyvVID: "https://fixture.example/lesson.mp4" }), { kind: "video", url: "https://fixture.example/lesson.mp4" });
  assert.deepEqual(mathQuestionMedia({ PlayVid: "https://fixture.example/lesson.mp4" }), { kind: "video", url: "https://fixture.example/lesson.mp4" });
  assert.deepEqual(mathQuestionMedia({ FileUrl: "https://fixture.example/explanation.m3u8?signature=opaque" }), { kind: "video", url: "https://fixture.example/explanation.m3u8?signature=opaque" });
  assert.equal(mathQuestionMedia({ Url: "https://fixture.example/figure.png" }).kind, "image");
  assert.equal(mathQuestionMedia({ Url: "javascript:alert(1)" }).kind, "none");
});

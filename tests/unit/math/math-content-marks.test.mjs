import test from "node:test";
import assert from "node:assert/strict";
import { mathContentLikeDelete, mathContentMarkType } from "../../../src/features/math/questions/math-content-marks.ts";

test("template resources use the source module action type; book references do not invent unsupported votes", () => {
  assert.equal(mathContentMarkType("模板资源"), "小模块");
  assert.equal(mathContentMarkType("题目详解"), "题目详解");
  assert.equal(mathContentMarkType("视频解析"), "视频解析");
  assert.equal(mathContentMarkType("历年真题"), undefined);
});

test("live content unlike requires the question_files BusID in addition to the vote record ID", () => {
  const data = mathContentLikeDelete("fixture-student", 465891, 843855);
  assert.equal(data.BusID, 843855);
  assert.equal(data.ID, 465891);
  assert.notEqual(data.BusID, data.ID);
  assert.equal(data.StuID, "fixture-student");
});

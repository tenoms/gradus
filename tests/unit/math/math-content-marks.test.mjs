import test from "node:test";
import assert from "node:assert/strict";
import { mathContentMarkType } from "../../../src/features/math/questions/math-content-marks.ts";

test("template resources use the source module mark type; book references do not invent unsupported marks", () => {
  assert.equal(mathContentMarkType("模板资源"), "小模块");
  assert.equal(mathContentMarkType("题目详解"), "题目详解");
  assert.equal(mathContentMarkType("视频解析"), "视频解析");
  assert.equal(mathContentMarkType("历年真题"), undefined);
});

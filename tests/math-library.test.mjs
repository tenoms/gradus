import test from "node:test";
import assert from "node:assert/strict";
import { mergeMathLibraryCatalog } from "../src/platforms/math-library.ts";

test("real combined catalog shape has no BusType: the source paper list supplies classification", () => {
  const all = [
    { ID: 2171, Name: "高数第七版（上）", BusValue: "通用" },
    { ID: 4953, Name: "2025年真题卷", BusValue: "数一" },
  ];
  const papers = [
    { ID: 4953, BusType: "试卷", BookYear: 2025, QuestionSearchCount: 22 },
  ];
  const result = mergeMathLibraryCatalog(all, papers);
  assert.equal(result.length, 2);
  assert.equal(result[0].BusType, "书籍");
  assert.equal(result[1].BusType, "试卷");
  assert.equal(result[1].Name, "2025年真题卷");
  assert.equal(result[1].QuestionSearchCount, 22);
  assert.equal(result.filter((row) => row.BusType === "试卷").length, 1);
  assert.equal(all[1].BusType, undefined);
});

test("paper-only additions survive an incomplete combined catalog without duplicate IDs", () => {
  const result = mergeMathLibraryCatalog(
    [{ ID: 1, Name: "教材" }, { ID: 2, Name: "旧标题" }],
    [{ ID: "2", Name: "试卷新标题" }, { ID: 3, Name: "新试卷" }],
  );
  assert.deepEqual(result.map((row) => row.BusType), ["书籍", "试卷", "试卷"]);
  assert.equal(result[1].Name, "试卷新标题");
  assert.equal(result.length, 3);
});

import test from "node:test";
import assert from "node:assert/strict";
import { bookViewPayload } from "../src/features/math/questions/reading-progress.mjs";
test("书籍解析进度保留原view业务类型、题目与书籍编号", () => {
  assert.deepEqual(
    bookViewPayload({
      stuid: "fixture-student",
      qid: 12,
      bookId: "34",
      source: "电子书",
    }),
    {
      StuID: "fixture-student",
      BusType: "02bf2d6b67684fce9d087e333cdcfcde",
      BusID: 12,
      BusValue: "1",
      System_Station_ID: 1,
      BookID: 34,
    },
  );
});
test("课程、专辑与选择题库不写成原书阅读进度", () => {
  for (const source of ["课程", "专辑", "选择题库", ""])
    assert.equal(
      bookViewPayload({ stuid: "fixture", qid: 12, bookId: 34, source }),
      undefined,
    );
  for (const source of ["电子书", "练习册", "真题"])
    assert.ok(
      bookViewPayload({ stuid: "fixture", qid: 12, bookId: 34, source }),
    );
});
test("缺少当前身份、题目或书籍时不伪造书架进度", () => {
  const context = { stuid: "fixture", qid: 12, bookId: 34, source: "真题" };
  assert.equal(bookViewPayload({ ...context, stuid: "" }), undefined);
  assert.equal(bookViewPayload({ ...context, qid: 0 }), undefined);
  assert.equal(bookViewPayload({ ...context, bookId: 0 }), undefined);
});

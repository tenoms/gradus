import test from "node:test";
import assert from "node:assert/strict";
import { mathLibraryTag, mathLibraryTagOptions, matchesMathLibraryTag, mergeMathLibraryCatalog } from "../src/features/math/library/math-library.ts";

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

test("teaching materials use their source labels independently of subject and title", () => {
  assert.equal(mathLibraryTag({ TeacherName: " 同济教材 ", Name: "概率论与数理统计", BusValue: "通用" }), "同济教材");
  assert.equal(mathLibraryTag({ TeacherName: "李*乐", Name: "660题", BusValue: "数二" }), "李*乐");
  assert.equal(mathLibraryTag({ BookAuthor: "汤*凤", Name: "1800题" }), "汤*凤");
  assert.equal(mathLibraryTag({ Name: "未知作者的专项讲义" }), "其他教辅");
});

test("papers use three non-overlapping categories and keep source metadata authoritative", () => {
  const papers = [
    { BusType: "试卷", Name: "2025年真题卷" },
    { BusType: "试卷", TeacherName: "超级真题", Name: "超级真题（2014年-2025年）" },
    { BusType: "试卷", TeacherName: "模拟试卷", Name: "27届月度模考" },
    { BusType: "试卷", TeacherName: "396真题", Name: "396-2023年真题卷" },
  ];
  assert.deepEqual(papers.map(mathLibraryTag), ["考研真题", "考研真题", "模拟试卷", "396真题"]);
  assert.equal(mathLibraryTag({ BusType: "试卷", TeacherName: "模拟试卷", Name: "396真题模拟卷" }), "模拟试卷");
  assert.equal(mathLibraryTag({ BusType: "试卷", TeacherName: "396真题", Name: "模拟测试" }), "396真题");
  assert.equal(mathLibraryTag({ BusType: "试卷", Name: "396-2022年真题卷" }), "396真题");
  assert.equal(mathLibraryTag({ BusType: "试卷", Name: "27届5月阶段测试卷" }), "模拟试卷");
  assert.equal(papers.filter(row => matchesMathLibraryTag(row, "真题", "考研真题")).length, 2);
});

test("reserved paper labels classify sparse source rows even when BusType is omitted", () => {
  for (const TeacherName of ["396真题", "模拟试卷", "超级真题"])
    assert.equal(matchesMathLibraryTag({ TeacherName }, "真题"), true);
  assert.equal(mathLibraryTag({ TeacherName: "396真题" }), "396真题");
  assert.equal(mathLibraryTag({ BusType: "书籍", TeacherName: "李*乐" }), "李*乐");
});

test("tag counts respect material kind and partition every visible row exactly once", () => {
  const books = [
    { ID: 1, TeacherName: "同济教材" },
    { ID: 2, TeacherName: "李*乐" },
    { ID: 3, TeacherName: "李*乐" },
    { ID: 4 },
    { ID: 5, BusType: "试卷", TeacherName: "模拟试卷" },
    { ID: 6, BusType: "试卷", TeacherName: "396真题" },
    { ID: 7, BusType: "试卷" },
    { ID: 8, BusType: "试卷", TeacherName: "超级真题" },
  ];
  assert.deepEqual(mathLibraryTagOptions(books, "教辅"), [
    { label: "同济教材", count: 1 }, { label: "李*乐", count: 2 }, { label: "其他教辅", count: 1 },
  ]);
  assert.deepEqual(mathLibraryTagOptions(books, "真题"), [
    { label: "考研真题", count: 2 }, { label: "模拟试卷", count: 1 }, { label: "396真题", count: 1 },
  ]);
  for (const kind of ["全部", "教辅", "真题"]) {
    const tags = mathLibraryTagOptions(books, kind);
    assert.equal(tags.reduce((total, tag) => total + tag.count, 0), books.filter(row => matchesMathLibraryTag(row, kind)).length);
    for (const row of books.filter(row => matchesMathLibraryTag(row, kind)))
      assert.equal(tags.filter(tag => matchesMathLibraryTag(row, kind, tag.label)).length, 1);
  }
  assert.equal(matchesMathLibraryTag(books[0], "真题", "同济教材"), false);
  assert.equal(matchesMathLibraryTag(books[4], "教辅", "模拟试卷"), false);
  assert.equal(matchesMathLibraryTag(books[0], "教辅", "全部标签"), true);
  assert.deepEqual(mathLibraryTagOptions([], "真题"), []);
});

test("paper merging preserves original author labels and authoritative paper categories", () => {
  const result = mergeMathLibraryCatalog([
    { ID: 1, Name: "660题", TeacherName: "李*乐" },
    { ID: 2, Name: "26届模拟卷", TeacherName: "其他" },
  ], [
    { ID: 2, TeacherName: "模拟试卷" },
    { ID: 3, Name: "396-2025年真题卷", TeacherName: "396真题" },
    { ID: 4, Name: "超级真题合集", TeacherName: "超级真题" },
  ]);
  assert.deepEqual(result.map(mathLibraryTag), ["李*乐", "模拟试卷", "396真题", "考研真题"]);
  assert.equal(result[3].TeacherName, "超级真题");
});

import test from "node:test";
import assert from "node:assert/strict";
import { groupBookCatalog, findBookCatalogChapter } from "../../../src/features/math/library/math-book-catalog.ts";

test("book sections and chapters retain source order and original question rows", () => {
  const rows = [
    { QuestionID: 91, BookChapter: "基础过关1阶 高等数学", ChapterSort: 1, ChapterName: "第1章 函数与极限" },
    { QuestionID: 92, BookChapter: "基础过关1阶 高等数学", ChapterSort: 1, ChapterName: "第1章 函数与极限" },
    { QuestionID: 41, BookChapter: "基础过关1阶 高等数学", ChapterSort: 1, ChapterName: "第3章 导数与微分" },
    { QuestionID: 32, BookChapter: "基础过关2阶 高等数学", ChapterSort: 4, ChapterName: "第1章 函数与极限" },
  ];
  const before = structuredClone(rows);
  const parts = groupBookCatalog(rows);
  assert.deepEqual(parts.map(part => part.title), ["基础过关1阶 高等数学", "基础过关2阶 高等数学"]);
  assert.deepEqual(parts[0].chapters.map(chapter => chapter.title), ["第1章 函数与极限", "第3章 导数与微分"]);
  assert.deepEqual(parts[0].chapters[0].questions.map(row => row.QuestionID), [91, 92]);
  assert.equal(parts[0].chapters[0].questions[0], rows[0]);
  assert.notEqual(parts[0].chapters[0].key, parts[1].chapters[0].key, "same chapter titles in different book sections remain independent");
  assert.deepEqual(rows, before, "grouping does not rewrite source chapter metadata");
});

test("missing chapter names remain explicitly unlabelled within their own book section", () => {
  const rows = [
    { QuestionID: 1, BookChapter: "上册", ChapterSort: 1 },
    { QuestionID: 2, BookChapter: "上册", ChapterSort: 1, ChapterName: "第一章" },
    { QuestionID: 3, BookChapter: "上册", ChapterSort: 1, ChapterName: null },
    { QuestionID: 4, BookChapter: "上册", ChapterSort: 1, ChapterName: "  " },
    { QuestionID: 5, BookChapter: "下册", ChapterSort: 2, ChapterName: null },
    { QuestionID: 6, BookChapter: "下册", ChapterSort: 2, ChapterName: "第二章" },
    { QuestionID: 7, BookChapter: "下册", ChapterSort: 2 },
  ];
  const parts = groupBookCatalog(rows);
  assert.deepEqual(parts[0].chapters.map(chapter => [chapter.title, chapter.questions.map(row => row.QuestionID)]), [["未标注章节", [1, 3, 4]], ["第一章", [2]]]);
  assert.deepEqual(parts[1].chapters.map(chapter => [chapter.title, chapter.questions.map(row => row.QuestionID)]), [["未标注章节", [5, 7]], ["第二章", [6]]]);
});

test("chapter sort changes do not split a named section and repeated section runs keep their printed order", () => {
  const parts = groupBookCatalog([
    { QuestionID: 5, BookChapter: "高等数学", ChapterSort: 4, ChapterName: "极限" },
    { QuestionID: 2, BookChapter: "高等数学", ChapterSort: 1, ChapterName: "极限" },
    { QuestionID: 3, BookChapter: "线性代数", ChapterSort: 2, ChapterName: "第一章" },
    { QuestionID: 4, BookChapter: "高等数学", ChapterSort: 3, ChapterName: "极限" },
  ]);
  assert.equal(parts.length, 3);
  assert.equal(parts[0].chapters[0].questions.length, 2);
  assert.notEqual(parts[0].key, parts[2].key);
  assert.deepEqual(parts.flatMap(part => part.chapters.flatMap(chapter => chapter.questions.map(row => row.QuestionID))), [5, 2, 3, 4]);
});

test("unsectioned books have an explicit fallback and an empty book has no invented sections", () => {
  assert.deepEqual(groupBookCatalog([]), []);
  const rows = [{ QuestionID: 1 }, { QuestionID: 2, ChapterName: null }];
  const parts = groupBookCatalog(rows);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].title, "全书");
  assert.equal(parts[0].chapters[0].title, "未标注章节");
  assert.deepEqual(parts[0].chapters[0].questions, rows);
});

test("chapter lookup uses actual question IDs across types and ignores repeated printed numbers", () => {
  const rows = [
    { ID: 10, QuestionID: 91001, BookChapter: "上册", ChapterName: "第一章", QuestionSort: 1 },
    { ID: 11, QuestionID: 92001, BookChapter: "下册", ChapterName: "第一章", QuestionSort: 1 },
  ];
  const parts = groupBookCatalog(rows);
  const found = findBookCatalogChapter(parts, "92001");
  assert.equal(found.part, parts[1]);
  assert.equal(found.chapter.questions[0], rows[1]);
  assert.equal(findBookCatalogChapter(parts, 1), undefined);
  assert.equal(findBookCatalogChapter(parts, 11), undefined);
  assert.equal(findBookCatalogChapter(parts, undefined), undefined);
  assert.equal(findBookCatalogChapter(parts, ""), undefined);
  assert.equal(findBookCatalogChapter(parts, "deleted"), undefined);
});

test("sparse section metadata preserves one section and repeated chapter labels share one leaf", () => {
  const parts = groupBookCatalog([
    { QuestionID: 1, BookChapter: " 上册 ", ChapterName: " 第一章 " },
    { QuestionID: 2, ChapterSort: 1 },
    { QuestionID: 3, ChapterName: "第二章" },
    { QuestionID: 4, ChapterName: "第一章" },
  ]);
  assert.equal(parts.length, 1);
  assert.deepEqual(parts[0].chapters.map(chapter => chapter.title), ["第一章", "未标注章节", "第二章"]);
  assert.equal(new Set(parts[0].chapters.map(chapter => chapter.key)).size, 3);
  assert.deepEqual(parts[0].chapters.map(chapter => chapter.questions.length), [2, 1, 1]);
  assert.deepEqual(parts[0].chapters[0].questions.map(row => row.QuestionID), [1, 4]);
});

test("interleaved repeated chapter names merge without absorbing unlabelled questions or changing question order", () => {
  const rows = [
    { QuestionID: 6, BookChapter: "上册", ChapterName: "第2章" },
    { QuestionID: 1, BookChapter: "上册", ChapterName: null },
    { QuestionID: 9, BookChapter: "上册", ChapterName: "第3章" },
    { QuestionID: 2, BookChapter: "上册", ChapterName: "第2章" },
    { QuestionID: 7, BookChapter: "上册", ChapterName: null },
    { QuestionID: 4, BookChapter: "上册", ChapterName: "第3章" },
    { QuestionID: 8, BookChapter: "下册", ChapterName: "第2章" },
  ];
  const parts = groupBookCatalog(rows);
  assert.deepEqual(parts[0].chapters.map(chapter => [chapter.title, chapter.questions.map(row => row.QuestionID)]), [
    ["第2章", [6, 2]], ["未标注章节", [1, 7]], ["第3章", [9, 4]],
  ]);
  assert.deepEqual(parts[1].chapters[0].questions.map(row => row.QuestionID), [8]);
  assert.equal(findBookCatalogChapter(parts, 7).chapter.title, "未标注章节");
  assert.equal(findBookCatalogChapter(parts, 4).chapter.title, "第3章");
  assert.equal(findBookCatalogChapter(parts, 8).part, parts[1]);
});

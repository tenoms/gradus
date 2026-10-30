import test from "node:test";
import assert from "node:assert/strict";
import { packetCatalogTree, packetCatalogChapters, packetChapterRequestID } from "../../../src/features/math/courses/packet-catalog-model.mjs";

const rows = [
  { ID: 100, PID: "", Title: "课程包" },
  { ID: "202", PID: 200, Sort: 2, Title: "第二章" },
  { ID: 300, PID: "100", Sort: 2, Title: "线性代数" },
  { ID: 201, PID: "200", Sort: 1, Title: "第一章", hasAuth: false, IsValid: 1 },
  { ID: 200, PID: 100, Sort: 1, Title: "高等数学" },
  { ID: 210, PID: 201, Sort: 1, Title: "视频课时", CourseID: 50 },
];

test("packet catalog groups mixed identifier types under sorted subjects and chapters without mutating source flags", () => {
  const before = structuredClone(rows);
  const tree = packetCatalogTree(rows, "100");
  assert.deepEqual(tree.map((node) => node.row.ID), [200, 300]);
  assert.deepEqual(tree[0].children.map((node) => node.row.ID), [201, "202"]);
  assert.equal(tree[0].children[0].children[0].row.CourseID, 50);
  assert.equal(tree[0].children[0].row.hasAuth, false);
  assert.equal(tree[0].children[0].row.IsValid, 1);
  assert.deepEqual(rows, before);
});

test("packet catalog preserves source order for equal sort values and keeps orphan nodes visible", () => {
  const tree = packetCatalogTree([
    { ID: "root", PID: "" },
    { ID: "b", PID: "root", Sort: 1 },
    { ID: "a", PID: "root", Sort: 1 },
    { ID: "orphan", PID: "missing", Sort: 2, State: 0 },
    { ID: "child", PID: "orphan" },
  ], "root");
  assert.deepEqual(tree.map((node) => node.row.ID), ["b", "a", "orphan"]);
  assert.equal(tree[2].children[0].row.ID, "child");
  assert.equal(tree[2].row.State, 0);
  assert.deepEqual(packetCatalogTree([], 1), []);
});

test("packet chapter requests use the first subject below the package for every deeper chapter", () => {
  assert.equal(packetChapterRequestID(rows, rows[4]), 200);
  assert.equal(packetChapterRequestID(rows, rows[3]), 200);
  assert.equal(packetChapterRequestID(rows, rows[5]), 200);
  assert.equal(packetChapterRequestID(rows, rows[2]), 300);
});

test("packet chapter requests resolve returned entries absent from the source tree and incomplete parent chains", () => {
  assert.equal(packetChapterRequestID(rows, { ID: 211, PID: "201", CourseID: 51 }), 200);
  assert.equal(packetChapterRequestID(rows.slice(1), rows[5]), 200);
  assert.equal(packetChapterRequestID([], { ID: 12, PID: 99 }), 12);
});

test("packet chapter requests recognize the real PID zero package root", () => {
  const actual = [
    { ID: 39422, PID: 0, Type: "课程包" },
    { ID: 39423, PID: 39422, Title: "高等数学" },
    { ID: 39424, PID: 39423, Title: "函数与极限" },
    { ID: 39425, PID: 39424, CourseID: 8 },
  ];
  for (const selected of actual.slice(1)) assert.equal(packetChapterRequestID(actual, selected), 39423);
  const stringRoot = actual.map((row) => ({ ...row, PID: String(row.PID) }));
  assert.equal(packetChapterRequestID(stringRoot, stringRoot[2]), 39423);
});

test("packet navigation hides invalid subtrees and course leaves while keeping valid descendant titles searchable", () => {
  const source = [
    ...rows,
    { ID: 211, PID: 201, CourseID: 51, Title: "强化练习", IsValid: "1" },
    { ID: 212, PID: 201, CourseID: 52, Title: "失效课时", IsValid: "0" },
    { ID: 213, PID: 201, Title: "失效章节", IsValid: 0 },
    { ID: 214, PID: 213, Title: "失效章节中的模块", IsValid: 1 },
    { ID: 215, PID: 201, Title: "有效子章节", CourseID: "0", IsValid: "" },
  ];
  const before = structuredClone(source);
  const tree = packetCatalogChapters(source, 100);
  const chapter = tree[0].children[0];
  assert.deepEqual(chapter.children.map((node) => node.row.ID), [215]);
  assert.match(chapter.row._searchText, /视频课时/);
  assert.match(chapter.row._searchText, /强化练习/);
  assert.match(tree[0].row._searchText, /强化练习/);
  assert.doesNotMatch(tree[0].row._searchText, /失效/);
  assert.equal(chapter.row.hasAuth, false);
  assert.deepEqual(source, before);
});

test("packet navigation retains courses as selectable content when the package has no chapter nodes", () => {
  const tree = packetCatalogChapters([
    { ID: 1, PID: 0, Type: "课程包" },
    { ID: 3, PID: 1, CourseID: "8", Title: "第二讲", Sort: 2 },
    { ID: 2, PID: 1, CourseID: 7, Title: "第一讲", Sort: 1 },
    { ID: 4, PID: 1, CourseID: 9, Title: "未开放", IsValid: 0 },
  ], 1);
  assert.deepEqual(tree.map((node) => node.row.ID), [2, 3]);
  assert.equal(tree[0].row._searchText, "第一讲");
});

test("an explicitly invalid package does not expose otherwise valid descendant chapters", () => {
  assert.deepEqual(packetCatalogChapters([
    { ID: 1, PID: 0, Type: "课程包", IsValid: "0" },
    { ID: 2, PID: 1, Title: "章节", IsValid: 1 },
  ], 1), []);
});

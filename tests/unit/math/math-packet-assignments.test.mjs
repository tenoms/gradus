import test from "node:test";
import assert from "node:assert/strict";
import { packetAssignmentGroups, mergePacketAssignmentProgress } from "../../../src/features/math/courses/packet-assignment-model.mjs";

const tree = [
  { ID: 39422, PID: 0, Type: "课程包", Title: "28数学基础课程（数一）" },
  { ID: 39503, PID: 39422, Title: "线性代数", Sort: 3 },
  { ID: 39423, PID: 39422, Title: "高等数学", Sort: 1 },
  { ID: 39429, PID: 39423, Title: "第2章 导数与微分", Sort: 2 },
  { ID: 39424, PID: 39423, Title: "第1章 极限与连续", Sort: 1 },
  { ID: 39426, PID: 39424, Title: "【模块2】极限的运算与存在准则", CourseID: 1615, Sort: 2 },
  { ID: 39425, PID: 39424, Title: "【模块1】极限的定义与性质", CourseID: 1613, Sort: 1 },
  { ID: 39430, PID: 39429, Title: "【模块1】导数与微分的概念与性质", CourseID: 1618, Sort: 1 },
  { ID: 39504, PID: 39503, Title: "第1章 行列式", Sort: 1 },
  { ID: 39505, PID: 39504, Title: "【模块1】行列式的定义与性质", CourseID: 1700, Sort: 1 },
];

function task(ID, CourseID, content = [], more = {}) {
  return { ID, CourseID, BusID: ID + 800, BusType: 8, _book_highscorealbum_catalog_content: content, ...more };
}
function work(ID, more = {}) {
  return { ID, BusID: ID + 9000, BusValue: "0", BusType: "试卷", Type: "作业", _c_paper: { Name: `真实作业 ${ID}` }, ...more };
}
function modules(groups) {
  return groups.flatMap((group) => group.chapters.flatMap((chapter) => chapter.modules));
}

test("packet assignments follow source subjects, chapters and modules instead of returned task order", () => {
  const tasks = [task(4, 1700, [work(4)]), task(3, 1618, [work(3)]), task(2, "1615", [work(2)]), task(1, 1613, [work(1)])];
  const before = structuredClone(tasks);
  const groups = packetAssignmentGroups(tasks, tree, "39422");
  assert.deepEqual(groups.map((group) => group.title), ["高等数学", "线性代数"]);
  assert.deepEqual(groups[0].chapters.map((chapter) => chapter.title), ["第1章 极限与连续", "第2章 导数与微分"]);
  assert.deepEqual(groups[0].chapters[0].modules.map((module) => module.id), ["1", "2"]);
  assert.equal(groups[0].chapters[0].modules[0].assignments[0].title, "真实作业 1");
  assert.equal(groups[0].chapters[0].modules[0].task, tasks[3]);
  assert.deepEqual(tasks, before);
});

test("assignment grouping keeps invalid-tree tasks, unknown tasks, duplicate-course tasks and empty albums", () => {
  const source = tree.map((row) => row.ID === 39424 ? { ...row, IsValid: 0 } : row);
  const tasks = [task(1, 1613), task(2, 1613, [work(2)]), task(3, 99999, [], { _book_highscorealbum: { Title: "目录外专辑" } })];
  const groups = packetAssignmentGroups(tasks, source, 39422);
  assert.equal(modules(groups).length, 3);
  assert.deepEqual(groups[0].chapters[0].modules[0].assignments, []);
  assert.equal(groups[0].chapters[0].modules[0].task, tasks[0]);
  assert.equal(groups.at(-1).title, "其他作业");
  assert.equal(groups.at(-1).chapters[0].modules[0].title, "目录外专辑");
  assert.deepEqual(packetAssignmentGroups([], tree, 39422), []);
});

test("self-assessed assignments require a finished summary and preserve a zero score and completion date", () => {
  const content = [
    work(1),
    work(2, { _c_course_users_record: [{ BusRelationID: 5, IsFinished: 1 }] }),
    work(3, { _c_course_users_record: { BusRelationID: 0, IsFinished: 0 } }),
    work(4, { _c_course_users_record: [{ BusRelationID: null, IsFinished: 1 }] }),
    work(5, { _c_course_users_record: [{ BusRelationID: "0", IsFinished: "1", BusValue: 0, AddTime: "2026-10-30 10:00:00" }] }),
  ];
  const works = modules(packetAssignmentGroups([task(1, 1613, content)], tree, 39422))[0].assignments;
  assert.deepEqual(works.map((item) => item.status), ["pending", "in-progress", "in-progress", "in-progress", "completed"]);
  assert.equal(works[4].score, 0);
  assert.equal(works[4].completedAt, "2026-10-30 10:00:00");
  assert.equal(works[4].statusLabel, "已完成");
  assert.equal(works[4].row, content[4]);
});

test("teacher assignments distinguish work in progress, submitted grading and published scores", () => {
  const content = [
    work(1, { BusValue: "1" }),
    work(2, { BusValue: 1, _c_paper_student: { StuState: 0, TeacherState: 0 } }),
    work(3, { BusValue: 1, _c_paper_student: { StuState: 1, TeacherState: 0, Score: 99 } }),
    work(4, { BusValue: 1, _c_paper_student: { StuState: 1, TeacherState: 1, Score: 0, UpdateTime: "2026-10-30T10:00:00" } }),
  ];
  const works = modules(packetAssignmentGroups([task(1, 1613, content)], tree, 39422))[0].assignments;
  assert.deepEqual(works.map((item) => item.status), ["pending", "in-progress", "grading", "completed"]);
  assert.ok(works.every((item) => item.isTeacher));
  assert.equal(works[2].statusLabel, "待批阅");
  assert.equal(works[2].score, undefined);
  assert.equal(works[3].score, 0);
  assert.equal(works[3].completedAt, "2026-10-30T10:00:00");
});

test("multiple assignments in one album retain paper names and stable content sort", () => {
  const tasks = [task(1, 1613, [work(2, { Sort: 2 }), work(1, { Sort: 1 }), work(3, { Sort: 2 })])];
  const assignments = modules(packetAssignmentGroups(tasks, tree, 39422))[0].assignments;
  assert.deepEqual(assignments.map((item) => item.id), ["1", "2", "3"]);
  assert.deepEqual(assignments.map((item) => item.title), ["真实作业 1", "真实作业 2", "真实作业 3"]);
});

test("album videos, non-assignment papers and missing paper identities are not counted as assignments", () => {
  const content = [
    work(1),
    work(2, { BusType: "视频" }),
    work(3, { Type: "例题" }),
    work(4, { BusID: 0 }),
  ];
  const result = modules(packetAssignmentGroups([task(1, 1613, content)], tree, 39422));
  assert.deepEqual(result[0].assignments.map((item) => item.id), ["1"]);
  const empty = modules(packetAssignmentGroups([task(2, 1613, content.slice(1))], tree, 39422));
  assert.equal(empty.length, 1);
  assert.deepEqual(empty[0].assignments, []);
});

test("direct ordinary and teacher paper tasks become one real assignment with their own record contracts", () => {
  const ordinary = task(1, 1613, [], {
    BusType: 3, _Paper: { Name: "直接自评作业" },
    _record: [{ BusRelationID: 0, IsFinished: 1, BusValue: "0", AddTime: "2026-10-30 10:00:00" }],
  });
  const teacher = task(2, 1615, [], {
    BusType: 6, _Paper: { Name: "直接人工作业" },
    _c_paper_student: { StuState: 1, TeacherState: 0 },
  });
  const result = modules(packetAssignmentGroups([teacher, ordinary], tree, 39422));
  assert.equal(result[0].assignments[0].row, ordinary);
  assert.equal(result[0].assignments[0].title, "直接自评作业");
  assert.equal(result[0].assignments[0].status, "completed");
  assert.equal(result[0].assignments[0].score, "0");
  assert.equal(result[0].assignments[0].isTeacher, false);
  assert.equal(result[1].assignments[0].row, teacher);
  assert.equal(result[1].assignments[0].isTeacher, true);
  assert.equal(result[1].assignments[0].status, "grading");
});

test("personal assignment progress matches parent course, calendar, product and paper identities without modifying sources", () => {
  const tasks = [task(1, 1613, [
    work(1, { CourseID: 999, _c_course_users_record: [{ IsFinished: 1, BusRelationID: 0 }], _c_paper_student: { TeacherState: 1 } }),
    work(2, { BusValue: 1, _c_course_users_record: [{ IsFinished: 1, BusRelationID: 0 }], _c_paper_student: { TeacherState: 1, Score: 99 } }),
  ], { CalendarID: 4489 })];
  const scope = { CourseID: 1613, CalendarID: 4489, ProductID: 3531, BusID: 9001, BusType: 3 };
  const records = [
    { ...scope, ID: 1, IsFinished: 1, BusRelationID: "0", BusValue: 0, AddTime: "2026-10-30 10:00:00" },
    { ...scope, ID: 2, IsFinished: 1, BusRelationID: 11 },
    { ...scope, ID: 3, CourseID: 1615 },
    { ...scope, ID: 4, CalendarID: 4491 },
    { ...scope, ID: 5, ProductID: 3555 },
    { ...scope, ID: 6, BusID: 9009 },
    { ...scope, ID: 7, BusType: 2 },
    { ...scope, ID: 8, ProductID: undefined },
  ];
  const teacherScope = { ProductID: "3531", CourseID: "1613", BusID: "4489", PaperID: "9002", StuState: 1, TeacherState: 1 };
  const students = [
    { ...teacherScope, ID: 9, ProductID: 3555, Score: 99 },
    { ...teacherScope, ID: 10, CourseID: 1615, Score: 99 },
    { ...teacherScope, ID: 11, BusID: 4491, Score: 99 },
    { ...teacherScope, ID: 12, PaperID: 9009, Score: 99 },
    { ...teacherScope, ID: 13, Score: 0, UpdateTime: "2026-10-30T10:00:00" },
  ];
  const before = structuredClone({ tasks, records, students });
  const merged = mergePacketAssignmentProgress(tasks, records, students, 3531);
  const content = merged[0]._book_highscorealbum_catalog_content;
  assert.deepEqual(content[0]._c_course_users_record.map((row) => row.ID), [1, 2]);
  assert.equal(content[0]._c_paper_student, null);
  assert.equal(content[1]._c_paper_student.ID, 13);
  assert.deepEqual(content[1]._c_course_users_record, []);
  const works = modules(packetAssignmentGroups(merged, tree, 39422))[0].assignments;
  assert.deepEqual(works.map((row) => row.status), ["completed", "completed"]);
  assert.deepEqual(works.map((row) => row.score), [0, 0]);
  assert.deepEqual({ tasks, records, students }, before);
  assert.notEqual(merged[0], tasks[0]);
  assert.notEqual(content[0], tasks[0]._book_highscorealbum_catalog_content[0]);
});

test("unmatched personal progress replaces shared source completion and only summary zero completes self assessment", () => {
  const tasks = [task(1, 1613, [
    work(1, { _c_course_users_record: [{ BusRelationID: 0, IsFinished: 1, BusValue: 100 }] }),
    work(2, { BusValue: 1, _c_paper_student: { TeacherState: 1, Score: 100 } }),
  ], { CalendarID: 4489, _record: [{ IsFinished: 1 }] })];
  const records = [{ ProductID: 3531, CourseID: 1613, CalendarID: 4489, BusID: 9001, BusType: 3, BusRelationID: 11, IsFinished: 1 }];
  const merged = mergePacketAssignmentProgress(tasks, records, [], 3531);
  const works = modules(packetAssignmentGroups(merged, tree, 39422))[0].assignments;
  assert.deepEqual(works.map((row) => row.status), ["in-progress", "pending"]);
  assert.ok(works.every((row) => row.score === undefined));
  assert.equal(merged[0]._book_highscorealbum_catalog_content[1]._c_paper_student, null);
  assert.deepEqual(merged[0]._record, []);
});

test("direct paper tasks use local ordinary records and teacher student summaries under the exact product scope", () => {
  const tasks = [
    task(1, 1613, [], { BusType: 3, BusID: 9001, CalendarID: 4489, ProductID: 3555, _c_course_users_record: [{ BusRelationID: 0, IsFinished: 1 }] }),
    task(2, 1615, [], { BusType: 6, BusID: 9002, CalendarID: 4491, _c_paper_student: { TeacherState: 1, Score: 99 } }),
  ];
  const records = [
    { ID: 1, ProductID: 3531, CourseID: 1613, CalendarID: 4489, BusID: 9001, BusType: 3, BusRelationID: 0, IsFinished: 1 },
    { ID: 2, ProductID: 3555, CourseID: 1613, CalendarID: 4489, BusID: 9001, BusType: 3, BusRelationID: 0, IsFinished: 1, BusValue: 0 },
  ];
  const students = [{ ID: 3, ProductID: 3531, CourseID: 1615, BusID: 4491, PaperID: 9002, StuState: 1, TeacherState: 0 }];
  const merged = mergePacketAssignmentProgress(tasks, records, students, 3531);
  assert.deepEqual(merged[0]._record.map((row) => row.ID), [2]);
  assert.equal(merged[0]._c_course_users_record, null);
  assert.equal(merged[0]._c_paper_student, null);
  assert.equal(merged[1]._c_paper_student.ID, 3);
  assert.deepEqual(merged[1]._record, []);
  const works = modules(packetAssignmentGroups(merged, tree, 39422)).flatMap((module) => module.assignments);
  assert.deepEqual(works.map((row) => row.status), ["completed", "grading"]);
  assert.equal(works[0].score, 0);
});

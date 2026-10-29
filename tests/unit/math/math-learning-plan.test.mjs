import test from "node:test";
import assert from "node:assert/strict";
import { albumStage, groupMathAlbums, initialMathSubject, matchesMathSubject, mathMenuTree, weeklySubjectCode, weeklyStageCode } from "../../../src/features/math/preparation/learning-plan-model.mjs";

test("weekly papers derive the original question-scope codes from the shared preparation target", () => {
  assert.equal(weeklySubjectCode("数一"), "10,13,14,15");
  assert.equal(weeklySubjectCode("数二"), "11,13,15");
  assert.equal(weeklySubjectCode("数三"), "12,14,15");
  assert.equal(weeklyStageCode("基础"), "1");
  assert.equal(weeklyStageCode("强化"), "2");
  assert.equal(weeklyStageCode("真题"), "2");
  assert.equal(weeklyStageCode("冲刺"), "3");
});

test("math albums follow preparation stages before upstream sort, with unclassified topics last", () => {
  const rows = [{ ID: 1, Title: "冲刺模拟", Sort: 0 }, { ID: 2, Title: "强化方法", Sort: 2 }, { ID: 3, Title: "基础概念", Sort: 99 }, { ID: 4, Title: "历年真题" }, { ID: 5, Title: "专题精讲" }];
  assert.deepEqual(groupMathAlbums(rows).map(g => [g.name, g.rows[0].ID]), [["基础", 3], ["强化", 2], ["真题", 4], ["冲刺", 1], ["专题拓展", 5]]);
  assert.equal(albumStage({ Title: "基础到强化" }), "基础");
  assert.equal(albumStage({ Stage: "强化", Title: "基础知识整理" }), "强化");
});
test("a persisted target is seeded from multi-subject profile values and keeps common materials", () => {
  assert.equal(initialMathSubject("数二,数三"), "数二");
  assert.equal(initialMathSubject(null), "数一");
  assert.equal(matchesMathSubject({ BusValue: "数一,数二" }, "数二"), true);
  assert.equal(matchesMathSubject({ BusValue: "数一" }, "数三"), false);
  assert.equal(matchesMathSubject({ BusValue: "通用" }, "数二"), true);
  assert.equal(matchesMathSubject({ BusValue: "数学课程" }, "数二"), true);
});
test("album stage comes from the actual stage parent and stage headers are not displayed as albums", () => {
  const grouped = groupMathAlbums([{ ID: 4, PID: 0, Title: "基础阶段", Sort: 1 }, { ID: 5, PID: 0, Title: "强化阶段", Sort: 2 }, { ID: 14, PID: 4, Title: "小白准备知识" }, { ID: 20, PID: 5, Title: "概念题专辑" }]);
  assert.deepEqual(grouped.map(group => [group.name, group.rows.map(row => row.ID)]), [["基础", [14]], ["强化", [20]]]);
});
test("exam-point menus preserve parent-child structure instead of opening parent headers as collections", () => {
  const rows = [{ ID: 1, PID: "", StandardName: "高等数学" }, { ID: 2, PID: 1, StandardName: "极限" }, { ID: 3, PID: 99, StandardName: "独立专题" }];
  const tree = mathMenuTree(rows);
  assert.deepEqual(tree.map(row => row.ID), [1, 3]);
  assert.equal(tree[0].children[0].ID, 2);
  assert.equal(rows[0].children, undefined);
});

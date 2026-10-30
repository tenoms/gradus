import test from "node:test";
import assert from "node:assert/strict";
import { discussionTree } from "../../../src/features/math/community/discussion-model.mjs";
test("flat source reply rows form the intended nested conversation without mutating upstream rows", () => {
  const rows = [
    { ID: 20, PID: 10 },
    { ID: 30, PID: 20 },
    { ID: 21, PID: 10 },
  ];
  const tree = discussionTree(rows, 10);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].children[0].ID, 30);
  assert.equal(rows[0].children, undefined);
});
test("existing reply recipients and orphan floors remain readable with mixed identifier types", () => {
  const tree = discussionTree([
    { ID: 20, PID: "10", Level: 2, Txt: "已有回复" },
    { ID: "30", PID: "20", Level: 3, toUserNick: "学习者", Txt: "楼层中的回复" },
    { ID: 40, PID: 999, Level: 3, Txt: "原父楼层不可用的回复" },
  ], 10);
  assert.deepEqual(tree.map((row) => row.ID), [20, 40]);
  assert.equal(tree[0].children[0].toUserNick, "学习者");
  assert.equal(tree[0].children[0].Txt, "楼层中的回复");
  assert.equal(tree[1].Txt, "原父楼层不可用的回复");
});

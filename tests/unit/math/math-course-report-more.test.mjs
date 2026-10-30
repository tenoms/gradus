import test from "node:test";
import assert from "node:assert/strict";
import {
  courseDistribution,
  courseQuestionAccuracy,
  courseRankingRequest,
  courseRankingVote,
  courseRankingVoteResult,
  reconcileCourseRanking,
  latestCourseExamParams,
  latestCourseScore,
} from "../../../src/features/math/courses/course-report-more-model.mjs";
const context = {
  stuid: "fixture",
  CourseID: 1,
  CalendarID: 2,
  PaperID: 3,
  ProductID: 4,
};
test("课程榜单用本人实际点赞记录纠正缓存的空状态，保留其他人的计数", () => {
  assert.deepEqual(reconcileCourseRanking([
    { id: 10, GiveState: null, GiveCount: 2 },
    { id: 11, GiveState: null, GiveCount: 3 },
  ], [{ ID: 25, BusID: 10 }]), [
    { id: 10, GiveState: 25, GiveCount: 3 },
    { id: 11, GiveState: null, GiveCount: 3 },
  ]);
});
test("课程榜单撤赞后刷新去掉缓存的本人旧赞", () => {
  assert.deepEqual(reconcileCourseRanking([
    { id: 10, GiveState: 25, GiveCount: 1 },
  ], []), [{ id: 10, GiveState: null, GiveCount: 0 }]);
});
test("课程榜单保存返回编号后立即可撤赞，无编号不显示成功", () => {
  const added = courseRankingVoteResult({ id: 10, GiveState: null, GiveCount: 0 }, 25);
  assert.deepEqual(added, { id: 10, GiveState: 25, GiveCount: 1 });
  assert.deepEqual(courseRankingVoteResult(added, true), { id: 10, GiveState: null, GiveCount: 0 });
  assert.throws(() => courseRankingVoteResult({ id: 10 }, null), /尚未确认点赞成功，请刷新榜单后核对。/);
  assert.throws(() => courseRankingVoteResult({ id: 10 }, true), /尚未确认点赞成功，请刷新榜单后核对。/);
});
test("课程普通与精批全榜使用各自原记录编号合约", () => {
  assert.deepEqual(courseRankingRequest(context), {
    command: "GetPaperScoreByList",
    params: { StuID: "fixture", CourseID: 1, CalendarID: 2, BusID: 3 },
  });
  assert.deepEqual(courseRankingRequest({ ...context, isTeacher: true }), {
    command: "GetMarkPaperScoreByList",
    params: {
      StuID: "fixture",
      CourseID: 1,
      CalendarID: 2,
      PaperID: 3,
      ProductID: 4,
    },
  });
});
test("课程榜单点赞指向记录row.id，撤赞只删除本人已有GiveState", () => {
  assert.deepEqual(courseRankingVote("fixture", { id: 91 }), {
    path: "/api/sys_give/Inner_sys_give",
    data: {
      BusType: 3,
      BusID: 91,
      Content: 1,
      StuID: "fixture",
      Type: 1,
    },
  });
  assert.deepEqual(courseRankingVote("fixture", { id: 91, GiveState: 92 }), {
    path: "/api/sys_give/Del_sys_give",
    data: { ID: 92 },
  });
});
test("最近模拟成绩保留原Use年份与课程上下文，不混用当前年份", () => {
  assert.deepEqual(
    latestCourseExamParams(context, { Use: 2023, PaperNotes: "数一" }, true),
    {
      StuID: "fixture",
      CourseID: 1,
      PaperNotes: "数一",
      Year: 2023,
      ProductID: 4,
    },
  );
  assert.equal(
    "ProductID" in latestCourseExamParams(context, { Use: 2023 }),
    false,
  );
  assert.equal(latestCourseScore({ score: 0 }), 0);
  assert.equal(latestCourseScore({}), null);
});
test("主观题群体得分率按原累计分值除以次数与满分，空统计不造零分", () => {
  assert.equal(courseQuestionAccuracy({ rightcount: 130, count: 10 }, 15), 86);
  assert.equal(courseQuestionAccuracy({ rightcount: 0, count: 10 }, 15), 0);
  assert.equal(courseQuestionAccuracy({ rightcount: 0, count: 0 }, 15), null);
  assert.equal(courseQuestionAccuracy(undefined, 15), null);
});
test("模拟成绩分布沿用原六档a1至a6，空响应不伪造柱状图", () => {
  assert.deepEqual(courseDistribution(undefined), []);
  assert.deepEqual(
    courseDistribution({ a1: 0, a2: 2 }).map((row) => row.count),
    [0, 2, 0, 0, 0, 0],
  );
});

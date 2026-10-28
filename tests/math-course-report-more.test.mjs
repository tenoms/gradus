import test from "node:test";
import assert from "node:assert/strict";
import {
  courseDistribution,
  courseQuestionAccuracy,
  courseRankingRequest,
  courseRankingVote,
  latestCourseExamParams,
  latestCourseScore,
} from "../src/components/math/course-report-more-model.mjs";
const context = {
  stuid: "fixture",
  CourseID: 1,
  CalendarID: 2,
  PaperID: 3,
  ProductID: 4,
};
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
      System_Station_ID: 1,
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
      System_Station_ID: 1,
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

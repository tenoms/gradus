import test from "node:test";
import assert from "node:assert/strict";
import { validatePlatformRequest } from "../../server/integrations/platform-policy.mjs";
import { startHttpApp, testLearner } from "../support/http-app.mjs";

const removedPaths = [
  "/api/question_order_comments/Del_question_order_comments",
  "/api/question_order_comments/Inner_question_order_comments",
  "/api/question_order_comments/UpdateNotes",
  "/api/question_order_level/Inner_question_order_level",
  "/api/question_order_log/Inner_question_order_log",
  "/api/question_orders/Del_question_orders",
  "/api/question_orders/Inner_question_orders",
  "/api/question_teacher_work/Inner_question_teacher_work",
  "/api/sys_attachment/UpFile",
];
const removedCommands = [
  "CheckIsHelpQuestionTeacher_new", "CheckUserIsQuestionTeacher",
  "GetAnswerTeacherCounts", "GetAnswerTeacherCounts_fx", "GetAnswerUserCounts", "GetAnswerUserUnFinishCounts",
  "GetCurrentProblemIsTeacher_new", "GetHelpQuestionInfoByKey_new", "GetHelpQuestionListByStuID_new",
  "GetHelpQuestionProblemListByKey_new", "GetHelpTeacherList_new", "GetNewAnswerTeacherCounts",
  "GetNewQuestionOrderAnswerRefuseListOfTeacher", "GetNewQuestionOrderAnswerlistOfTeacher", "GetNewQuestionOrderUnAnswerList",
  "GetProblemAIContent_new", "GetQuestionOrderCommentList", "GetQuestionOrderCountsList", "GetQuestionOrderInfo",
  "GetQuestionOrderNewInfoByID", "GetQuestionOrderUnAnswerListOfTeacher", "GetQuestionOrderUnCommentListOfTeacher",
  "GetQuestionOrderUnCommentListOfTeacherNewLimits", "GetQuestionProblemListState", "GetQuestionPropertyInfo_dy",
  "GetQuestionTeacherAnswerDetailList", "GetQuestionTeacherWorkToday", "GetSystemProblemLabel_new", "GetTeacherInfoOfAccountID",
  "GetTeacherProblemStateInfo_new", "GetTeacherProblemUnReadInfo_new", "GetTeacherQuestionListByStuID2_new",
  "GetTeacherWaitAnswerCounts", "GetTeacherWaitList_new", "GetUserProblemBookList_new", "GetUserProblemLabel_new",
  "GetUserProblemPushQuestion_new", "GetUserProblemQuestionInfoList_new", "GetUserProblemQuestionList_new",
  "GetUserProblemStatistics_new", "GetUserProblemTeacherCount_new", "GetUserQuestionOrderCounts", "GetUserQuestionOrderLevel",
  "GetUserQuestionOrderLevelOfTeacher", "GetUserQuestionOrderList", "getNewQuestionOrderLevelListOfTeacher",
  "getUserQABookList", "getUserQAChaperList", "getUserQADetailListByBookID", "getUserQADetailListByChapter",
  "getUserQADetailListByMonth", "getUserQAInfo", "getUserQAMonthList",
];

test("teacher QA orders, followups, reports and work desks are no longer enabled", () => {
  for (const path of removedPaths)
    assert.throws(() => validatePlatformRequest("math", { path, method: "POST" }), { status: 403 }, path);
  for (const command of removedCommands)
    for (const path of ["/api/Master/AutoModel", "/api/Master/Model"])
      assert.throws(() => validatePlatformRequest("math", {
        path, method: "POST", data: { command, data: "{}" },
      }), { status: 403 }, command);
});

test("ordinary discussions, image uploads, photo indexing roles and course grading remain enabled", () => {
  for (const path of [
    "/api/sys_comment/GetUser", "/api/sys_comment/Read", "/api/sys_msg_push/GetListByPagev2",
    "/api/question_teachers/GetListByPage", "/api/sys_attachment/LayuiUpImg", "/api/sys_attachment/SearchUploadImg",
    "/api/c_paper_student/Inner_c_paper_student", "/api/c_paper_student_record/Inner_c_paper_student_record",
    "/api/c_paper_student_recommend/Inner_c_paper_student_recommend",
  ]) assert.doesNotThrow(() => validatePlatformRequest("math", { path, method: "POST" }), path);
  for (const command of [
    "GetDiscussListByPID", "GetUserReplyCommentList_lt", "GetUserReplyCommentNoReadCount_ltmath",
    "GetAlbumTecherPaperOperationinfo", "GetMarkPaperScoreByList",
  ]) assert.doesNotThrow(() => validatePlatformRequest("math", {
    path: "/api/Master/AutoModel", method: "POST", data: { command, data: "{}" },
  }), command);
});

test("removed teacher QA writes and voice uploads are rejected before contacting the source", async () => {
  let forwarded = 0;
  const app = await startHttpApp({
    yybRequest: async () => [{ id: 7, nickname: "测试账号" }],
    loginPlatform: async () => ({ connected: true, token: "test-token", stuId: "test-student", user: {} }),
    mathRequest: async () => { forwarded++; return {}; },
    requestJson: async () => { forwarded++; return {}; },
  });
  try {
    const admin = await app.setup();
    await app.createUser(admin, testLearner("removed.math.qa", "7"));
    const auth = await app.login("learning", "removed.math.qa", "learner-password-123");
    for (const body of [
      { path: "/api/question_orders/Inner_question_orders", method: "POST", data: { QuestionID: 8 } },
      { path: "/api/question_order_comments/Inner_question_order_comments", method: "POST", data: { BusID: 8 } },
      { path: "/api/Master/AutoModel", method: "POST", data: { command: "GetUserQuestionOrderList", data: "{}" } },
      { path: "/api/Master/Model", method: "POST", data: { command: "GetHelpTeacherList_new", data: "{}" } },
    ]) assert.equal((await app.request("/api/learning/platform/math", { auth, body })).status, 403);
    const upload = await app.request("/api/learning/platform/math/upload?path=%2Fapi%2Fsys_attachment%2FUpFile", {
      auth, body: Buffer.from("voice"), headers: { "content-type": "multipart/form-data; boundary=fixture" },
    });
    assert.equal(upload.status, 403);
    assert.equal(forwarded, 0);
  } finally {
    await app.close();
  }
});

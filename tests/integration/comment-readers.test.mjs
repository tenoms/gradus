import test from "node:test";
import assert from "node:assert/strict";
import { startHttpApp, testLearner } from "../support/http-app.mjs";

async function fixture() {
  const calls = [];
  const root = { ID: 10, Level: 1, PID: 0, BusID: 42, BusType: "题目讨论区", Txt: "已有题目评论", Count: 1 };
  const reply = { ID: 11, Level: 2, PID: 10, BusID: 42, BusType: "题目讨论区", Txt: "已有楼层回复" };
  const app = await startHttpApp({
    yybRequest: async () => [{ id: "7", status: "alive", nickname: "测试来源" }],
    loginPlatform: async (platform) => ({
      connected: true, token: "fixture-token", stuId: "source-student",
      user: platform === "math" ? { StuID: "source-student" } : { userId: "source-user" },
    }),
    mathRequest: async (path, input) => {
      calls.push({ platform: "math", path, method: input.method });
      if (path === "/api/sys_comment/GetUser") {
        assert.equal(input.method, "GET");
        return { SuccessResponse: true, data: [{ ...root, _sys_comment: [reply] }] };
      }
      if (path === "/api/Master/AutoModel") {
        assert.equal(input.method, "POST");
        if (input.data.command === "GetCommentInfoByID_lt")
          return { SuccessResponse: true, data: [[root]] };
        if (input.data.command === "GetCommentLevelList_lt")
          return { SuccessResponse: true, data: [[reply]] };
      }
      if (path === "/api/sys_give/GetListBypage" && Number(input.query.BusType) === 2 && Number(input.query.Type) === 2) {
        assert.equal(input.method, "GET");
        return { SuccessResponse: true, data: [{ ID: 30, BusType: 2, Type: 2, Content: "已有视频评价", BusNumber: 5 }] };
      }
      assert.fail(`unexpected shared math request: ${path}`);
    },
    computerRequest: async (path, input) => {
      calls.push({ platform: "computer", path, method: input.method });
      assert.equal(input.method, "GET");
      if (path === "/api/exam/wx/course/comment/list")
        return { code: 200, data: { list: [{ id: "course-comment", content: "已有课程评价" }], total: 1, pages: 1 } };
      if (path === "/api/user/wx/actSign/content/comment/list")
        return { code: 200, data: { list: [{ id: "activity-comment", comment: "已有学习动态评论" }], total: 1, pages: 1 } };
      assert.fail(`unexpected shared computer request: ${path}`);
    },
  });
  const admin = await app.setup();
  for (const username of ["comment.reader.first", "comment.reader.second"])
    await app.createUser(admin, testLearner(username, "7"));
  const first = await app.login("learning", "comment.reader.first", "learner-password-123");
  const second = await app.login("learning", "comment.reader.second", "learner-password-123");
  const invoke = async (auth, platform, input) => {
    const response = await app.request(`/api/learning/platform/${platform}`, { auth, body: input });
    const value = await response.json();
    assert.equal(response.status, 200, JSON.stringify(value));
    return value;
  };
  return { app, calls, first, second, invoke };
}

test("existing math discussion roots, reply floors and video ratings remain readable through authenticated HTTP", async () => {
  const { app, calls, first, invoke } = await fixture();
  try {
    const list = await invoke(first, "math", {
      path: "/api/sys_comment/GetUser", method: "GET", query: { ID: 42, page: 1, limit: 20, SortDesc: "" },
    });
    assert.equal(list.data[0].Txt, "已有题目评论");
    assert.equal(list.data[0]._sys_comment[0].Txt, "已有楼层回复");
    const command = (name, parameters) => invoke(first, "math", {
      path: "/api/Master/AutoModel", method: "POST", data: { command: name, data: JSON.stringify(parameters) },
    });
    const detail = await command("GetCommentInfoByID_lt", { ID: 10 });
    assert.equal(detail.data[0][0].Txt, "已有题目评论");
    const floors = await command("GetCommentLevelList_lt", { PID: 10, BusID: 42, BusType: "题目讨论区" });
    assert.equal(floors.data[0][0].Txt, "已有楼层回复");
    assert.equal(floors.data[0][0].PID, 10);
    const ratings = await invoke(first, "math", {
      path: "/api/sys_give/GetListBypage", method: "GET",
      query: { BusType: 2, Type: 2, BusValue: "video-fixture", BusID: 99, page: 1, limit: 10 },
    });
    assert.equal(ratings.data[0].Content, "已有视频评价");
    assert.equal(ratings.data[0].BusNumber, 5);
    assert.equal(calls.length, 4, "each requested existing comment resource reaches its reader");
  } finally { await app.close(); }
});

test("existing computer course and activity comments remain readable through authenticated HTTP", async () => {
  const { app, calls, first, invoke } = await fixture();
  try {
    const course = await invoke(first, "computer", {
      path: "/api/exam/wx/course/comment/list", method: "GET", query: { courseId: "course-1", pageNum: 1, pageSize: 50 },
    });
    assert.equal(course.data.list[0].content, "已有课程评价");
    const activity = await invoke(first, "computer", {
      path: "/api/user/wx/actSign/content/comment/list", method: "GET", query: { cid: "activity-1", pageNum: 1, pageSize: 100 },
    });
    assert.equal(activity.data.list[0].comment, "已有学习动态评论");
    assert.deepEqual(calls.map((call) => call.method), ["GET", "GET"]);
  } finally { await app.close(); }
});

test("content emphasis marks still save locally and read back by file, content type and Web owner", async () => {
  const { app, calls, first, second, invoke } = await fixture();
  try {
    const mark = { BusType: 1, Type: 4, BusID: 42, BaseType: "视频解析", BusValue: 501 };
    const scopes = [mark, { ...mark, BusValue: 502 }, { ...mark, BaseType: "小模块" }];
    const ids = [];
    for (const data of scopes) {
      const saved = await invoke(first, "math", { path: "/api/sys_give/Inner_sys_give", method: "POST", data });
      assert.equal(saved.storage, "web");
      assert.ok(Number(saved.data) > 0);
      ids.push(saved.data);
    }
    const read = (auth, scope) => invoke(auth, "math", {
      path: "/api/sys_give/GetListBypage", method: "GET", query: { ...scope, page: 1, limit: 10 },
    });
    for (const [index, scope] of scopes.entries()) {
      const own = await read(first, scope);
      assert.equal(own.storage, "web");
      assert.deepEqual(own.data.map((row) => row.ID), [ids[index]]);
      assert.equal(own.data[0].BusValue, scope.BusValue);
      assert.equal(own.data[0].BaseType, scope.BaseType);
      assert.deepEqual((await read(second, scope)).data, [], "another Web user cannot inherit the mark");
    }
    assert.equal(calls.length, 0, "emphasis mark reads and writes never use shared comment resources");
  } finally { await app.close(); }
});

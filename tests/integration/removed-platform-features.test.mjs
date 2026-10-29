import test from "node:test";
import assert from "node:assert/strict";
import { validatePlatformRequest } from "../../server/integrations/platform-policy.mjs";
import { startHttpApp, testLearner } from "../support/http-app.mjs";

test("removed release notifications cannot be read or mutated through the learning proxy", () => {
  for (const path of [
    "/api/content_list/GetListByAll",
    "/api/content_list/GetListByPage",
    "/api/content_list_log/Inner_content_list_log",
    "/api/content_list_log/InnerAll_content_list_log",
    "/api/content_list_log/Del_content_list_log",
  ])
    assert.throws(() => validatePlatformRequest("math", { path }), { status: 403 });
  for (const command of ["GetNoReadContentList", "GetSysGiveFeedBackList"])
    assert.throws(() => validatePlatformRequest("math", {
      path: "/api/Master/AutoModel", method: "POST", data: { command },
    }), { status: 403 });
});

test("shared math records reject suggestions, corrections and correction votes", () => {
  for (const Type of [3, "3"])
    for (const BusType of [1, "1", 6, "6", 8, "8"])
      for (const params of [
        { data: { Type, BusType } },
        { query: { Type, BusType } },
        { data: { Type }, query: { BusType } },
        { data: { BusType }, query: { Type } },
      ])
        assert.throws(() => validatePlatformRequest("math", {
          path: "/api/sys_give/Inner_sys_give", method: "POST", ...params,
        }), { status: 403 });
  for (const path of ["/api/sys_give/Inner_sys_give", "/api/sys_give/GetListBypage", "/api/sys_give/Del_sys_give"])
    for (const BusType of [9, "9"])
      assert.throws(() => validatePlatformRequest("math", {
        path, data: { BusType, Type: 1, BusID: 12 },
      }), { status: 403 });
});

test("shared math queries reject corrections and retain content marks and ratings", () => {
  for (const command of ["GetSysGiveAuto", "GetSysGiveAutoLimit"])
    for (const parameters of [{ Type: 3, BusType: "6" }, { Type: "3", BusType: 1 }, { Type: 3, BusType: 8 }, { Type: 1, BusType: "9" }])
      for (const data of [parameters, JSON.stringify(parameters)])
        assert.throws(() => validatePlatformRequest("math", {
          path: "/api/Master/AutoModel", method: "POST", data: { command, data },
        }), { status: 403 });
  for (const parameters of [{ Type: 4, BusType: 1 }, { Type: 5, BusType: 1 }, { Type: 2, BusType: 2 }, { Type: 1, BusType: 3 }]) {
    assert.doesNotThrow(() => validatePlatformRequest("math", {
      path: "/api/Master/AutoModel", method: "POST",
      data: { command: "GetSysGiveAuto", data: JSON.stringify(parameters) },
    }));
    assert.doesNotThrow(() => validatePlatformRequest("math", {
      path: "/api/sys_give/Inner_sys_give", method: "POST", data: parameters,
    }));
  }
});

test("dedicated question correction endpoints and history commands are no longer registered", () => {
  assert.throws(() => validatePlatformRequest("math", {
    path: "/api/sys_error/Inner_sys_error", method: "POST",
  }), { status: 403 });
  assert.throws(() => validatePlatformRequest("math", {
    path: "/api/Master/AutoModel", method: "POST", data: { command: "GetQuestionErrorToQuestionID", data: {} },
  }), { status: 403 });
  assert.throws(() => validatePlatformRequest("computer", {
    path: "/api/exam/wx/practice/addExerciseErrata/", method: "POST",
  }), { status: 403 });
});

test("removed correction requests are rejected by the HTTP proxy before reaching either platform", async () => {
  let forwarded = 0;
  const app = await startHttpApp({
    yybRequest: async () => [{ id: 7, nickname: "测试账号" }],
    loginPlatform: async () => ({ connected: true, token: "test-token", stuId: "test-student", user: {} }),
    mathRequest: async () => { forwarded++; return {}; },
    computerRequest: async () => { forwarded++; return {}; },
  });
  try {
    const admin = await app.setup();
    await app.createUser(admin, testLearner("removed.features", "7"));
    const auth = await app.login("learning", "removed.features", "learner-password-123");
    for (const [platform, body] of [
      ["math", { path: "/api/sys_error/Inner_sys_error", method: "POST" }],
      ["math", { path: "/api/sys_give/Inner_sys_give", method: "POST", data: { BusType: 1, Type: 3 } }],
      ["math", { path: "/api/sys_give/Inner_sys_give", method: "POST", data: { BusType: 8, Type: 3 } }],
      ["math", { path: "/api/sys_give/Inner_sys_give", method: "POST", data: { BusType: 9, Type: 1 } }],
      ["math", { path: "/api/Master/AutoModel", method: "POST", data: { command: "GetQuestionErrorToQuestionID", data: "{}" } }],
      ["math", { path: "/api/Master/AutoModel", method: "POST", data: { command: "GetSysGiveAuto", data: JSON.stringify({ BusType: 1, Type: 3 }) } }],
      ["computer", { path: "/api/exam/wx/practice/addExerciseErrata/", method: "POST" }],
    ]) {
      const response = await app.request(`/api/learning/platform/${platform}`, { auth, body });
      assert.equal(response.status, 403, body.path);
    }
    assert.equal(forwarded, 0);
  } finally {
    await app.close();
  }
});

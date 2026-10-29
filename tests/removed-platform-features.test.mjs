import test from "node:test";
import assert from "node:assert/strict";
import { validatePlatformRequest } from "../server/platform-policy.mjs";

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

test("removed platform suggestions are disabled while learning content feedback remains available", () => {
  for (const Type of [3, "3"])
    for (const BusType of [6, "6"])
      for (const params of [
        { data: { Type, BusType } },
        { query: { Type, BusType } },
        { data: { Type }, query: { BusType } },
        { data: { BusType }, query: { Type } },
      ])
        assert.throws(() => validatePlatformRequest("math", {
          path: "/api/sys_give/Inner_sys_give", method: "POST", ...params,
        }), { status: 403 });
  const data = { Type: 3, BusType: 1, BusID: 12, Content: "question correction" };
  assert.deepEqual(validatePlatformRequest("math", {
    path: "/api/sys_give/Inner_sys_give", method: "POST", data,
  }).data, data);
});

test("shared feedback queries reject the removed category and retain content marks and ratings", () => {
  for (const command of ["GetSysGiveAuto", "GetSysGiveAutoLimit"])
    for (const parameters of [{ Type: 3, BusType: "6" }, { Type: "3", BusType: 6 }])
      for (const data of [parameters, JSON.stringify(parameters)])
        assert.throws(() => validatePlatformRequest("math", {
          path: "/api/Master/AutoModel", method: "POST", data: { command, data },
        }), { status: 403 });
  for (const Type of [4, 5])
    assert.doesNotThrow(() => validatePlatformRequest("math", {
      path: "/api/Master/AutoModel", method: "POST",
      data: { command: "GetSysGiveAuto", data: JSON.stringify({ Type, BusType: 1 }) },
    }));
});

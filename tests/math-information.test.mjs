import test from "node:test";
import assert from "node:assert/strict";
import { mathUpdateListQuery, mathOwnUpdateLogs } from "../src/platforms/math-information.ts";

test("update state reads the Page endpoint that returns real joined logs", () => {
  const request = mathUpdateListQuery("fixture-actor");
  assert.equal(request.path, "/api/content_list/GetListByPage");
  assert.equal(request.query.page, 1);
  assert.equal(request.query.limit, 1000);
  assert.equal(request.query.StuID, "fixture-actor");
  assert.equal(request.query.BusType, "小程序版本更新");
});

test("the live All shape is unread while the joined Page shape exposes only this actor and notification", () => {
  assert.deepEqual(mathOwnUpdateLogs({ ID: 74, _content_list_log: null }, "fixture-actor"), []);
  const own = { ID: 1, CID: "74", BusID: "1", BusType: "read", BusValue: "fixture-actor" };
  const row = { ID: 74, _content_list_log: [own,
    { ...own, ID: 2, BusValue: "another-actor" },
    { ...own, ID: 3, CID: 75 },
    { ...own, ID: 4, BusID: 2 },
  ] };
  assert.deepEqual(mathOwnUpdateLogs(row, "fixture-actor"), [own]);
});

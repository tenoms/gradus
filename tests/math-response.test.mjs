import test from "node:test";
import assert from "node:assert/strict";
import {
  mathResponseData,
  mathResponseError,
} from "../src/platforms/math-response.ts";

test("legacy SQL exception responses become concise errors without leaking server details", () => {
  const body = {
    Resule: false,
    Page: 0,
    Msg: "System.IndexOutOfRangeException: Index was outside the bounds. at MySql.Data.MySqlClient.MySqlDataReader.GetString(Int32 i)",
  };
  assert.match(mathResponseError(body), /数学平台暂时/);
  assert.doesNotMatch(
    mathResponseError(body),
    /Exception|MySql|MySqlDataReader/,
  );
});
test("lowercase failure codes are recognized and normal success codes remain valid", () => {
  assert.equal(mathResponseError({ code: 401, msg: "请先登录" }), "请先登录");
  assert.equal(
    mathResponseError({ code: 0, msg: "操作成功", data: [] }),
    undefined,
  );
  assert.equal(mathResponseError({ Code: 200, Data: [] }), undefined);
});
test("explicit null data stays empty instead of becoming a fake response row", () => {
  assert.equal(mathResponseData({ SuccessResponse: true, data: null }), null);
  assert.equal(mathResponseData({ Code: 200, Data: null }), null);
  assert.deepEqual(mathResponseData({ data: [] }), []);
});

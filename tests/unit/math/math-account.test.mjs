import test from "node:test";
import assert from "node:assert/strict";
import {
  studyProfilePayload,
} from "../../../src/features/math/profile/account-model.mjs";

test("study profile uses original province text, lower-case API course field and fixed actor", () => {
  const payload = studyProfilePayload(
    {
      Province: "浙江省",
      IsJoinCourse: "已报班",
      UserName: "测试",
      StuID: "other",
      ID: 999,
      UserRoot: 5,
    },
    "current",
  );
  assert.equal(payload.Province, "浙江省");
  assert.equal(payload.isJoinCourse, "已报班");
  assert.equal(payload.StuID, "current");
  assert.equal(payload.ID, undefined);
  assert.equal(payload.UserRoot, undefined);
  assert.equal(payload.IsJoinCourse, undefined);
});

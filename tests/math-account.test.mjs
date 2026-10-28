import test from "node:test";
import assert from "node:assert/strict";
import {
  studyProfilePayload,
  couponStatus,
  couponActivationPayload,
  canGiftCoupon,
} from "../src/components/math/account-model.mjs";

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
test("coupon dates use China time and used coupons cannot be gifted", () => {
  const now = Date.parse("2026-10-29T04:00:00Z"),
    row = {
      IsUse: 0,
      StartTime: "2026-10-28 00:00:00",
      EndTime: "2026-10-29 13:00:00",
      _couponcard: { Type: "VIP首月" },
    };
  assert.equal(couponStatus(row, now), "可使用");
  assert.equal(canGiftCoupon(row, now), true);
  assert.equal(
    couponStatus({ ...row, EndTime: "2026-10-29 11:00:00" }, now),
    "已过期",
  );
  assert.equal(
    couponStatus({ ...row, StartTime: "2026-10-30 00:00:00" }, now),
    "未生效",
  );
  assert.equal(canGiftCoupon({ ...row, IsUse: 1 }, now), false);
});
test("coupon activation keeps upstream fixed terms and rejects already claimed tokens", () => {
  const row = {
    ID: 5,
    IsConvert: 0,
    _couponcard: {
      IsTime: 1,
      StartTime: "2026-01-01 00:00:00",
      EndTime: "2027-01-01 00:00:00",
    },
  };
  const payload = couponActivationPayload(
    row,
    "current",
    Date.parse("2026-10-29T04:00:00Z"),
  );
  assert.equal(payload.ConvertTime, "2026-10-29 12:00:00");
  assert.equal(payload.StartTime, row._couponcard.StartTime);
  assert.equal(payload.EndTime, row._couponcard.EndTime);
  assert.equal(payload.IsConvert, 1);
  assert.throws(
    () => couponActivationPayload({ ...row, IsConvert: 1 }, "current"),
    /已领取/,
  );
  const relative = couponActivationPayload(
    { ...row, _couponcard: { Days: 7, IsTime: 0 } },
    "current",
    Date.parse("2026-10-29T04:00:00Z"),
  );
  assert.equal(relative.EndTime, "2026-11-05 12:00:00");
});

export function studyProfilePayload(form, stuid) {
  const keys = [
    "UserName",
    "SchoolName",
    "TargetSchool",
    "IsCrossCourse",
    "TargetScore",
    "IsWorkStudy",
    "CourseName",
    "Province",
    "QQ",
    "ElseQuestion",
    "Score2",
    "UseRestsApp",
    "IsRealizeCourse",
    "IsInActivities",
    "GoOverTime",
  ];
  return {
    StuID: stuid,
    ...Object.fromEntries(keys.map((k) => [k, form[k] ?? ""])),
    isJoinCourse: form.IsJoinCourse ?? form.isJoinCourse ?? "",
    System_Station_ID: 1,
    Source: form.Source || "小程序会员激活",
  };
}
export function couponStatus(row, now = Date.now()) {
  if (Number(row.IsUse) !== 0) return "已使用";
  const date = (v) => {
    const value = String(v || "");
    return Date.parse(
      /[Zz]|[+-]\d\d:\d\d$/.test(value)
        ? value
        : value.replace(" ", "T") + "+08:00",
    );
  };
  if (date(row.EndTime) <= now) return "已过期";
  if (date(row.StartTime) > now) return "未生效";
  return "可使用";
}
function chinaTime(value) {
  return new Date(value + 8 * 3600000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}
export function couponActivationPayload(row, stuid, now = Date.now()) {
  if (Number(row.IsConvert) === 1) throw new Error("优惠码已领取");
  if (!row.ID || !row._couponcard) throw new Error("平台未返回可领取的优惠券");
  const card = row._couponcard,
    days = Number(card.Days);
  if (Number(card.IsTime) !== 1 && (!Number.isFinite(days) || days < 0))
    throw new Error("平台未返回有效的优惠券期限");
  return {
    ID: row.ID,
    StuID: stuid,
    IsConvert: 1,
    ConvertTime: chinaTime(now),
    StartTime: Number(card.IsTime) === 1 ? card.StartTime : chinaTime(now),
    EndTime:
      Number(card.IsTime) === 1
        ? card.EndTime
        : chinaTime(now + days * 86400000),
    UpdateColumns: "StuID,IsConvert,ConvertTime,StartTime,EndTime",
  };
}
export function canGiftCoupon(row, now = Date.now()) {
  return (
    row?._couponcard?.Type === "VIP首月" && couponStatus(row, now) === "可使用"
  );
}

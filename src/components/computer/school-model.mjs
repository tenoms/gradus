export const schoolRegions = [
  {
    label: "一区",
    provinces: [
      ["11", "北京"],
      ["12", "天津"],
      ["13", "河北"],
      ["14", "山西"],
      ["21", "辽宁"],
      ["22", "吉林"],
      ["23", "黑龙江"],
      ["31", "上海"],
      ["32", "江苏"],
      ["33", "浙江"],
      ["34", "安徽"],
      ["35", "福建"],
      ["36", "江西"],
      ["37", "山东"],
      ["41", "河南"],
      ["42", "湖北"],
      ["43", "湖南"],
      ["44", "广东"],
      ["50", "重庆"],
      ["51", "四川"],
      ["61", "陕西"],
    ],
  },
  {
    label: "二区",
    provinces: [
      ["15", "内蒙古"],
      ["45", "广西"],
      ["46", "海南"],
      ["52", "贵州"],
      ["53", "云南"],
      ["54", "西藏"],
      ["62", "甘肃"],
      ["63", "青海"],
      ["64", "宁夏"],
      ["65", "新疆"],
    ],
  },
];
export function schoolQuery(filters, page = 1) {
  const [min = "", max = ""] = String(filters.score || "").split("-");
  return {
    pageNum: page,
    pageSize: 20,
    name: filters.name || "",
    year: filters.year || "",
    degreeType: filters.degree || "",
    firstSubject: filters.subject || "",
    firstScoreMin: min,
    firstScoreMax: max,
    provinceIdList: filters.provinces || [],
    csCodeList: filters.majors || [],
  };
}
export function schoolTags(row) {
  return [
    [row.is985, "985"],
    [row.is211, "211"],
    [row.isSyl, "双一流"],
    [row.isZihuaxian, "自主划线"],
    [row.isOrdinary, "普通院校"],
  ]
    .filter(([flag]) => Number(flag) === 1)
    .map(([, text]) => text);
}
export function schoolHasFeature(row, feature) {
  return !feature || Number(row[feature]) === 1;
}
export function schoolRowKey(row) {
  return `${row.id || row.schoolId}-${row.minPlanId || row.planList?.[0]?.id || row.planList?.[0]?.specialCode || ""}`;
}
export function schoolMetric(value) {
  return value === undefined || value === null || value === ""
    ? "—"
    : String(value);
}
export function targetSchoolIds(value) {
  return [
    ...new Set(
      String(value?.targetSchoolId || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
}
export function targetSchoolPayload(ids, schools) {
  const selected = [...new Set(ids.map(String))],
    allowed = new Set(schools.map((s) => String(s.id)));
  if (!selected.length) throw new Error("请选择目标院校");
  if (selected.some((id) => !allowed.has(id)))
    throw new Error("所选院校不在原目标目录，请重新选择");
  return { schoolId: selected.join(",") };
}
export function matchingSchoolPlan(plans, selected, year) {
  const first = selected?.planList?.[0] || selected || {};
  return (
    plans.find(
      (p) =>
        String(p.year) === String(year) &&
        String(p.specialCode) === String(first.specialCode) &&
        String(p.departId ?? p.departName) ===
          String(first.departId ?? first.departName),
    ) ||
    plans.find(
      (p) =>
        String(p.year) === String(year) &&
        String(p.specialCode) === String(first.specialCode),
    ) ||
    plans.find((p) => String(p.year) === String(year))
  );
}

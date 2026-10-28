import { api } from "../../lib/api";
import { mathCommand, mathData, mathRows } from "../../platforms/math";
export type ScoreRow = Record<string, any>;
export function scoreRows(response: any): ScoreRow[] {
  const d = mathData(response);
  return Array.isArray(d?.[0]) ? d[0] : mathRows(response);
}
export function emptyFirstScore(): ScoreRow {
  return {
    Name: "",
    BenSchoolName: "",
    SchoolCode: "",
    SchoolName: "",
    XueYuanCode: "",
    XueYuanName: "",
    MajorCode: "",
    MajorName: "",
    DirectionCode: "",
    DirectionName: "",
    IsQuanRiZ: "",
    Subject1: "",
    Subject1Score: "",
    Subject2: "",
    Subject2Score: "",
    Subject3: "",
    Subject3Score: "",
    Subject4: "",
    Subject4Score: "",
    ScoreImg: "",
    IsFinish: 0,
    BusYear: 2026,
  };
}
export function scoreSubjectOptions(
  rows: ScoreRow[],
  index: number,
): { name: string; max: number }[] {
  const seen = new Set<string>();
  return rows
    .filter((row) => row[`Subject${index}`])
    .flatMap((row) => {
      const name = String(row[`Subject${index}`]);
      if (seen.has(name)) return [];
      seen.add(name);
      return [{ name, max: Number(row[`Subject${index}Score`]) }];
    });
}
export function scoreScope(form: ScoreRow) {
  return {
    SchoolCode: form.SchoolCode,
    XueYuanName: form.XueYuanName,
    MajorCode: form.MajorCode,
    DirectionName: form.DirectionName,
    IsQuanRiZ: form.IsQuanRiZ,
  };
}
export function buildFirstScore(
  form: ScoreRow,
  subjects: ScoreRow[],
  complete: boolean,
): ScoreRow {
  const defaults = emptyFirstScore(),
    result: ScoreRow = Object.fromEntries(
      Object.keys(defaults).map((key) => [key, form[key] ?? defaults[key]]),
    );
  result.IsFinish = complete ? 1 : 0;
  if (complete) {
    for (const [field, title] of [
      ["Name", "姓名"],
      ["BenSchoolName", "本科学校"],
      ["SchoolCode", "报考院校"],
      ["XueYuanName", "报考学院"],
      ["MajorCode", "报考专业"],
      ["DirectionName", "研究方向"],
      ["ScoreImg", "成绩证明图片"],
    ])
      if (!String(result[field] || "").trim())
        throw new Error(`请填写${title}。`);
    if (result.IsQuanRiZ === "" || result.IsQuanRiZ == null)
      throw new Error("请选择学习方式。");
  }
  for (let i = 1; i <= 4; i++) {
    const options = scoreSubjectOptions(subjects, i),
      name = String(result[`Subject${i}`] || ""),
      raw = result[`Subject${i}Score`],
      choice = options.find((o) => o.name === name);
    if (complete && options.length && !choice)
      throw new Error(`请选择第 ${i} 科科目。`);
    if (raw === "" || raw == null) {
      if (complete && options.length) throw new Error(`请填写第 ${i} 科成绩。`);
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || (choice && value > choice.max))
      throw new Error(
        `第 ${i} 科成绩应在 0 到 ${choice?.max ?? "科目满分"} 分之间。`,
      );
    result[`Subject${i}Score`] = value;
  }
  result.TotalScore = [1, 2, 3, 4].reduce(
    (sum, i) => sum + Number(result[`Subject${i}Score`] || 0),
    0,
  );
  for (const key of ["Key", "StuID", "ID"]) delete result[key];
  return result;
}
export function maskScoreName(value: any) {
  const name = String(value || "");
  return name.length <= 1 ? name : name[0] + "*".repeat(name.length - 1);
}
export function scoreRankGroup(
  rows: ScoreRow[],
  form: ScoreRow,
  scope: "major" | "direction" | "college",
  stuid: string,
) {
  const list = rows.filter(
    (r) =>
      (scope === "major" ||
        String(r.DirectionName || "") === String(form.DirectionName || "")) &&
      (scope !== "college" ||
        String(r.XueYuanName || "") === String(form.XueYuanName || "")),
  );
  const mine = list.findIndex((r) => String(r.StuID) === stuid),
    scores = list.map((r) => Number(r.TotalScore) || 0),
    total = scores.reduce((a, b) => a + b, 0);
  return {
    list,
    rank: mine >= 0 ? mine + 1 : null,
    count: list.length,
    average: list.length ? Math.round((total / list.length) * 10) / 10 : null,
    highest: list.length ? Math.max(...scores) : null,
  };
}
export function scoreDistribution(rows: ScoreRow[]) {
  const bins = [
    { name: "420 分及以上", min: 420, max: Infinity },
    { name: "410–419", min: 410, max: 419.99 },
    { name: "400–409", min: 400, max: 409.99 },
    { name: "390–399", min: 390, max: 399.99 },
    { name: "380–389", min: 380, max: 389.99 },
    { name: "370–379", min: 370, max: 379.99 },
    { name: "360–369", min: 360, max: 369.99 },
    { name: "350–359", min: 350, max: 359.99 },
    { name: "340–349", min: 340, max: 349.99 },
    { name: "330–339", min: 330, max: 339.99 },
    { name: "320–329", min: 320, max: 329.99 },
    { name: "320 分以下", min: 0, max: 319.99 },
  ];
  return bins.map((bin) => ({
    ...bin,
    count: rows.filter(
      (r) => Number(r.TotalScore) >= bin.min && Number(r.TotalScore) <= bin.max,
    ).length,
  }));
}
export const scoreRankApi = {
  mine: (StuID: string) => mathCommand("GetUserFristScores_cscj", { StuID }),
  schools: () => mathCommand("GetSchoolList_cscj", {}),
  colleges: (SchoolCode: string) =>
    mathCommand("GetSchoolXueYuanList_cscj", { SchoolCode }),
  majors: (SchoolCode: string, XueYuanName: string) =>
    mathCommand("GetXueYuanMajorList_cscj", { SchoolCode, XueYuanName }),
  directions: (SchoolCode: string, XueYuanName: string, MajorCode: string) =>
    mathCommand("GetMajorDirectionList_cscj", {
      SchoolCode,
      XueYuanName,
      MajorCode,
    }),
  studyTypes: (form: ScoreRow) =>
    mathCommand("GetDirectionXueXiTypeList_cscj", {
      SchoolCode: form.SchoolCode,
      XueYuanName: form.XueYuanName,
      MajorCode: form.MajorCode,
      DirectionName: form.DirectionName,
    }),
  subjects: (form: ScoreRow) =>
    mathCommand("GetMajorSubjectList_cscj", scoreScope(form)),
  ranks: (form: ScoreRow) =>
    mathCommand("GetFirstScoreRankList_cscj", {
      SchoolCode: form.SchoolCode,
      MajorCode: form.MajorCode,
      IsQuanRiZ: form.IsQuanRiZ,
      System_Station_ID: 1,
    }),
  async save(score: ScoreRow) {
    const response = await api("/api/platform/math/first-score", {
      method: "POST",
      body: JSON.stringify({ score }),
    });
    if (
      response?.SuccessResponse === false ||
      (response?.code !== undefined &&
        ![0, 200].includes(Number(response.code))) ||
      (response?.Code !== undefined &&
        ![0, 200].includes(Number(response.Code))) ||
      /失败|错误|异常|无权限|权限不足|未登录/.test(
        response?.msg || response?.Message || "",
      )
    )
      throw new Error(response?.msg || response?.Message || "成绩保存失败");
    return response;
  },
};

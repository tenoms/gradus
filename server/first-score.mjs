import { ApiError } from "./upstream.mjs";
const fields = [
  "Subject1",
  "Subject1Score",
  "Subject2",
  "Subject2Score",
  "Subject3",
  "Subject3Score",
  "Subject4",
  "Subject4Score",
  "IsFinish",
  "SchoolName",
  "SchoolCode",
  "XueYuanName",
  "XueYuanCode",
  "MajorName",
  "MajorCode",
  "DirectionCode",
  "DirectionName",
  "ScoreImg",
  "IsQuanRiZ",
  "Name",
  "BenSchoolName",
];
export function firstScorePayload(score, existing, stuId, subjectRows = []) {
  if (!score || typeof score !== "object" || Array.isArray(score))
    throw new ApiError("成绩数据格式不正确", 400);
  const Col = Object.fromEntries(
    fields
      .filter((k) => score[k] !== undefined || existing?.[k] !== undefined)
      .map((k) => [k, score[k] ?? existing?.[k]]),
  );
  if (Col.IsFinish !== undefined && !["0", "1"].includes(String(Col.IsFinish)))
    throw new ApiError("提交状态不正确", 400);
  if (Number(Col.IsFinish) === 1 && !subjectRows.length)
    throw new ApiError("当前专业的考试科目尚未核实，请重新选择专业后提交", 400);
  let total = 0;
  for (let i = 1; i <= 4; i++) {
    const name = `Subject${i}`,
      field = `${name}Score`,
      raw = Col[field],
      selected = Col[name];
    const configured = subjectRows.some((row) => row[name]);
    if (!selected) {
      if (Number(Col.IsFinish) === 1 && configured)
        throw new ApiError(`请选择第${i}科考试科目`, 400);
      if (raw !== undefined && raw !== null && raw !== "" && Number(raw) !== 0)
        throw new ApiError(`请先选择第${i}科考试科目`, 400);
      continue;
    }
    const subject = subjectRows.find(
      (row) => String(row[name]) === String(selected),
    );
    if (!subject)
      throw new ApiError(
        `第${i}科不属于所选专业的可选考试科目，请重新选择`,
        400,
      );
    const limit = Number(subject[field]);
    if (!Number.isFinite(limit) || limit <= 0)
      throw new ApiError("上游专业科目分值未配置，请稍后重试", 502);
    if (raw === undefined || raw === null || raw === "") {
      if (Number(Col.IsFinish) === 1)
        throw new ApiError(`请填写第${i}科成绩`, 400);
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > limit)
      throw new ApiError(`第${i}科成绩须在0至${limit}分之间`, 400);
    Col[field] = value;
    total += value;
  }
  Col.TotalScore = total;
  Col.StuID = stuId;
  Col.BusYear = 2026;
  const payload = {
    name: "xy_user_first_scores",
    Col,
    Type: existing?.Key ? "update" : "insert",
  };
  if (existing?.Key) payload.where = { Key: existing.Key };
  return payload;
}

export function errorRecordQuery(qid, page = 0) {
  if (qid === undefined || qid === null || qid === "")
    throw new Error("缺少题目编号");
  return {
    System_Station_ID: 1,
    QuestionID: qid,
    limit: 10,
    page: Math.max(0, Math.floor(Number(page) || 0)) * 10,
  };
}
export function errorEvidence(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [
    ...new Set(
      values
        .map((x) =>
          String(x || "")
            .trim()
            .replaceAll(".png_yjs", ".png"),
        )
        .filter((url) => {
          try {
            return ["http:", "https:"].includes(new URL(url).protocol);
          } catch {
            return false;
          }
        }),
    ),
  ];
}
export function errorRecordStatus(type) {
  return Number(type) === 1
    ? "已采纳"
    : Number(type) > 0
      ? "未采纳"
      : "暂未标注处理结果";
}
export function errorRecord(row) {
  return {
    ...row,
    evidence: errorEvidence(row.Notes),
    answerEvidence: errorEvidence(row.AnswerImg),
    rightCount: Math.max(0, Number(row.Rightcount) || 0),
    errorCount: Math.max(0, Number(row.Errorcount) || 0),
    vote: [1, 2].includes(Number(row.DianzanState))
      ? Number(row.DianzanState)
      : 0,
    status: errorRecordStatus(row.Type),
  };
}
export function errorVotePayload(row, stuid, state) {
  if (!stuid) throw new Error("请先连接数学学习账号");
  if (!row?.ID) throw new Error("缺少反馈记录编号，请刷新后重试");
  if (![1, 2].includes(Number(state))) throw new Error("无效的反馈判断");
  if (Number(row.DianzanState) === Number(state)) return null;
  return {
    BusType: 9,
    BusID: row.ID,
    StuID: stuid,
    Type: 1,
    State: Number(state),
    ...(Number(row.DianzanID) > 0
      ? { ID: row.DianzanID, UpdateColumns: "State" }
      : {}),
  };
}
export function acknowledgedErrorVote(row, state, data) {
  return {
    ...row,
    DianzanState: Number(state),
    ...(Number(row.DianzanID) > 0
      ? {}
      : Number(data) > 0
        ? { DianzanID: data }
        : {}),
  };
}

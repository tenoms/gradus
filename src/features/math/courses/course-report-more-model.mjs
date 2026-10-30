export function courseRankingRequest(context) {
  const shared = {
    StuID: context.stuid,
    CourseID: context.CourseID,
    CalendarID: context.CalendarID,
  };
  return context.isTeacher
    ? {
        command: "GetMarkPaperScoreByList",
        params: {
          ...shared,
          PaperID: context.PaperID,
          ProductID: context.ProductID,
        },
      }
    : {
        command: "GetPaperScoreByList",
        params: { ...shared, BusID: context.PaperID },
      };
}
export function courseRankingVote(stuid, row) {
  if (row.GiveState)
    return { path: "/api/sys_give/Del_sys_give", data: { ID: row.GiveState } };
  return {
    path: "/api/sys_give/Inner_sys_give",
    data: {
      BusType: 3,
      BusID: row.id,
      Content: 1,
      StuID: stuid,
      Type: 1,
    },
  };
}
export function reconcileCourseRanking(rows, ownReactions) {
  const byRecord = new Map(ownReactions.map((row) => [String(row.BusID), row]));
  return rows.map((row) => {
    const reaction = byRecord.get(String(row.id));
    const previous = Number(row.GiveState) > 0 ? 1 : 0;
    const current = reaction ? 1 : 0;
    return {
      ...row,
      GiveState: reaction?.ID ?? null,
      GiveCount: Math.max(0, (Number(row.GiveCount) || 0) + current - previous),
    };
  });
}
export function courseRankingVoteResult(row, result) {
  if (Number(row.GiveState) > 0)
    return {
      ...row,
      GiveState: null,
      GiveCount: Math.max(0, (Number(row.GiveCount) || 0) - 1),
    };
  const id = typeof result === "number" || typeof result === "string"
    ? Number(result) : NaN;
  if (!(id > 0))
    throw new Error("尚未确认点赞成功，请刷新榜单后核对。");
  return { ...row, GiveState: id, GiveCount: (Number(row.GiveCount) || 0) + 1 };
}
export function latestCourseExamParams(context, meta, withProduct = false) {
  return {
    StuID: context.stuid,
    CourseID: context.CourseID,
    PaperNotes: meta.PaperNotes,
    Year: meta.Use,
    ...(withProduct ? { ProductID: context.ProductID } : {}),
  };
}
export function courseQuestionAccuracy(row, score) {
  const count = Number(row?.count),
    maximum = count * Number(score),
    points = Number(row?.rightcount);
  return maximum > 0 && Number.isFinite(points)
    ? Math.max(0, Math.min(100, Math.trunc((points / maximum) * 100)))
    : null;
}
export function latestCourseScore(row) {
  if (Array.isArray(row)) row = row[0];
  const score = row?.score ?? row?.BusValue ?? row?.TotalScore;
  return score === undefined || score === null ? null : Number(score);
}
export function courseDistribution(row) {
  if (
    !row ||
    !Array.from({ length: 6 }, (_, i) => `a${i + 1}`).some(
      (key) => row[key] !== undefined,
    )
  )
    return [];
  return ["0–39", "40–69", "70–89", "90–109", "110–129", "130–150"].map(
    (label, i) => ({
      label,
      count: Math.max(0, Number(row[`a${i + 1}`]) || 0),
    }),
  );
}

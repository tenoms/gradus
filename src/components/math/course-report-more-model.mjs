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
      System_Station_ID: 1,
    },
  };
}
export function latestCourseExamParams(context, meta, withProduct = false) {
  return {
    StuID: context.stuid,
    CourseID: context.CourseID,
    PaperNotes: meta.PaperNotes,
    System_Station_ID: 1,
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

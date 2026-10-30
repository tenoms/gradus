type Row = Record<string, any>;
export function mathMessageTarget(
  row: Row,
):
  | { kind: "question"; id: string }
  | { kind: "route"; path: string; label: string }
  | { kind: "external"; url: string }
  | undefined {
  const raw = String(row.BusValue || row.Notes || "");
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {}
  const params = new URLSearchParams(decoded.split("?")[1] || "");
  if (row.BusType === "答疑回复" || /wenda\/pages\/question\/info/.test(decoded))
    return undefined;
  if (row.BusType === "题目报错" && row.BusRelationID)
    return { kind: "question", id: String(row.BusRelationID) };
  const q = params.get("courseID") || params.get("QuestionID");
  if (q) return { kind: "question", id: q };
  if (/dryrun|PaperResult|weeklytest|阅卷/.test(decoded + String(row.BusType)))
    return { kind: "route", path: "/study/exams", label: "查看我的考试与报告" };
  if (/albumBook|albumInfo|专题/.test(decoded + String(row.BusType)))
    return {
      kind: "route",
      path: "/study/resources",
      label: "查看相关数学专辑",
    };
  if (/^https?:\/\//i.test(decoded)) return { kind: "external", url: decoded };
  if (row.BusType === "讨论回复")
    return {
      kind: "route",
      path: "/study/community",
      label: "查看收到的讨论回复",
    };
  return undefined;
}

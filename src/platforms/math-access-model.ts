type Row = Record<string, any>;
export function mathVipActive(user: Row, now = Date.now()) {
  const raw = String(user.VipEndTime || "");
  const value = /Z$|[+-]\d\d:\d\d$/.test(raw)
    ? raw
    : (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(raw)
        ? raw + "T00:00:00"
        : raw.replace(" ", "T")) + "+08:00";
  return Number.isFinite(Date.parse(value)) && Date.parse(value) > now;
}
export function mathBookAnalysisAllowed({
  book,
  user,
  qid,
  viewed = [],
  preview = false,
  source = "电子书",
  now = Date.now(),
}: {
  book: Row;
  user: Row;
  qid: string | number;
  viewed?: any[];
  preview?: boolean;
  source?: string;
  now?: number;
}) {
  if (preview || ["课程", "专辑", "选择题库", "考试"].includes(source))
    return true;
  if (Number(book.IsActCode) !== 1 || Number(user.IsAct) === 2) return true;
  if (Number(book.IsVipActCode) === 1 && mathVipActive(user, now)) return true;
  const ids = viewed.map((r) =>
    String(typeof r === "object" ? (r.QuestionID ?? r.ID ?? r.qID) : r),
  );
  if (ids.includes(String(qid))) return true;
  return ids.length < Math.max(0, Number(book.ActBusCount) || 0);
}
export function mathBookNeedsUsageCheck(
  book: Row,
  user: Row,
  now = Date.now(),
) {
  return (
    Number(book.IsActCode) === 1 &&
    Number(user.IsAct) !== 2 &&
    !(Number(book.IsVipActCode) === 1 && mathVipActive(user, now))
  );
}
export function mathQrcodeRequestPlan(qrcode: string) {
  return {
    mapping: {
      command: "CheckQrcodeQuestionInZhenTiList2",
      params: { qrcode, System_Station_ID: 1 },
      model: true,
    },
    content: {
      command: "GetCourseQrcodeInfo",
      params: { qrcode },
      model: true,
    },
  };
}

export function mathNoteQuotaAllowed(
  kind: string,
  count: number,
  config: Row,
  user: Row,
  now = Date.now(),
) {
  if (kind === "笔记" || mathVipActive(user, now)) return true;
  const limit = Number(
    kind === "错题"
      ? config.IsNotVipErrorQuestion
      : config.IsNotVipCollectQuestion,
  );
  return !(limit > 0 && count > limit);
}
export function mathAlbumAllowed(album: Row, user: Row, now = Date.now()) {
  if (Number(album.PID) === 4) return true;
  if (Number(album.Authority) !== 1) return mathVipActive(user, now);
  if (!album.FreeEndTime) return true;
  const raw = String(album.FreeEndTime),
    value = /Z$|[+-]\d\d:\d\d$/.test(raw)
      ? raw
      : raw.replace(" ", "T") + "+08:00";
  return Number.isFinite(Date.parse(value)) && Date.parse(value) > now;
}

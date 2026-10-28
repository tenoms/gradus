type Row = Record<string, any>;
function time(value: unknown) {
  const raw = String(value || "")
    .trim()
    .replace(" ", "T");
  return raw
    ? Date.parse(/Z$|[+-]\d\d:\d\d$/.test(raw) ? raw : `${raw}+08:00`)
    : NaN;
}
export function qaStudentCanFollow(info: Row, now = Date.now()) {
  return (
    Number(info.State) === 2 &&
    Number.isFinite(time(info.EndTime)) &&
    now <= time(info.EndTime)
  );
}
export function qaTeacherRights(
  info: Row,
  teacher: Row | undefined,
  previewOnly = false,
  now = Date.now(),
) {
  const owns =
    !!teacher && String(info.TeacherID) === String(teacher.TeacherID);
  const unassigned =
    !!teacher &&
    Number(info.State) === 0 &&
    (!info.TeacherID || String(info.TeacherID) === "0");
  const write = (owns || unassigned) && !previewOnly;
  return {
    owns,
    unassigned,
    write,
    editAnswer:
      write &&
      owns &&
      (Number(info.State) === 1 ||
        (Number(info.State) === 2 &&
          now - time(info.UpdateTime) < 3 * 3600000)),
    follow:
      write &&
      owns &&
      Number(info.State) >= 2 &&
      Number.isFinite(time(info.UpdateTime)) &&
      now <= time(info.UpdateTime) + 3 * 86400000,
  };
}
export function qaVoicePayload({
  orderId,
  questionId,
  teacherId,
  url,
  isAnswer,
  at,
}: {
  orderId: number | string;
  questionId: number | string;
  teacherId: number | string;
  url: string;
  isAnswer: boolean;
  at: string;
}) {
  return isAnswer
    ? {
        ID: orderId,
        State: 2,
        BaseContent: "语音回答：",
        BasFiles: url,
        TeacherID: teacherId,
        UpdateTime: at,
        UpdateColumns: "ID,State,BaseContent,BasFiles,TeacherID,UpdateTime",
      }
    : {
        Notes: 1,
        BusID: orderId,
        QuestionID: questionId,
        TeacherID: teacherId,
        System_Station_ID: 1,
        BusType: "语音",
        BusValue: url,
      };
}
export function qaReportDetailParams(
  stuid: string,
  type: "book" | "month" | "chapter",
  id: number | string | undefined,
  name: string,
) {
  return {
    StuID: stuid,
    System_Station_ID: 1,
    ...(type === "book"
      ? { BKID: id }
      : type === "chapter"
        ? { ChapterID: id }
        : { Month: name }),
  };
}

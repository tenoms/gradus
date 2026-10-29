type Row = Record<string, any>;
export function normalizeMathQuestionOrder(row: Row): Row {
  const printed = row.QID !== undefined || row.QuestionID1 !== undefined;
  return {
    ...row,
    ID: row.OrderID ?? row.ID,
    QuestionID: row.QID ?? row.QuestionID1 ?? row.QuestionID,
    QuestionSort: row.QuestionSort ?? (printed ? row.QuestionID : undefined),
    State: row.StateID ?? row.State,
  };
}
export function qaTeacherRights(
  info: Row,
  teacher: Row | undefined,
  previewOnly = false,
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
    editAnswer: write && owns,
    follow: write && owns,
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

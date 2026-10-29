export function schoolQuestionRecord(
  row,
  context,
  answer,
  correct,
  isChoice = false,
) {
  const previous = row._c_course_users_record || {};
  return {
    ID: Number(previous.ID || 0),
    StuID: context.stuid,
    CourseID: context.CourseID,
    CalendarID: context.CalendarID,
    ProductID: Number(context.ProductID || 0),
    BusType: 3,
    BusID: context.PaperID,
    BusRelationID: row.QuestionID,
    BookID: Number(row._question_list?.BookID || row.BookID || 0),
    BusValue: isChoice ? 0 : (previous.BusValue ?? ""),
    Answer: String(answer || ""),
    AnswerState: correct ? 1 : 0,
  };
}
export function schoolCompletionRecord(context) {
  return {
    ID: 0,
    StuID: context.stuid,
    CourseID: context.CourseID,
    CalendarID: context.CalendarID,
    ProductID: Number(context.ProductID || 0),
    BusType: 3,
    BusID: context.PaperID,
    BusRelationID: 0,
    BusValue: "",
    AnswerState: 1,
    IsFinished: 1,
  };
}
export function schoolAllAnswered(rows) {
  return (
    rows.length > 0 &&
    rows.every((row) => Number(row._c_course_users_record?.ID) > 0)
  );
}

export type ModelRow = Record<string, any>;
export function guideStudyPayload(stuid: string, lesson: ModelRow, previous?: ModelRow) {
  const sameAlbum = previous?.ID && String(previous.AlbumID) === String(lesson.BusID);
  return {
    Type: "直播模块", BusID: lesson.ID, AlbumID: lesson.BusID, StuID: stuid, ...(sameAlbum ? { ID: previous.ID, AddTime: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }), UpdateColumns: "ID,AddTime" } : {}),
  };
}
export interface ModelContext {
  ProductID?: number | string;
  CourseID?: number | string;
  CalendarID?: number | string;
  PaperID?: number | string;
  LeadFillID?: number | string;
}
export function modelExerciseCount(rows: ModelRow[]): number {
  return rows.reduce(
    (sum, row) =>
      sum +
      (Number(row.QuestionID) > 0 ? 1 : 0) +
      modelExerciseCount(row.ContentList || []) +
      modelExerciseCount(row.children || []),
    0,
  );
}
export function modelStudyPayload({
  stuid,
  albumId,
  catalogId,
  row,
  answer,
  correct,
  isLeadFill = false,
  context = {},
  kind = "module",
}: {
  stuid: string;
  albumId?: number | string;
  catalogId?: number | string;
  row: ModelRow;
  answer: string;
  correct: boolean;
  isLeadFill?: boolean;
  context?: ModelContext;
  kind?: "module" | "album";
}) {
  return {
    AlbumID: albumId,
    CatalogID: catalogId,
    Type: kind === "album" ? "习题" : "题目",
    QuestionID: row.QuestionID,
    Answer: correct ? 1 : 2,
    ContentID: row.ID,
    StuID: stuid,
    BusValue: answer,
    ...(row.AnswerID ? { ID: row.AnswerID } : {}),
    ...(Number(context.ProductID) > 0
      ? { ProductID: context.ProductID, CourseID: context.CourseID }
      : {}),
    ...(isLeadFill
      ? {
          ProductID: context.ProductID,
          CourseID: context.CourseID,
          BusID: context.LeadFillID,
          BusType: "真题查漏补缺",
        }
      : {}),
  };
}

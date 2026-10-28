type Row = Record<string, any>;
export const mathHistoryCommands = {
  教辅: "GetUserCourseQrcodeBookListPager1",
  拍照搜题: "GetUserCourseQrcodePhotoBookListPager1",
  真题: "GetUserCourseQrcodeBookList2",
  举一反三: "GetUserExtrapolationList",
} as const;
export function mathHistoryParams(
  stuid: string,
  page: number,
  pageSize: number,
  type: keyof typeof mathHistoryCommands,
) {
  return {
    StuID: stuid,
    Page: page * pageSize,
    PageSize: pageSize,
    ...(type === "真题" ? { Notes: "真题" } : {}),
  };
}
export function mathHistoryQuestion(row: Row): Row {
  return {
    ...row,
    QuestionID: row.qID || row.ID || row.QuestionID,
    BookID: row.bookID || row.BookID,
    BookName: row.bookName || row.BookName,
    QuestionSort: row.QuestionSort || row.questionID,
    QuestionPage: row.QuestionPage || row.questionPage,
  };
}

import { mathCommand, mathGet, mathRows } from "./math";
import type { MathRow } from "./math";
import {
  mathBookAnalysisAllowed,
  mathBookNeedsUsageCheck,
  mathQrcodeRequestPlan,
} from "./math-access-model";
export {
  mathBookAnalysisAllowed,
  mathBookNeedsUsageCheck,
  mathVipActive,
} from "./math-access-model";
export async function ensureMathBookAnalysisAccess({
  stuid,
  qid,
  bookId,
  user,
  source = "电子书",
  preview = false,
}: {
  stuid: string;
  qid: string | number;
  bookId: string | number;
  user: MathRow;
  source?: string;
  preview?: boolean;
}) {
  if (
    preview ||
    ["课程", "专辑", "选择题库", "考试"].includes(source) ||
    !bookId
  )
    return;
  const book = mathRows(
    await mathGet("/api/book_list/GetListByPage", {
      ID: bookId,
      page: 0,
      limit: 1000,
    }),
  )[0];
  if (!book)
    throw new Error("当前书籍权限信息无法读取，请重新加载后再查看解析");
  if (!mathBookNeedsUsageCheck(book, user)) return;
  const result = await mathGet("/api/course_qrcode_book/GetStuID", {
    StuID: stuid,
    BookID: bookId,
    AddTime: book.ActBusDate,
  });
  const viewed = mathRows(result);
  if (!mathBookAnalysisAllowed({ book, user, qid, viewed }))
    throw new Error(
      "当前书籍可查看的解析次数已用完，请先在已有权益中激活对应书籍后再查看。",
    );
}
export async function resolveMathBookQrcode(qrcode: string, stuid: string) {
  const plan = mathQrcodeRequestPlan(qrcode);
  const mapping = mathRows(
    await mathCommand(
      plan.mapping.command,
      plan.mapping.params,
      plan.mapping.model,
    ),
  );
  const courseOnly = mapping.some((row) => Number(row.IsLogin) === 1);
  if (courseOnly) {
    const enrolled = mathRows(
      await mathCommand("checkQuestionInUserCourseList2", {
        StuID: stuid,
        System_Station_ID: 1,
      }),
    );
    if (!enrolled.length)
      throw new Error(
        "这份配套资料仅向已有课程权限的学员开放，当前账号暂不可阅读。",
      );
  }
  return mathRows(
    await mathCommand(
      plan.content.command,
      plan.content.params,
      plan.content.model,
    ),
  ).map((row) => ({
    ...row,
    ...(courseOnly ? { _mathAnalysisSource: "课程" } : {}),
  }));
}

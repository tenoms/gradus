import { mathCommand, mathGet } from "../api/math";
import type { MathPaperContext, ExamRow } from "./math-exams";
import { reportRows } from "./report-model.mjs";
export async function loadMathReport(
  context: MathPaperContext,
  meta: ExamRow,
  questions: ExamRow[],
  userRoot = 1,
) {
  const StuID = context.stuid,
    PaperID = context.PaperID,
    common = { PaperID, StuID, System_Station_ID: 1 };
  const requests: Record<string, () => Promise<any>> = {};
  if (context.kind === "dry") {
    const shared = { DryrunID: context.DryID, PaperID };
    requests.summary = () =>
      mathCommand(
        userRoot > 1 && userRoot < 7
          ? "GetExamStatistics5"
          : "GetExamStatistics6",
        { DryrunID: context.DryID, StuID, SchoolName: "", MajorName: "" },
      );
    requests.distribution = () => mathCommand("GetExamStatistics2", shared);
    requests.population = () => mathCommand("GetExamStatistics3", shared);
    requests.scores = () =>
      mathCommand("GetExamUserScoreAndQuestionType", { ...shared, StuID });
    requests.knowledge = () =>
      mathCommand("GetExamStatistics4", { DryrunID: context.DryID, StuID });
  } else if (context.kind === "weekly") {
    requests.dimensions = () =>
      mathCommand("GetKsPaperQuestionTypeList", common);
    requests.scopes = () =>
      mathGet("/api/question_property_content/GetListByAll", {
        PropertyID: 20,
        SortDesc: "Code,Sort",
        IsValid: 1,
      });
    const wrong = questions.filter(
      (q) =>
        Number(q.BusValue || q.ks_user_record?.BusValue) === 2 ||
        Number(q.uScore) < Number(q.qScore ?? q.Score),
    );
    if (wrong.length)
      requests.recommendations = () =>
        mathCommand("GetKsQuestionhighscorealbumList", {
          QuestionIDs: wrong.map((q) => q.QuestionID || q.ID).join(","),
        });
  } else {
    const shared = {
      CourseID: context.CourseID,
      CalendarID: context.CalendarID,
      ProductID: context.ProductID,
    };
    requests.summary = () =>
      mathCommand(
        context.isTeacher
          ? "GetMyMarkPaperScoreRanking"
          : "GetMyPaperScoreRanking",
        {
          ...shared,
          StuID,
          ...(context.isTeacher ? { PaperID } : { BusID: PaperID }),
        },
      );
    requests.distribution = () =>
      mathCommand("GetPaperScourByWxApp", {
        PaperID,
        CourseID: context.CourseID,
        CalendarID: context.CalendarID,
      });
    if (meta.PaperNotes)
      requests.history = () =>
        mathCommand("GetPaperPastPerformance", {
          StuID,
          System_Station_ID: meta.System_Station_ID || 1,
          PaperNotes: meta.PaperNotes,
        });
    requests.recommendations = () =>
      mathGet("/api/c_paper/GetPaperByInfoResult", {
        ID: PaperID,
        RelatedStuID: StuID,
        BusID: context.CalendarID || 0,
      });
    if (!context.isAbility)
      requests.followup = () =>
        mathGet("/api/c_paper/GetListByAll", {
          BusType: 3,
          RelatedID: PaperID,
        });
  }
  const keys = Object.keys(requests),
    results = await Promise.allSettled(keys.map((key) => requests[key]()));
  const data: Record<string, any> = {},
    errors: { name: string; message: string }[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") data[keys[index]] = result.value;
    else
      errors.push({
        name: keys[index],
        message: result.reason?.message || "报告数据暂时不可用",
      });
  });
  if (context.kind === "weekly" && !data.recommendations && data.dimensions) {
    const wrong = reportRows(data.dimensions).filter(
      (q) => Number(q.uScore) < Number(q.Score),
    );
    if (wrong.length) {
      try {
        data.recommendations = await mathCommand(
          "GetKsQuestionhighscorealbumList",
          { QuestionIDs: wrong.map((q) => q.QuestionID || q.ID).join(",") },
        );
      } catch (e: any) {
        errors.push({ name: "recommendations", message: e.message });
      }
    }
  }
  return { data, errors };
}

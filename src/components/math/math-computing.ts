import {
  mathCommand,
  mathGet,
  mathPost,
  mathData,
  mathRows,
} from "../../platforms/math";
export type ComputingRow = Record<string, any>;
export interface ComputingContext {
  stuid: string;
  catalogID: string | number;
  PaperID: string | number;
  mistakes?: boolean;
  questionID?: string | number;
}
export function computingRows(response: any): ComputingRow[] {
  const d = mathData(response);
  return Array.isArray(d?.[0]) ? d[0] : mathRows(response);
}
export function computingTree(rows: ComputingRow[]): ComputingRow[] {
  return rows
    .filter((r) => !r.PID || Number(r.PID) === 0)
    .map((r) => ({
      ...r,
      children: rows.filter((c) => String(c.PID) === String(r.ID)),
    }));
}
export function computingAnswers(options: ComputingRow[]): string[] {
  return options
    .filter((o) => Number(o.IsAnswer) === 1)
    .map((o) => String(o.ID))
    .sort();
}
export function computingCorrect(question: ComputingRow, answer: string) {
  return (
    !!answer.trim() &&
    answer.split(",").filter(Boolean).sort().join(",") ===
      computingAnswers(question.options || []).join(",")
  );
}
export function mergeComputingQuestions(
  questions: ComputingRow[],
  resolutions: ComputingRow[],
  analyses: ComputingRow[],
  logs: ComputingRow[],
): ComputingRow[] {
  return questions.map((q) => {
    const id = String(q.QuestionID),
      details = resolutions.filter((r) => String(r.QuestionID) === id),
      record = logs.find(
        (r) => r.BusType === "题目" && String(r.QuestionID) === id,
      );
    return {
      ...q,
      stems: details.filter((r) => r.Type === "题干"),
      options: details.filter((r) => r.Type === "选项"),
      steps: details
        .filter((r) => r.Type === "解题步骤")
        .map((step) => ({
          ...step,
          looklog: logs.find(
            (l) =>
              l.BusType === "查看解析步骤" &&
              String(l.QuestionID) === id &&
              String(l.BusValue) === String(step.ID),
          ),
        })),
      analyses: analyses.filter((r) => String(r.QuestionID) === id),
      record: record || null,
    };
  });
}
export function computingRecord(
  context: ComputingContext,
  question: ComputingRow,
  answer: string,
  seconds: number,
): ComputingRow {
  const old = question.record,
    correct = computingCorrect(question, answer);
  if (context.mistakes)
    return {
      ID: question.userRecordID || question.record?.ID,
      IsFinished: correct ? 1 : 0,
      AnswerState: correct ? 1 : 0,
      UpdateColumns: "IsFinished,AnswerState",
    };
  return {
    Type: "四大计算",
    System_Station_ID: 1,
    QuestionID: question.QuestionID,
    PaperID: Number(context.PaperID),
    StuID: context.stuid,
    IsFinished: correct ? 1 : 0,
    Answer: answer,
    AnswerState: correct ? 1 : 0,
    BusID: Number(context.catalogID),
    BusType: "题目",
    BusValue: Number(old?.BusValue || 0) + 1,
    Notes: String(Math.max(0, Math.round(seconds))),
    ...(old?.ID
      ? {
          ID: old.ID,
          UpdateColumns: "BusValue,IsFinished,Answer,AnswerState,Notes",
        }
      : {}),
  };
}
export function computingPaperRecord(
  context: ComputingContext,
  finished: boolean,
  existing?: ComputingRow,
): ComputingRow {
  return {
    Type: "四大计算",
    System_Station_ID: 1,
    QuestionID: 0,
    PaperID: Number(context.PaperID),
    StuID: context.stuid,
    IsFinished: finished ? 1 : 0,
    Answer: 0,
    AnswerState: 0,
    BusID: Number(context.catalogID),
    BusType: "试卷",
    ...(existing?.ID ? { ID: existing.ID, UpdateColumns: "IsFinished" } : {}),
  };
}
export function computingHintRecord(
  context: ComputingContext,
  question: ComputingRow,
  step: ComputingRow,
  state: number,
): ComputingRow {
  return {
    Type: "四大计算",
    System_Station_ID: 1,
    QuestionID: question.QuestionID,
    PaperID: Number(context.PaperID),
    StuID: context.stuid,
    IsFinished: 0,
    Answer: 0,
    AnswerState: state,
    BusID: Number(context.catalogID),
    BusType: "查看解析步骤",
    BusValue: step.ID,
    ...(step.looklog?.ID
      ? { ID: step.looklog.ID, UpdateColumns: "AnswerState" }
      : {}),
  };
}
export const computingApi = {
  catalogs: (StuID: string) =>
    mathCommand(
      "GetMajorComputingAndUserAllocation",
      { StuID, System_Station_ID: 1, IsValid: 1 },
      true,
    ),
  lastLog: (StuID: string) =>
    mathCommand("GetMajorComputingLastLog", { StuID }),
  errorCount: (StuID: string) =>
    mathCommand("GetMajorComputingUserErrorQuestionCount", { StuID }),
  errors: (StuID: string) =>
    mathCommand("GetMajorComputingUserErrorQuestionList", { StuID }),
  info: (ID: string | number) =>
    mathGet("/api/book_highscorealbum/GetListByAll", { ID }),
  records: (context: ComputingContext) =>
    mathGet("/api/c_paper_users_record/GetListByAll", {
      Type: "四大计算",
      System_Station_ID: 1,
      PaperID: Number(context.PaperID),
      StuID: context.stuid,
      BusID: Number(context.catalogID),
    }),
  save: (data: ComputingRow) =>
    mathPost("/api/c_paper_users_record/Inner_c_paper_users_record", data),
  retry: (context: ComputingContext) =>
    mathPost("/api/c_paper_users_record/RetryPaper", {
      Type: "四大计算",
      System_Station_ID: 1,
      PaperID: Number(context.PaperID),
      StuID: context.stuid,
      BusID: Number(context.catalogID),
    }),
  async paper(context: ComputingContext) {
    if (context.mistakes) {
      const query = {
        StuID: context.stuid,
        BusID: context.catalogID,
        PaperID: context.PaperID,
      };
      const [questions, resolutions] = await Promise.all([
        mathCommand("GetMajorComputingUserErrorQuestionListByCatalog", query),
        mathCommand("GetMajorComputingUserErrorQuestionResolveList", query),
      ]);
      const q = computingRows(questions).map((r) => ({
        ...r,
        QuestionID: r.QuestionErrorID || r.QuestionID,
        _question_list: r,
      }));
      return {
        questions: mergeComputingQuestions(
          q,
          computingRows(resolutions),
          [],
          [],
        ),
        record: null,
        meta: { Name: "错题反复练" },
      };
    }
    const [questions, resolutions, analyses, logs, meta] = await Promise.all([
      mathGet("/api/c_paper_question/GetListByAll", {
        PaperID: context.PaperID,
        SortDesc: "Sort",
      }),
      mathCommand("GetPaperQuestionResolveAndTypeList", {
        PaperID: context.PaperID,
      }),
      mathCommand("GetPaperQuestionAnalysisList", {
        PaperID: Number(context.PaperID),
      }),
      this.records(context),
      mathGet("/api/c_paper/GetListByAll", { ID: context.PaperID }),
    ]);
    const recordRows = computingRows(logs);
    return {
      questions: mergeComputingQuestions(
        computingRows(questions),
        computingRows(resolutions),
        computingRows(analyses),
        recordRows,
      ),
      record:
        recordRows.find(
          (r) => Number(r.QuestionID) === 0 && r.BusType === "试卷",
        ) || null,
      meta: computingRows(meta)[0] || {},
    };
  },
  async finish(
    context: ComputingContext,
    questions: ComputingRow[],
    record: ComputingRow | null,
  ) {
    const missing = questions
      .filter((q) => !q.record)
      .map((q) => ({
        Type: "四大计算",
        System_Station_ID: 1,
        QuestionID: q.QuestionID,
        PaperID: Number(context.PaperID),
        StuID: context.stuid,
        IsFinished: 0,
        Answer: "",
        AnswerState: 0,
        BusID: Number(context.catalogID),
        BusType: "题目",
        BusValue: 1,
        Notes: String(q.questiontime || 0),
      }));
    if (missing.length)
      await mathPost(
        "/api/c_paper_users_record/InnerAll_c_paper_users_record",
        { Content: JSON.stringify(missing) },
      );
    return this.save(computingPaperRecord(context, true, record || undefined));
  },
};

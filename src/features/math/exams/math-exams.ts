import {
  mathCommand,
  mathGet,
  mathPost,
  mathRows,
  mathData,
} from "../api/math";
export type ExamRow = Record<string, any>;
export interface MathPaperContext {
  kind: "dry" | "weekly" | "course";
  stuid: string;
  PaperID: string | number;
  DryID?: string | number;
  RoomID?: string | number;
  CourseID?: string | number;
  CalendarID?: string | number;
  ProductID?: string | number;
  isAbility?: boolean;
  isTeacher?: boolean;
  UserRoot?: number;
}
export function dryTeacherMode(dry: ExamRow, userRoot: number) {
  return Number(dry.IsMarkPaper) === 1 && userRoot >= 2 && userRoot <= 6;
}
export function table(response: any, index = 0): ExamRow[] {
  const data = mathData(response);
  return Array.isArray(data?.[0]) ? data[index] || [] : mathRows(response);
}
export function parseExamJson(value: any): ExamRow {
  if (typeof value === "object" && value) return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}
export function serverDate(value: any): number {
  if (!value) return NaN;
  const text = String(value).replace(" ", "T");
  return Date.parse(
    /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(text) ? `${text}+08:00` : text,
  );
}
export function serverNow() {
  return new Date().toLocaleString("sv-SE", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
}
export function durationText(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
export function examDurationSeconds(context: MathPaperContext, meta: ExamRow) {
  return Math.max(
    0,
    context.kind === "weekly" && Number(meta.ExamDuration) > 0
      ? Number(meta.ExamDuration) * 60
      : Number(meta.Times) || 0,
  );
}
export function examName(row: ExamRow) {
  return String(
    row.Name ||
      row.Title ||
      row.PaperName ||
      row.ExamName ||
      row.DryrunName ||
      "学习测评",
  );
}
export function questionKey(row: ExamRow) {
  return String(row.QuestionID || row.ID || row.qID || "");
}
export function questionText(row: ExamRow) {
  return (
    row._question_list?.QuestionContent ||
    row._question_list?.QuestionTxt ||
    row.QuestionContent ||
    row.QuestionTxt ||
    row.Content ||
    ""
  );
}
export function questionMax(row: ExamRow) {
  return Number(row.qScore ?? row.Score ?? row.QuestionScore ?? 0) || 0;
}
export function optionRows(question: ExamRow): ExamRow[] {
  const options = question.Option || question.QuestionOption || [];
  return Array.isArray(options)
    ? options.filter((o) => o.Type === "选项" || (!o.Type && o.Content))
    : [];
}
export function correctOptionIds(question: ExamRow): string[] {
  return optionRows(question)
    .filter((o) => Number(o.IsAnswer) === 1)
    .map((o) => String(o.ID))
    .sort();
}
export function optionCorrect(question: ExamRow, answer: string) {
  const correct = correctOptionIds(question);
  return (
    !!answer &&
    correct.length > 0 &&
    answer.split(",").filter(Boolean).sort().join(",") === correct.join(",")
  );
}
export function gradeQuestion(
  question: ExamRow,
  answer: string,
  selfScore?: number,
) {
  const max = questionMax(question),
    options = optionRows(question);
  if (options.length)
    return {
      score: optionCorrect(question, answer) ? max : 0,
      correct: optionCorrect(question, answer),
    };
  const score = Math.min(max, Math.max(0, Number(selfScore) || 0));
  return { score, correct: score === max && max > 0 };
}
export function abilityTeacherRecords(
  ordinary: ExamRow[],
  teacher: ExamRow[],
): boolean {
  const a = ordinary
      .map((q) => q._c_course_users_record)
      .filter((r) => Number(r?.ID) > 0),
    b = teacher
      .map((q) => q._c_paper_student_record)
      .filter((r) => Number(r?.ID) > 0);
  if (!b.length) return false;
  if (!a.length) return true;
  const latest = (rows: ExamRow[]) =>
    Math.max(
      0,
      ...rows
        .map((r) => serverDate(r.UpdateTime || r.EditTime || r.AddTime))
        .filter(Number.isFinite),
    );
  const at = latest(a),
    bt = latest(b);
  return at !== bt ? bt > at : b.length > a.length;
}
export function existingRecord(context: MathPaperContext, q: ExamRow): ExamRow {
  if (context.kind === "dry") return q._log || {};
  if (context.kind === "course")
    return context.isTeacher
      ? q._c_paper_student_record || {}
      : q._c_course_users_record || {};
  return (
    q.ks_user_record || {
      ID: q.uID || 0,
      MyAnswer: q.MyAnswer || "",
      Score: q.uScore ?? "",
      BusValue: q.BusValue,
    }
  );
}
export function recordAnswer(context: MathPaperContext, record: ExamRow) {
  return String(
    context.kind === "dry"
      ? record.StuContent || ""
      : context.kind === "course"
        ? context.isTeacher
          ? record.StuQuestionImg || record.StuQuestionContent || ""
          : record.Answer || ""
        : record.MyAnswer || "",
  );
}
export function recordScore(context: MathPaperContext, record: ExamRow) {
  return context.kind === "dry" || context.isTeacher
    ? record.QuestionScore
    : context.kind === "course"
      ? record.BusValue
      : record.Score;
}
export function buildMathExamRecord(
  context: MathPaperContext,
  q: ExamRow,
  answer: string,
  selfScore: number | undefined,
  elapsedSeconds: number,
  teacherMark = false,
): ExamRow {
  const old = existingRecord(context, q),
    grade = gradeQuestion(q, answer, selfScore),
    base = { ID: old.ID || 0, StuID: context.stuid, System_Station_ID: 1 },
    hasOptions = optionRows(q).length > 0,
    pendingTeacher = teacherMark && !hasOptions;
  if (context.kind === "dry")
    return {
      ...base,
      PaperID: context.PaperID,
      DryrunID: context.DryID,
      BusID: context.RoomID || 0,
      QuestionID: q.ID || q.QuestionID,
      QuestionScore: pendingTeacher ? 0 : grade.score,
      StuQuestionState: pendingTeacher ? 1 : grade.correct ? 3 : 2,
      StuContent:
        answer ||
        (!hasOptions ? (grade.correct ? "回答正确" : "回答错误") : "未提交"),
      Teacher: pendingTeacher ? "" : hasOptions ? "系统阅卷" : "学生阅卷",
      TeacherState: pendingTeacher ? 0 : 1,
      TeacherContent: "",
      ...(old.ID
        ? {
            UpdateColumns:
              "ID,StuContent,StuQuestionState,Teacher,TeacherState,QuestionScore",
          }
        : {}),
    };
  if (context.kind === "course" && context.isTeacher)
    return {
      ...base,
      CourseID: context.CourseID,
      QuestionID: q.QuestionID || q.ID,
      PaperID: context.PaperID,
      BusID: context.CalendarID,
      ProductID: context.ProductID,
      StuQuestionImg: hasOptions || /^https?:\/\//i.test(answer) ? answer : "",
      StuQuestionContent:
        hasOptions || /^https?:\/\//i.test(answer) ? "" : answer,
      StuQuestionState: 1,
      Teacher: hasOptions ? "系统" : "",
      QuestionScore: hasOptions ? grade.score : 0,
      TeacherState: hasOptions ? 1 : 0,
      AppraiseID: old.AppraiseID || 0,
      ...(old.ID
        ? {
            UpdateColumns:
              "ID,CourseID,StuID,QuestionID,StuQuestionImg,StuQuestionContent,StuQuestionState,System_Station_ID,BusID,PaperID,QuestionScore,TeacherState",
          }
        : {}),
    };
  if (context.kind === "course")
    return {
      ...base,
      CourseID: context.CourseID,
      CalendarID: context.CalendarID,
      ProductID: context.ProductID,
      BusType: 3,
      BusID: context.PaperID,
      BusValue: grade.score,
      AnswerState: grade.correct ? 1 : 0,
      BusRelationID: q.QuestionID || q.ID,
      BookID: q._question_list?.BookID || q.BookID,
      Answer: answer,
      Notes: String(
        (Number(old.Notes) || 0) + Math.max(0, Math.round(elapsedSeconds)),
      ),
    };
  return {
    ...base,
    QuestionID: q.QuestionID || q.ID,
    PaperID: context.PaperID,
    Score: grade.score,
    MyAnswer: optionRows(q).length ? answer : grade.correct ? "1" : "0",
    BusValue: grade.correct ? 1 : 2,
    Notes: String(
      (Number(old.Notes) || 0) + Math.max(0, Math.round(elapsedSeconds)),
    ),
    ...(old.ID
      ? {
          UpdateColumns:
            "ID,StuID,QuestionID,System_Station_ID,PaperID,MyAnswer,Score,BusValue,Notes",
        }
      : {}),
  };
}
export const mathExamApi = {
  dryList: (stuid: string, subject: string, kind: string, page: number) =>
    mathGet(
      kind === "mine"
        ? "/api/sys_users_dryrun/GetDryrunList2"
        : "/api/sys_users_dryrun/GetDryrunListBy2",
      {
        IsValid: 1,
        BusType: "模考",
        System_Station_ID: 1,
        SortDesc: "Sort Desc",
        page,
        limit: 20,
        Type: subject,
        StuID: stuid,
        ...(kind === "mine"
          ? {}
          : { BusValue: kind === "stage" ? "阶段性测试" : "模考" }),
      },
    ),
  dryInfo: (DryID: string | number, StuID: string) =>
    mathCommand("GetDryAppliInfo2", { DryID, StuID }),
  application: (DryID: string | number, StuID: string) =>
    mathCommand("GetDryAppliInfoStuID", { DryID, StuID }),
  weeklyList: (StuID: string) =>
    mathCommand("GetksPaperList", { StuID, System_Station_ID: 1 }),
  deleteWeekly: (StuID: string, ids: (string | number)[]) => {
    const selected = [
      ...new Set(
        ids.map(String).filter((id) => /^\d+$/.test(id) && Number(id) > 0),
      ),
    ];
    if (!selected.length) throw new Error("请选择要删除的试卷");
    return mathPost("/api/ks_user_paper/DelKsUserPaper", {
      PaperIDs: selected.join(","),
      StuID,
    });
  },
  weeklyConfigs: () =>
    mathCommand("GetKsConfigsList", { System_Station_ID: 1 }),
  scopes: () =>
    mathGet("/api/question_property_content/GetListByAll", {
      PropertyID: 20,
      SortDesc: "Code,Sort",
      IsValid: 1,
    }),
  async createWeekly(data: ExamRow) {
    const response = await mathPost("/api/ks_paper/RelPaper3", data);
    const result = mathData(response);
    if (!result || typeof result !== "object" || !(Number(result.PaperID) > 0))
      throw new Error(typeof result === "string" && result.trim() ? result : "上游没有返回可作答的试卷编号，请重试。");
    return response;
  },
  ranking: (DryrunID: string | number, SchoolName = "", MajorName = "") =>
    mathCommand("GetExamUserRink", { DryrunID, SchoolName, MajorName }),
  statistics: (DryrunID: string | number, StuID: string) =>
    mathCommand("GetExamStatistics6", {
      DryrunID,
      StuID,
      SchoolName: "",
      MajorName: "",
    }),
  async abilityTeacherMode(context: MathPaperContext) {
    const query = {
      StuID: context.stuid,
      PaperID: context.PaperID,
      System_Station_ID: 1,
      CalendarID: context.CalendarID || 0,
      ProductID: context.ProductID || 0,
    };
    const results = await Promise.allSettled([
      mathGet("/api/c_paper_question/GetListByPaper2", query),
      mathGet("/api/c_paper_question/GetListByStudentPaper", {
        ...query,
        page: 0,
        limit: 1000,
      }),
    ]);
    const normal =
        results[0].status === "fulfilled" ? table(results[0].value) : [],
      teacher =
        results[1].status === "fulfilled" ? table(results[1].value) : [];
    const hasNormal = normal.some(
        (q) => Number(q._c_course_users_record?.ID) > 0,
      ),
      hasTeacher = teacher.some(
        (q) => Number(q._c_paper_student_record?.ID) > 0,
      );
    if (
      !hasNormal &&
      !hasTeacher &&
      results.some((r) => r.status === "rejected")
    )
      throw new Error("暂时无法核实这份能力测评的历史记录，请重试。");
    return abilityTeacherRecords(normal, teacher);
  },
  async loadPaper(context: MathPaperContext) {
    const common = {
      StuID: context.stuid,
      PaperID: context.PaperID,
      System_Station_ID: 1,
    };
    if (context.kind === "weekly") {
      const [meta, questions] = await Promise.all([
        mathCommand("GeKstUserPaperInfo", common),
        mathCommand("GetKsPaperQuestionAndksUserRecordListNew", common),
      ]);
      return {
        meta: table(meta)[0] || {},
        questions: table(questions),
        paperlog: table(meta)[0] || {},
        teacherMark: false,
        room: {},
      };
    }
    if (context.kind === "course") {
      if (context.isTeacher) {
        const [meta, questions, student] = await Promise.all([
          mathGet("/api/c_paper/GetListByAll", { ID: context.PaperID }),
          mathGet("/api/c_paper_question/GetListByStudentPaper", {
            ...common,
            CalendarID: context.CalendarID,
            ProductID: context.ProductID,
            page: 0,
            limit: 1000,
          }),
          mathGet("/api/c_paper_student/GetListByAll", {
            CourseID: context.CourseID,
            StuID: context.stuid,
            PaperID: context.PaperID,
            StuState: 1,
            System_Station_ID: 1,
            BusID: context.CalendarID,
            ProductID: context.ProductID,
          }),
        ]);
        const log = table(student)[0] || {};
        return {
          meta: table(meta)[0] || {},
          questions: table(questions),
          paperlog: {
            ...log,
            IsSubmit: Number(log.StuState) === 1 ? 1 : 0,
            IsLookScore: Number(log.TeacherState) === 1 ? 1 : 0,
          },
          teacherMark: true,
          room: {},
        };
      }
      const [meta, questions, finished] = await Promise.all([
        mathGet("/api/c_paper/GetListByAll", { ID: context.PaperID }),
        mathGet("/api/c_paper_question/GetListByPaper2", {
          ...common,
          CalendarID: context.CalendarID,
          ProductID: context.ProductID,
        }),
        mathGet("/api/c_course_users_record/GetListByAll", {
          StuID: context.stuid,
          CourseID: context.CourseID,
          CalendarID: context.CalendarID,
          ProductID: context.ProductID,
          BusType: 3,
          BusID: context.PaperID,
          BusRelationID: -1,
          IsFinished: 1,
        }),
      ]);
      return {
        meta: table(meta)[0] || {},
        questions: table(questions),
        paperlog: table(finished).length
          ? { IsSubmit: 1, IsLookScore: 1, ...table(finished)[0] }
          : {},
        teacherMark: false,
        room: {},
      };
    }
    const [meta, questions, logs, paperlog, room] = await Promise.all([
      mathGet("/api/c_paper/GetListByAll", { ID: context.PaperID }),
      mathGet("/api/c_paper_question/GetPaperQuestion", {
        ID: context.PaperID,
        System_Station_ID: 1,
      }),
      mathGet("/api/sys_users_dryrun_questionlog/GetListByPage", {
        ...common,
        DryrunID: context.DryID,
        page: 1,
        limit: 1000,
      }),
      mathGet("/api/sys_users_dryrun_paperlog/GetListByPage", {
        StuID: context.stuid,
        DryrunID: context.DryID,
      }),
      mathCommand("GetDryAppRoomInfo", {
        DryID: context.DryID,
        ExamID: context.RoomID || 0,
        StuID: context.stuid,
      }),
    ]);
    const logRows = table(logs),
      dry = table(room)[0] || {},
      userRoot = Number(table(room, 2)[0]?.UserRoot ?? context.UserRoot ?? 0),
      teacherMark = dryTeacherMode(dry, userRoot);
    return {
      meta: table(meta)[0] || {},
      questions: table(questions).map((q) => ({
        ...q,
        _log:
          logRows.find(
            (l) => String(l.QuestionID) === String(q.ID || q.QuestionID),
          ) || {},
      })),
      paperlog: { ...table(paperlog)[0], UserRoot: userRoot },
      teacherMark,
      unifiedTime: Number(dry.IsUnifyTime) === 1,
      room: {
        ...table(room, 1)[0],
        ...(!teacherMark && dry.SelfEndTime
          ? { ExamEndTime: dry.SelfEndTime }
          : {}),
      },
    };
  },
  resolve: (QuestionID: string | number) =>
    mathCommand("GetQuestionInfoByResolve", { QuestionID }),
  saveRecord: (context: MathPaperContext, data: ExamRow) =>
    mathPost(
      context.kind === "dry"
        ? "/api/sys_users_dryrun_questionlog/Inner_sys_users_dryrun_questionlog"
        : context.kind === "course"
          ? context.isTeacher
            ? "/api/c_paper_student_record/Inner_c_paper_student_record"
            : "/api/c_course_users_record/Inner_c_course_users_record"
          : "/api/ks_user_record/Inner_ks_user_record",
      data,
    ),
  async startPaper(
    context: MathPaperContext,
    meta: ExamRow,
    paperlog: ExamRow,
  ) {
    if (context.kind === "weekly" && meta.ID && !meta.StartTime)
      return mathPost("/api/ks_user_paper/Inner_ks_user_paper", {
        ID: meta.ID,
        StartTime: serverNow(),
        UpdateColumns: "ID,StartTime",
      });
    if (context.kind === "dry" && !paperlog.ID)
      return mathPost(
        "/api/sys_users_dryrun_paperlog/Inner_sys_users_dryrun_paperlog",
        {
          System_Station_ID: 1,
          StuID: context.stuid,
          PaperID: context.PaperID,
          DryrunID: context.DryID,
          IsSubmit: 0,
          TeacherState: 0,
          IsLookScore: 0,
          IsPushMsg: 0,
          Score: 0,
        },
      );
  },
  async finish(
    context: MathPaperContext,
    meta: ExamRow,
    paperlog: ExamRow,
    totalScore: number,
    totalTime: number,
    teacherMark: boolean,
    allSystem = false,
    questions: ExamRow[] = [],
  ) {
    const missing = questions.filter((q) => !existingRecord(context, q).ID);
    if (context.kind === "dry" && missing.length)
      await mathPost(
        "/api/sys_users_dryrun_questionlog/InnerAll_sys_users_dryrun_questionlog",
        {
          Content: JSON.stringify(
            missing.map((q) => ({
              StuID: context.stuid,
              PaperID: context.PaperID,
              DryrunID: context.DryID,
              BusID: context.RoomID || 0,
              QuestionID: q.ID || q.QuestionID,
              System_Station_ID: 1,
              TeacherState: 1,
              QuestionScore: 0,
              StuQuestionState: 0,
              StuContent: "未提交",
              TeacherContent: "",
            })),
          ),
        },
      );
    if (context.kind === "course" && context.isTeacher && missing.length)
      await mathPost(
        "/api/c_paper_student_record/InnerAll_c_paper_student_record",
        {
          Content: JSON.stringify(
            missing.map((q) => ({
              ID: 0,
              CourseID: context.CourseID,
              StuID: context.stuid,
              QuestionID: q.QuestionID || q.ID,
              PaperID: context.PaperID,
              BusID: context.CalendarID,
              ProductID: context.ProductID,
              System_Station_ID: 1,
              AppraiseID: 0,
              StuQuestionImg: "",
              StuQuestionContent: optionRows(q).length ? "" : "不会做",
              StuQuestionState: 1,
              TeacherState: 0,
              QuestionScore: 0,
            })),
          ),
        },
      );
    if (context.kind === "dry")
      return mathPost(
        "/api/sys_users_dryrun_paperlog/Inner_sys_users_dryrun_paperlog",
        {
          ID: paperlog.ID || 0,
          System_Station_ID: 1,
          StuID: context.stuid,
          PaperID: context.PaperID,
          DryrunID: context.DryID,
          IsSubmit: 1,
          TeacherState: 1,
          IsLookScore: teacherMark ? 0 : 1,
          IsPushMsg: teacherMark ? 0 : 1,
          Score: totalScore,
          AddPerson: teacherMark ? "系统阅卷" : "学生阅卷",
          ...(paperlog.ID
            ? {
                UpdateColumns:
                  "AddPerson,Score,IsSubmit,TeacherState,IsLookScore,IsPushMsg",
              }
            : {}),
        },
      );
    if (context.kind === "weekly")
      return mathPost("/api/ks_user_paper/Inner_ks_user_paper", {
        ID: meta.ID,
        StuID: context.stuid,
        IsSubmit: 1,
        TotalScore: totalScore,
        TotalTime: totalTime,
        EndTime: serverNow(),
        UpdateColumns: "ID,IsSubmit,TotalTime,TotalScore,EndTime",
      });
    if (context.isTeacher)
      return mathPost("/api/c_paper_student/Inner_c_paper_student", {
        CourseID: context.CourseID,
        StuID: context.stuid,
        PaperID: context.PaperID,
        TeacherContextState: allSystem ? 1 : 0,
        TeacherContext: "",
        TeacherState: allSystem ? 1 : 0,
        StuState: 1,
        System_Station_ID: 1,
        BusID: context.CalendarID,
        ProductID: context.ProductID,
        ...(allSystem ? { Score: totalScore } : {}),
      });
    const result = await mathPost(
      "/api/c_course_users_record/Inner_c_course_users_record",
      {
        ID: 0,
        StuID: context.stuid,
        CourseID: context.CourseID,
        CalendarID: context.CalendarID,
        ProductID: context.ProductID,
        BusType: 3,
        BusID: context.PaperID,
        BusValue: totalScore,
        AnswerState: 1,
        BusRelationID: 0,
        IsFinished: 1,
      },
    );
    const warnings: string[] = [];
    if (!context.isAbility && Number(meta.BusType) === 1)
      try {
        await mathPost("/api/c_paper/RelPaperByStuID1", {
          ID: context.PaperID,
          RelatedStuID: context.stuid,
          BusID: context.CalendarID,
          CalendarID: context.CalendarID,
          ProductID: context.ProductID,
          ...(Number(meta.PaperType) === 2 ? { IsSpecial: 1 } : {}),
        });
      } catch (e) {
        warnings.push(e instanceof Error ? e.message : "个性化练习暂未生成");
      }
    return { ...result, warnings };
  },
};

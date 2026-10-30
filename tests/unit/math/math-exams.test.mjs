import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const fixture = {
  mathData: (r) => r?.data ?? r?.Data ?? r,
  mathRows: (r) => {
    const d = r?.data ?? r?.Data ?? r;
    return Array.isArray(d) ? (Array.isArray(d[0]) ? d[0] : d) : [];
  },
  mathCommand: (...args) => globalThis.__mathExamCommand(...args),
  mathGet: (...args) => globalThis.__mathExamGet(...args),
  mathPost: (...args) => globalThis.__mathExamPost(...args),
};
globalThis.__mathExamFixture = fixture;
const source = await readFile(
  new URL("../../../src/features/math/exams/math-exams.ts", import.meta.url),
  "utf8",
);
const output = ts
  .transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace(
    /import \{([^}]+)\} from ['"]\.\.\/api\/math['"];?/,
    (_, names) => `const {${names}}=globalThis.__mathExamFixture;`,
  );
const adapter = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);
const optionQuestion = {
  ID: 11,
  QuestionID: 11,
  Score: 8,
  Option: [
    { ID: 101, Type: "选项", IsAnswer: 1, Content: "option one" },
    { ID: 102, Type: "选项", IsAnswer: 0, Content: "option two" },
    { ID: 103, Type: "选项", IsAnswer: 1, Content: "option three" },
    { Type: "题干", Content: "fixture stem" },
  ],
};

test("math exam list and seven-table enrollment responses normalize without losing room tables", () => {
  const response = {
    data: [[{ ID: 1 }], [{ ID: 2 }], [], [], [], [{ ID: 3 }], []],
  };
  assert.deepEqual(adapter.table(response), [{ ID: 1 }]);
  assert.deepEqual(adapter.table(response, 5), [{ ID: 3 }]);
  assert.deepEqual(adapter.table({ data: [{ ID: 4 }] }), [{ ID: 4 }]);
  assert.deepEqual(adapter.table(undefined), []);
});
test("exam time parsing uses China timezone for backend naive timestamps", () => {
  assert.equal(
    adapter.serverDate("2026-10-29 10:30:00"),
    Date.parse("2026-10-29T02:30:00Z"),
  );
  assert.equal(adapter.durationText(3661), "01:01:01");
  assert.equal(adapter.durationText(-1), "00:00:00");
});
test("choice grading uses option IDs and set comparison, and subjective grading respects paper marks", () => {
  assert.deepEqual(adapter.gradeQuestion(optionQuestion, "103,101"), {
    score: 8,
    correct: true,
  });
  assert.deepEqual(adapter.gradeQuestion(optionQuestion, "101"), {
    score: 0,
    correct: false,
  });
  assert.deepEqual(adapter.gradeQuestion(optionQuestion, ""), {
    score: 0,
    correct: false,
  });
  assert.deepEqual(adapter.gradeQuestion({ qScore: 12 }, "working", 7.5), {
    score: 7.5,
    correct: false,
  });
  assert.deepEqual(adapter.gradeQuestion({ Score: 10 }, "", 99), {
    score: 10,
    correct: true,
  });
});
test("dry-run record preserves exam, room, actor, question and update columns", () => {
  const context = {
    kind: "dry",
    stuid: "student",
    PaperID: 55,
    DryID: 66,
    RoomID: 77,
  };
  const payload = adapter.buildMathExamRecord(
    context,
    { ...optionQuestion, _log: { ID: 9 } },
    "103,101",
    undefined,
    12,
    true,
  );
  assert.equal(payload.ID, 9);
  assert.equal(payload.PaperID, 55);
  assert.equal(payload.DryrunID, 66);
  assert.equal(payload.BusID, 77);
  assert.equal(payload.QuestionID, 11);
  assert.equal(payload.StuContent, "103,101");
  assert.equal(payload.QuestionScore, 8);
  assert.equal(payload.StuQuestionState, 3);
  assert.equal(payload.TeacherState, 1);
  assert.equal(payload.Teacher, "系统阅卷");
  assert.match(payload.UpdateColumns, /QuestionScore/);
  const subjective = adapter.buildMathExamRecord(
    context,
    { ID: 12, Score: 10 },
    "https://fixture.invalid/answer.png",
    undefined,
    8,
    true,
  );
  assert.equal(subjective.TeacherState, 0);
  assert.equal(subjective.StuQuestionState, 1);
  assert.equal(subjective.QuestionScore, 0);
});
test("weekly record retains upstream ID, score, answer and numeric-string Notes duration", () => {
  const context = { kind: "weekly", stuid: "student", PaperID: 8 };
  const record = adapter.buildMathExamRecord(
    context,
    { ...optionQuestion, ks_user_record: { ID: 19, Notes: "6" } },
    "101,103",
    undefined,
    4,
  );
  assert.equal(record.ID, 19);
  assert.equal(record.MyAnswer, "101,103");
  assert.equal(record.Score, 8);
  assert.equal(record.BusValue, 1);
  assert.equal(record.Notes, "10");
  assert.match(record.UpdateColumns, /Notes/);
});
test("ordinary and teacher course answers use different source contracts", () => {
  const context = {
    kind: "course",
    stuid: "student",
    PaperID: 12,
    CourseID: 13,
    CalendarID: 14,
    ProductID: 15,
  };
  const normal = adapter.buildMathExamRecord(
    context,
    {
      ...optionQuestion,
      _question_list: { BookID: 16 },
      _c_course_users_record: { ID: 17 },
    },
    "101,103",
    undefined,
    9,
  );
  assert.equal(normal.ID, 17);
  assert.equal(normal.BusType, 3);
  assert.equal(normal.BusID, 12);
  assert.equal(normal.BusRelationID, 11);
  assert.equal(normal.CalendarID, 14);
  assert.equal(normal.BookID, 16);
  assert.equal(normal.BusValue, 8);
  assert.equal(normal.AnswerState, 1);
  assert.equal(normal.Answer, "101,103");
  const teacher = adapter.buildMathExamRecord(
    { ...context, isTeacher: true },
    { QuestionID: 18, Score: 10, _c_paper_student_record: { ID: 20 } },
    "https://fixture.invalid/work.png",
    undefined,
    10,
    true,
  );
  assert.equal(teacher.ID, 20);
  assert.equal(teacher.BusID, 14);
  assert.equal(teacher.StuQuestionImg, "https://fixture.invalid/work.png");
  assert.equal(teacher.StuQuestionContent, "");
  assert.equal(teacher.TeacherState, 0);
  assert.equal(teacher.QuestionScore, 0);
  assert.equal(teacher.BusType, undefined);
  const teacherObjective = adapter.buildMathExamRecord(
    { ...context, isTeacher: true },
    optionQuestion,
    "101,103",
    undefined,
    1,
    true,
  );
  assert.equal(teacherObjective.Teacher, "系统");
  assert.equal(teacherObjective.TeacherState, 1);
  assert.equal(teacherObjective.QuestionScore, 8);
});
test("paper loader isolates teacher course data from ordinary course progress", async () => {
  const calls = [];
  globalThis.__mathExamGet = async (path, query) => {
    calls.push({ path, query });
    return { data: [] };
  };
  await adapter.mathExamApi.loadPaper({
    kind: "course",
    isTeacher: true,
    stuid: "s",
    PaperID: 1,
    CalendarID: 2,
    ProductID: 3,
    CourseID: 4,
  });
  assert.ok(
    calls.some(
      (c) =>
        c.path === "/api/c_paper_question/GetListByStudentPaper" &&
        c.query.CalendarID === 2,
    ),
  );
  assert.ok(calls.some((c) => c.path === "/api/c_paper_student/GetListByAll"));
  assert.equal(
    calls.some((c) => c.path === "/api/c_course_users_record/GetListByAll"),
    false,
  );
});
test("ordinary course loading keeps partial question records and unfinished summaries unsubmitted", async () => {
  const context = { kind: "course", stuid: "s", PaperID: 12, CourseID: 13, CalendarID: 14, ProductID: 15 };
  const cases = [
    [{ ID: 1, BusRelationID: 11, IsFinished: 1 }],
    [{ ID: 2, BusRelationID: 0, IsFinished: 0 }],
    [{ ID: 3, BusRelationID: 11, IsFinished: 1 }, { ID: 4, BusRelationID: "0", IsFinished: 0 }],
    [{ ID: 5, IsFinished: 1 }, { ID: 6, BusRelationID: null, IsFinished: 1 }, { ID: 7, BusRelationID: "", IsFinished: 1 }],
  ];
  for (const records of cases) {
    globalThis.__mathExamGet = async (path, query) => {
      if (path === "/api/c_course_users_record/GetListByAll") {
        assert.deepEqual(query, {
          StuID: "s", CourseID: 13, CalendarID: 14, ProductID: 15, BusType: 3, BusID: 12,
        }, "read the entire scoped paper record set to restore individual answers");
        return { data: records };
      }
      return { data: [] };
    };
    const result = await adapter.mathExamApi.loadPaper(context);
    assert.deepEqual(result.paperlog, {});
  }
});
test("ordinary course loading restores local question answers and record identities and clears unmatched shared records", async () => {
  const context = { kind: "course", stuid: "s", PaperID: 12, CourseID: 13, CalendarID: 14, ProductID: 15 };
  const questions = [
    { ID: 301, QuestionID: 11, _c_course_users_record: { ID: 999, Answer: "shared answer" } },
    { ID: 22, _c_course_users_record: { ID: 998, Answer: "shared answer" } },
    { ID: 33, _c_course_users_record: { ID: 997, Answer: "shared answer" } },
    { ID: 0, _c_course_users_record: { ID: 996, Answer: "shared answer" } },
  ];
  const records = [
    { ID: 101, BusRelationID: "11", IsFinished: 0, Answer: "101,103", BusValue: 8 },
    { ID: 102, BusRelationID: 22, IsFinished: 1, Answer: "saved working", BusValue: 0 },
    { ID: 103, BusRelationID: 0, IsFinished: 0, BusValue: 0 },
    { ID: 104, BusRelationID: 301, IsFinished: 1, Answer: "another question" },
  ];
  const before = structuredClone({ questions, records });
  globalThis.__mathExamGet = async (path) => ({
    data: path === "/api/c_course_users_record/GetListByAll" ? records
      : path === "/api/c_paper_question/GetListByPaper2" ? questions : [],
  });
  const result = await adapter.mathExamApi.loadPaper(context);
  assert.deepEqual(result.paperlog, {});
  assert.equal(adapter.existingRecord(context, result.questions[0]).ID, 101);
  assert.equal(adapter.recordAnswer(context, adapter.existingRecord(context, result.questions[0])), "101,103");
  assert.equal(adapter.existingRecord(context, result.questions[1]).ID, 102);
  assert.equal(adapter.recordAnswer(context, adapter.existingRecord(context, result.questions[1])), "saved working");
  assert.equal(result.questions[2]._c_course_users_record, null);
  assert.equal(result.questions[3]._c_course_users_record, null, "summary zero is never a question answer");
  assert.deepEqual({ questions, records }, before);
});
test("ordinary course loading restores only the completed summary identity and preserves a zero score", async () => {
  const context = { kind: "course", stuid: "s", PaperID: 12, CourseID: 13, CalendarID: 14, ProductID: 15 };
  const summary = {
    ID: 44, StuID: "s", BusID: 12, BusType: 3, CourseID: 13, CalendarID: 14, ProductID: 15,
    BusRelationID: "0", IsFinished: "1", BusValue: 0, AddTime: "2026-10-30 10:00:00",
  };
  globalThis.__mathExamGet = async (path) => ({
    data: path === "/api/c_course_users_record/GetListByAll"
      ? [{ ID: 1, BusRelationID: 11, IsFinished: 1, BusValue: 8 }, { ID: 2, BusRelationID: 0, IsFinished: 0 }, summary]
      : [],
  });
  const result = await adapter.mathExamApi.loadPaper(context);
  assert.deepEqual(result.paperlog, { ...summary, IsSubmit: 1, IsLookScore: 1 });
  assert.equal(result.paperlog.BusValue, 0);
  assert.equal(result.paperlog.ID, 44);
});
test("course completion writes total without an unlock and ability completion skips recommendation creation", async () => {
  const calls = [];
  globalThis.__mathExamPost = async (path, data) => {
    calls.push({ path, data });
    return { msg: "操作成功", data: 1 };
  };
  await adapter.mathExamApi.finish(
    {
      kind: "course",
      stuid: "s",
      PaperID: 1,
      CourseID: 2,
      CalendarID: 3,
      ProductID: 4,
      isAbility: false,
    },
    { BusType: 1, PaperType: 2 },
    {},
    50,
    100,
    false,
  );
  assert.equal(
    calls[0].path,
    "/api/c_course_users_record/Inner_c_course_users_record",
  );
  assert.equal(calls[0].data.IsFinished, 1);
  assert.equal(calls[0].data.BusValue, 50);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].data.IsSpecial, 1);
  calls.length = 0;
  await adapter.mathExamApi.finish(
    {
      kind: "course",
      stuid: "s",
      PaperID: 1,
      CourseID: 0,
      CalendarID: 0,
      ProductID: 0,
      isAbility: true,
    },
    { BusType: 1 },
    {},
    10,
    20,
    false,
  );
  assert.equal(calls.length, 1);
});
test("teacher course and weekly final submission keep proper grading and timing states", async () => {
  const calls = [];
  globalThis.__mathExamPost = async (path, data) => {
    calls.push({ path, data });
    return { msg: "操作成功", data: 1 };
  };
  await adapter.mathExamApi.finish(
    {
      kind: "course",
      isTeacher: true,
      stuid: "s",
      PaperID: 1,
      CourseID: 2,
      CalendarID: 3,
      ProductID: 4,
    },
    {},
    {},
    20,
    120,
    true,
    false,
  );
  assert.equal(calls[0].path, "/api/c_paper_student/Inner_c_paper_student");
  assert.equal(calls[0].data.StuState, 1);
  assert.equal(calls[0].data.TeacherState, 0);
  assert.equal(calls[0].data.Score, undefined);
  calls.length = 0;
  await adapter.mathExamApi.finish(
    { kind: "weekly", stuid: "s", PaperID: 1 },
    { ID: 99 },
    {},
    20,
    120,
    false,
  );
  assert.equal(calls[0].path, "/api/ks_user_paper/Inner_ks_user_paper");
  assert.equal(calls[0].data.ID, 99);
  assert.equal(calls[0].data.TotalScore, 20);
  assert.equal(calls[0].data.TotalTime, 120);
  assert.equal(calls[0].data.IsSubmit, 1);
});
test("dry-run grading mode respects actual UserRoot groups and self-grade deadline", async () => {
  assert.equal(adapter.dryTeacherMode({ IsMarkPaper: 1 }, 1), false);
  assert.equal(adapter.dryTeacherMode({ IsMarkPaper: 1 }, 2), true);
  assert.equal(adapter.dryTeacherMode({ IsMarkPaper: 1 }, 6), true);
  assert.equal(adapter.dryTeacherMode({ IsMarkPaper: 1 }, 7), false);
  assert.equal(adapter.dryTeacherMode({ IsMarkPaper: 0 }, 5), false);
  globalThis.__mathExamGet = async () => ({ data: [] });
  globalThis.__mathExamCommand = async () => ({
    data: [
      [{ IsMarkPaper: 1, IsUnifyTime: 1, SelfEndTime: "2026-10-29 15:00:00" }],
      [{ ExamEndTime: "2026-10-29 12:00:00" }],
      [{ UserRoot: 1 }],
    ],
  });
  const result = await adapter.mathExamApi.loadPaper({
    kind: "dry",
    stuid: "s",
    PaperID: 1,
    DryID: 2,
    RoomID: 3,
  });
  assert.equal(result.teacherMark, false);
  assert.equal(result.paperlog.UserRoot, 1);
  assert.equal(result.room.ExamEndTime, "2026-10-29 15:00:00");
});
test("partial dry-run submission records unanswered questions before final paper state", async () => {
  const calls = [];
  globalThis.__mathExamPost = async (path, data) => {
    calls.push({ path, data });
    return { msg: "操作成功", data: 1 };
  };
  await adapter.mathExamApi.finish(
    { kind: "dry", stuid: "s", PaperID: 1, DryID: 2, RoomID: 3 },
    {},
    { ID: 4 },
    10,
    200,
    false,
    false,
    [
      { ID: 5, Score: 10, _log: { ID: 6 } },
      { ID: 7, Score: 10 },
    ],
  );
  assert.equal(
    calls[0].path,
    "/api/sys_users_dryrun_questionlog/InnerAll_sys_users_dryrun_questionlog",
  );
  const missing = JSON.parse(calls[0].data.Content);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].QuestionID, 7);
  assert.equal(missing[0].QuestionScore, 0);
  assert.equal(missing[0].StuContent, "未提交");
  assert.equal(
    calls[1].path,
    "/api/sys_users_dryrun_paperlog/Inner_sys_users_dryrun_paperlog",
  );
  assert.equal(calls[1].data.IsSubmit, 1);
  assert.equal(calls[1].data.IsLookScore, 1);
});

test("weekly duration is minutes while paper Times is seconds", () => {
  assert.equal(adapter.examDurationSeconds({ kind: "weekly", stuid: "s", PaperID: 1 }, { ExamDuration: 90, Times: 120 }), 5400);
  assert.equal(adapter.examDurationSeconds({ kind: "course", stuid: "s", PaperID: 1 }, { Times: 5400 }), 5400);
});
test("forced weekly completion preserves saved score and submits despite missing question records", async () => {
  const calls = [];
  globalThis.__mathExamPost = async (path, data) => {
    calls.push({ path, data });
    return { msg: "操作成功", data: 1 };
  };
  await adapter.mathExamApi.finish(
    { kind: "weekly", stuid: "s", PaperID: 1 },
    { ID: 99 },
    {},
    8,
    5400,
    false,
    false,
    [
      { ...optionQuestion, ks_user_record: { ID: 3, Score: 8 } },
      { ID: 12, Score: 10 },
    ],
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].data.TotalScore, 8);
  assert.equal(calls[0].data.TotalTime, 5400);
  assert.equal(calls[0].data.IsSubmit, 1);
});

test("weekly batch deletion uses original personal-paper endpoint and selected paper IDs only", async () => {
  let call;
  globalThis.__mathExamPost = (...args) => {
    call = args;
    return Promise.resolve({ data: "操作成功" });
  };
  await adapter.mathExamApi.deleteWeekly("fixture-student", [12, "12", 34]);
  assert.deepEqual(call, [
    "/api/ks_user_paper/DelKsUserPaper",
    { PaperIDs: "12,34", StuID: "fixture-student" },
  ]);
  assert.throws(
    () => adapter.mathExamApi.deleteWeekly("fixture-student", []),
    /请选择/,
  );
  assert.throws(
    () => adapter.mathExamApi.deleteWeekly("fixture-student", ["bad", 0]),
    /请选择/,
  );
});

test("ability resume selects the actual persisted record family and keeps first attempts ordinary", () => {
  assert.equal(adapter.abilityTeacherRecords([], []), false);
  assert.equal(
    adapter.abilityTeacherRecords(
      [{ _c_course_users_record: { ID: 1 } }],
      [{ _c_paper_student_record: { ID: 0 } }],
    ),
    false,
  );
  assert.equal(
    adapter.abilityTeacherRecords(
      [],
      [{ _c_paper_student_record: { ID: 2, StuQuestionImg: "saved" } }],
    ),
    true,
  );
  assert.equal(
    adapter.abilityTeacherRecords(
      [{ _c_course_users_record: { ID: 1, AddTime: "2026-01-01 00:00:00" } }],
      [{ _c_paper_student_record: { ID: 2, AddTime: "2026-01-02 00:00:00" } }],
    ),
    true,
  );
});
test("ability probe only reads both original question record families without starting or writing a paper", async () => {
  const calls = [];
  globalThis.__mathExamGet = async (path, query) => {
    calls.push({ path, query });
    return {
      data: path.includes("StudentPaper")
        ? [{ QuestionID: 11, _c_paper_student_record: { ID: 9 } }]
        : [{ QuestionID: 11 }],
    };
  };
  globalThis.__mathExamPost = async () => {
    throw new Error("must not write during probe");
  };
  const result = await adapter.mathExamApi.abilityTeacherMode({
    kind: "course",
    stuid: "s",
    PaperID: 12,
    CourseID: 0,
    CalendarID: 0,
    ProductID: 0,
    isAbility: true,
  });
  assert.equal(result, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].query.PaperID, 12);
  assert.equal(calls[1].query.page, 0);
  assert.equal(calls[1].query.limit, 1000);
});

test("weekly creation rejects entitlement text returned inside a successful transport envelope", async () => {
  let call;
  globalThis.__mathExamPost = async (...args) => { call = args; return { code: 0, SuccessResponse: true, data: "权限次数不够，请充值" }; };
  await assert.rejects(adapter.mathExamApi.createWeekly({ ID: 4, name: "新练习" }), /权限次数不够/);
  assert.equal(call[0], "/api/ks_paper/RelPaper3");
  globalThis.__mathExamPost = async () => ({ code: 0, SuccessResponse: true, data: {} });
  await assert.rejects(adapter.mathExamApi.createWeekly({ ID: 4 }), /试卷暂时无法生成/);
  const created = { code: 0, SuccessResponse: true, data: { PaperID: 123 } };
  globalThis.__mathExamPost = async () => created;
  assert.equal(await adapter.mathExamApi.createWeekly({ ID: 4 }), created);
});

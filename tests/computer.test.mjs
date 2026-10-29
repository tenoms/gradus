import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../src/platforms/computer.ts", import.meta.url),
  "utf8",
);
const compiled = ts
  .transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace(
    /import \{ catalogResource, platformRequest, studyFetch \} from ['"]\.\.\/lib\/api['"];?/,
    "const catalogResource=(_key,load)=>load();const platformRequest=(...args)=>globalThis.__computerTestRequest(...args); const studyFetch=(...args)=>globalThis.__computerTestFetch(...args);",
  );
const adapter = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("cloud skip records restore independently of the empty answer list", () => {
  const response = { answerTotalNumber: 0, answerList: [], answers: [], skipExerciseIdList: ["skipped-one", "skipped-one", 2, null] };
  assert.deepEqual(adapter.restoreComputerAnswers(response), {});
  assert.deepEqual(adapter.computerSkippedIds(response), ["skipped-one", "2"]);
  assert.deepEqual(adapter.computerSkippedIds({ skipExerciseIdList: null }), []);
});

test("computer adapter preserves actual top-level arrays and unwraps code/data and old HTTP wrappers", async () => {
  const course = [{ id: "course", courseName: "fixture" }];
  globalThis.__computerTestRequest = async () => course;
  assert.deepEqual(
    await adapter.computerRequest("/api/exam/wx/course/courseList"),
    course,
  );
  globalThis.__computerTestRequest = async () => ({
    code: 200,
    data: { list: [{ id: "lesson" }], total: 1 },
  });
  assert.deepEqual(
    adapter.records(
      await adapter.computerRequest("/api/exam/wx/lesson/lessonList"),
    ),
    [{ id: "lesson" }],
  );
  globalThis.__computerTestRequest = async () => ({
    statusCode: 200,
    data: { code: 200, data: [{ id: "chapter" }] },
  });
  assert.deepEqual(
    await adapter.computerRequest("/api/exam/wx/practice/knowledge"),
    [{ id: "chapter" }],
  );
});
test("empty review records stay empty; invalid parameters, permissions and group errors remain visible", async () => {
  globalThis.__computerTestRequest = async () => ({
    code: 4114,
    data: { list: [], total: 0, pages: 0 },
  });
  assert.deepEqual(
    adapter.records(
      await adapter.computerRequest(
        "/api/exam/wx/personal/collectExerciseList",
      ),
    ),
    [],
  );
  globalThis.__computerTestRequest = async () => ({code:4127,msg:"PARAMETER INVALID",data:{list:[],total:0}});
  await assert.rejects(adapter.computerRequest("/api/exam/wx/personal/collectExerciseList"),/PARAMETER INVALID/);
  globalThis.__computerTestRequest = async () => ({
    code: 403,
    msg: "无权访问此课程",
  });
  await assert.rejects(
    adapter.computerRequest("/api/exam/wx/course/courseList"),
    /无权访问此课程/,
  );
  globalThis.__computerTestRequest = async () => ({
    code: 4010,
    msg: "SERVICE ERROR",
    data: "TooManyResultsException",
  });
  await assert.rejects(
    adapter.computerRequest("/api/exam/wx/practice/exerciseList"),
    /练习组/,
  );
});

test("the upstream's empty examination history remains an empty page without hiding missing-record errors elsewhere", async () => {
  const page = { list: [], total: 0, pages: 0 };
  globalThis.__computerTestRequest = async () => ({ code: 4104, message: "EXERCISE RECORD NOT_FOUND", data: page });
  assert.deepEqual(await adapter.computerRequest("/api/exam/wx/practice/examinationRecord"), page);
  await assert.rejects(adapter.computerRequest("/api/exam/wx/practice/examinationRecord/detail"), /EXERCISE RECORD NOT_FOUND/);
  globalThis.__computerTestRequest = async () => ({ code: 4104, message: "EXERCISE RECORD NOT_FOUND", data: null });
  await assert.rejects(adapter.computerRequest("/api/exam/wx/practice/examinationRecord"), /EXERCISE RECORD NOT_FOUND/);
});
test("request forwards query, body and method without changing the API contract", async () => {
  let seen;
  globalThis.__computerTestRequest = async (...args) => {
    seen = args;
    return { code: 200, data: "保存成功" };
  };
  const value = await adapter.computerRequest(
    "/api/exam/wx/practice/submitExam",
    { x: ["1", "2"] },
    "POST",
    { answers: [] },
  );
  assert.equal(value, "保存成功");
  assert.deepEqual(seen, [
    "computer",
    {
      path: "/api/exam/wx/practice/submitExam",
      method: "POST",
      query: { x: ["1", "2"] },
      data: { answers: [] },
    },
  ]);
});
test("actual exercise response normalization preserves options and merges scored subquestions", () => {
  assert.equal(adapter.extractExercises({exerciseId:'random-one',exerciseType:1,collected:false}).length,1);
  const q = {
    exerciseId: "q1",
    exerciseType: 1,
    exerciseStems: "<p>fixture</p>",
    questions: [{ questionStem: "A", questionAnswer: "first" }],
  };
  const normalized = adapter.extractExercises({
    exercises: [q],
    exerciseMap: {
      q1: { exerciseTotalScore: 5, questions: [{ questionScore: 5 }] },
    },
  });
  assert.equal(normalized[0].exerciseTotalScore, 5);
  assert.deepEqual(normalized[0].questions, q.questions);
  assert.deepEqual(normalized[0].questionList, [{ questionScore: 5 }]);
});
test("choice answer comparison handles multi-select order, empty input, and exact single choice", () => {
  assert.equal(adapter.objectiveAnswer(2, "C,A", "A,C"), true);
  assert.equal(adapter.objectiveAnswer(2, "A", "A,C"), false);
  assert.equal(adapter.objectiveAnswer(1, "B", "A"), false);
  const blank = adapter.buildComputerAnswer({
    question: { exerciseId: "blank", exerciseType: 1, exerciseAnswer: "" },
    majorId: "major",
    examType: 2,
    startedAt: 1,
    endedAt: 2,
  });
  assert.equal(blank.answerType, 2);
  assert.equal(blank.score, 0);
});
test("exam sources retain distinct original examType, answerSource, chapterId and subject derivation", () => {
  assert.deepEqual(adapter.computerExamConfig("school"), {
    examType: 1,
    answerSource: 1,
    chapterId: "2",
    deriveMajor: true,
  });
  assert.deepEqual(adapter.computerExamConfig("mooc"), {
    examType: 4,
    answerSource: 6,
    chapterId: "3",
    deriveMajor: false,
  });
  assert.deepEqual(adapter.computerExamConfig("self"), {
    examType: 7,
    answerSource: 2,
    chapterId: "6",
    deriveMajor: true,
  });
  assert.deepEqual(adapter.computerExamConfig("online"), {
    examType: 15,
    answerSource: 2,
    chapterId: "7",
    deriveMajor: true,
  });
  const result = adapter.buildComputerAnswer({
    question: {
      exerciseId: "q",
      exerciseType: 1,
      exerciseAnswer: "A",
      exerciseTotalScore: 5,
      exerciseProperty: { knowledgeTags: ["actual-major,chapter,point"] },
    },
    answer: "A",
    majorId: "fallback",
    ...adapter.computerExamConfig("school"),
    startedAt: 100,
    endedAt: 200,
  });
  assert.equal(result.majorId, "actual-major");
  assert.equal(result.answerSource, 1);
  assert.equal(result.score, 5);
  assert.equal(result.answerType, 1);
});
test("AI subjective submissions send structured llmAnswer, empty answer and computed achievement level", () => {
  const result = adapter.buildComputerAnswer({
    question: { exerciseId: "essay", exerciseType: 4, exerciseTotalScore: 10 },
    answer: "https://fixture.invalid/answer.png",
    majorId: "major",
    examType: 3,
    startedAt: 100,
    endedAt: 200,
    aiResult: {
      finalScore: 8,
      answerType: 1,
      llmAnswer: [{ score: 8, scoreReason: "fixture" }],
    },
  });
  assert.equal(result.answer, "");
  assert.equal(result.answerLevel, 1);
  assert.equal(result.markStatus, 4);
  assert.equal(result.score, 8);
  assert.deepEqual(JSON.parse(result.llmAnswer), [
    { score: 8, scoreReason: "fixture" },
  ]);
});
test("complete paper payload retains answered, blank and skipped entries and aggregate report values", () => {
  const answers = [
    { exerciseId: "right", answer: "A", answerType: 1, score: 5 },
    { exerciseId: "blank", answer: "", answerType: 2, score: 0 },
    { exerciseId: "skip", answer: "", answerType: 4, score: 0 },
  ];
  const result = adapter.buildComputerSubmission({
    answers,
    examinationId: "paper",
    examType: 4,
    startedAt: 1000,
    endedAt: 62000,
    complete: true,
  });
  assert.equal(result.answers.length, 3);
  assert.equal(result.submitStatus, 1);
  assert.equal(result.examCategory, 1);
  assert.equal(result.score, 5);
  assert.equal(result.correctNumber, 1);
  assert.equal(result.inCorrectNumber, 1);
  assert.equal(result.time, "01:01");
  assert.equal(
    adapter.buildComputerSubmission({
      answers,
      examinationId: "paper",
      examType: 3,
      startedAt: 1,
      endedAt: 2,
    }).submitStatus,
    2,
  );
});
test("sequential skip uses the original skip flags and source without fabricating an answer", () => {
  const answer = adapter.buildComputerAnswer({
    question: {
      exerciseId: "skip",
      exerciseType: 1,
      exerciseAnswer: "A",
      exerciseTotalScore: 5,
    },
    answer: "B",
    majorId: "m",
    examType: 3,
    startedAt: 1,
    endedAt: 2,
    skip: true,
  });
  assert.equal(answer.answer, "");
  assert.equal(answer.answerSource, 15);
  assert.equal(answer.answerType, 1);
  assert.equal(answer.score, 5);
  const payload = adapter.buildComputerSubmission({
    answers: [answer],
    examinationId: "p",
    examType: 3,
    startedAt: 1,
    endedAt: 2,
    skip: true,
  });
  assert.equal(payload.skipFlag, true);
  assert.equal(payload.skip, true);
  assert.equal(payload.submitStatus, 2);
});
test("upstream answer resume and cloze subquestion grouping follow actual source structures", () => {
  assert.deepEqual(
    adapter.restoreComputerAnswers({
      answerList: [{ exerciseId: "one", answer: "A" }],
      answers: [{ exerciseId: "two", answer: "B" }],
    }),
    { one: "A", two: "B" },
  );
  const groups = adapter.computerClozeGroups({
    questions: [
      { questionOrder: 1, questionStem: "A" },
      { questionOrder: 2, questionStem: "B" },
      { questionOrder: 1, questionStem: "A" },
      { questionOrder: 2, questionStem: "B" },
    ],
  });
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => g.map((o) => o.questionStem)),
    [
      ["A", "B"],
      ["A", "B"],
    ],
  );
});

test("question source metadata renders readable text for both real object and legacy string formats", () => {
  assert.equal(
    adapter.exerciseSource({
      isOfficialExercise: true,
      fromSchool: "示例大学",
      examTime: "2025",
      examFullName: "计算机真题",
      pageNumber: 12,
    }),
    "示例大学 · 2025 · 计算机真题 · 第 12 页",
  );
  assert.equal(adapter.exerciseSource("教材习题"), "教材习题");
  assert.equal(adapter.exerciseSource(null), "");
});


test("computer uploads use the scoped transport while retaining multipart form data", async () => {
  let seen;
  globalThis.__computerTestFetch = async (...args) => {
    seen = args;
    return { ok: true, json: async () => ({ code: 200, data: { url: "https://fixture.invalid/upload.png" } }) };
  };
  const file = new File(["fixture"], "answer.png", { type: "image/png" });
  assert.deepEqual(await adapter.computerUpload(file), { url: "https://fixture.invalid/upload.png" });
  assert.equal(seen[0], "/api/platform/computer/upload?path=%2Fapi%2Fuser%2Fv1%2Fattachment%2Fupload%2F");
  assert.equal(seen[1].method, "POST");
  assert.equal(seen[1].credentials, "same-origin");
  assert.equal(seen[1].body.get("file").name, "answer.png");
  assert.equal(seen[1].headers, undefined);
});

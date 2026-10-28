import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const rows = (d) =>
  Array.isArray(d) ? d : Array.isArray(d?.list) ? d.list : [];
globalThis.__computerLearningFixture = {
  computerRequest: (...args) => globalThis.__computerLearningRequest(...args),
  computerSubjects: [{ id: "m", name: "科目", examCategory: 1 }],
  extractExercises: (d) => rows(d.exercises || d),
  objectiveAnswer: (type, answer, expected) =>
    !!answer &&
    (type === 2
      ? answer.split(",").sort().join(",") ===
        String(expected).split(",").sort().join(",")
      : answer === String(expected)),
  records: rows,
};
const source = await readFile(
  new URL("../src/components/computer/computer-learning.ts", import.meta.url),
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
    /import \{([^}]+)\} from ['"]\.\.\/\.\.\/platforms\/computer['"];?/,
    (_, names) => `const {${names}}=globalThis.__computerLearningFixture;`,
  );
const adapter = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);
test("custom subjects preserve independent graduate/final categories and original major IDs", () => {
  assert.deepEqual(
    adapter.normalizeComputerSubjects([
      { majorId: "one", majorName: "学习科目", examCategory: 2 },
    ]),
    [
      {
        majorId: "one",
        majorName: "学习科目",
        id: "one",
        name: "学习科目",
        examCategory: 2,
      },
    ],
  );
  assert.notEqual(
    adapter.computerSubjectKey({ id: "one", examCategory: 1 }),
    adapter.computerSubjectKey({ id: "one", examCategory: 2 }),
  );
  assert.equal(adapter.computerPracticeType(2), 10);
  assert.equal(adapter.computerPracticeType(2, true), 9);
});
test("review redo uses direct single-answer contract and distinct collection/mistake answer sources", async () => {
  const calls = [];
  globalThis.__computerLearningRequest = async (...args) => {
    calls.push(args);
    return true;
  };
  const question = {
      exerciseId: "q",
      exerciseType: 2,
      exerciseAnswer: "A,C",
      majorId: "m",
      chapterId: "c",
    },
    answer = adapter.buildComputerRedo(question, "C,A", 5, 2, 100, 200);
  assert.equal(answer.score, 2);
  assert.equal(answer.answerType, 1);
  assert.equal(answer.answerSource, 5);
  assert.equal(answer.examCategory, 2);
  assert.equal(answer.startTime, 100);
  await adapter.computerLearningApi.redo(answer);
  assert.deepEqual(calls[0], [
    "/api/exam/wx/personal/exerciseRedo",
    {},
    "POST",
    answer,
  ]);
  assert.equal(calls[0][3].answers, undefined);
  assert.equal(
    adapter.buildComputerRedo(
      { ...question, exerciseType: 3 },
      "typed",
      4,
      1,
      1,
      2,
    ).answerType,
    3,
  );
});
test("review pagination keeps full total while loading only one real question per page", () => {
  const normalized = adapter.computerReviewData({
    list: [{ exerciseId: "q" }],
    total: 28,
    pages: 28,
  });
  assert.equal(normalized.exercises.length, 1);
  assert.equal(normalized.exerciseTotalNumber, 28);
  assert.equal(normalized.pages, 28);
  assert.deepEqual(adapter.computerReviewData(null).exercises, []);
});
test("report joins exact exercise map and separates pending AI score from final result", () => {
  const result = adapter.normalizeComputerReport({
    examRecord: { id: "r", aiScoreStatus: 0 },
    answerList: [
      {
        exerciseId: "a",
        answerType: 1,
        markStatus: 4,
        score: 7,
        llmAnswer: "[]",
      },
      { exerciseId: "b", answerType: 2, score: 0 },
    ],
    exerciseMap: {
      a: { exerciseId: "a", exerciseType: 4 },
      b: { exerciseId: "b" },
    },
  });
  assert.equal(result.pending, true);
  assert.equal(result.score, null);
  assert.equal(result.correct, 1);
  assert.equal(result.incorrect, 1);
  assert.equal(result.answers[0].exercise.exerciseType, 4);
  const launch = adapter.reportLaunch(
    {
      examRecord: { examType: 18 },
      answerList: [
        { exerciseId: "q", answerType: 2, exercise: { exerciseId: "q" } },
      ],
    },
    "m",
    true,
  );
  assert.equal(launch.readOnly, true);
  assert.equal(launch.voice, true);
  assert.equal(launch.data.exercises.length, 1);
});
test("specialized practice and stage requests use verified source routes and parameters", async () => {
  const calls = [];
  globalThis.__computerLearningRequest = async (...args) => {
    calls.push(args);
    return [];
  };
  await adapter.computerLearningApi.specialList("short", "m");
  await adapter.computerLearningApi.specialList("interview-general", "m");
  await adapter.computerLearningApi.specialList("interview-subject", "m");
  await adapter.computerLearningApi.stages(22);
  assert.deepEqual(calls[0], [
    "/api/exam/wx/practice/majorId/examination/list",
    { majorId: "m", examExerciseType: 4, examType: 3 },
  ]);
  assert.equal(calls[1][1].examType, 18);
  assert.equal(calls[2][1].examType, 19);
  assert.equal(calls[3][0], "/api/exam/wx/practice/basic/progress/stat");
  assert.equal(calls[3][1].examType, 22);
});
test("subject mutations, feedback and date counters preserve the actual original payload", async () => {
  const calls = [];
  globalThis.__computerLearningRequest = async (...args) => {
    calls.push(args);
    return true;
  };
  await adapter.computerLearningApi.updateSubject({
    id: "m",
    name: "科目",
    examCategory: 2,
  });
  await adapter.computerLearningApi.updateSubject(
    { id: "m", name: "科目", examCategory: 2 },
    true,
  );
  await adapter.computerLearningApi.dates("m", 2, 2);
  await adapter.computerLearningApi.feedback({
    exerciseId: "q",
    source: "KNOWLEDGE_TAG",
    errorType: "1,3",
    errorDetail: "fixture",
    pictureAdd: "",
  });
  assert.deepEqual(calls[0], [
    "/api/exam/wx/personal/addMajorCustom",
    {},
    "POST",
    { majorId: "m", majorName: "科目", examCategory: 2 },
  ]);
  assert.equal(calls[1][0], "/api/exam/wx/personal/deleteMajor");
  assert.deepEqual(calls[2][1], { majorId: "m", examCategory: 2, itemFlag: 2 });
  assert.equal(calls[3][2], "POST");
  assert.equal(calls[3][3].errorType, "1,3");
});
test("related practice uses real chapter lookup, excludes the current question and never fabricates a related API", async () => {
  const calls = [];
  globalThis.__computerLearningRequest = async (...args) => {
    calls.push(args);
    return {
      exercises: [{ exerciseId: "q" }, { exerciseId: "r" }],
      answers: [{ exerciseId: "r", answer: "A" }],
    };
  };
  const result = await adapter.computerLearningApi.related(
    {
      exerciseId: "q",
      exerciseProperty: {
        knowledgeTags: ["actual-major,actual-chapter,point"],
      },
    },
    "fallback",
    "",
    2,
  );
  assert.equal(calls[0][0], "/api/exam/wx/practice/exerciseList");
  assert.equal(calls[0][1].majorId, "actual-major");
  assert.equal(calls[0][1].chapterId, "actual-chapter");
  assert.equal(calls[0][1].examType, 9);
  assert.deepEqual(result.exercises, [{ exerciseId: "r" }]);
  assert.deepEqual(result.answers, []);
  await assert.rejects(
    adapter.computerLearningApi.related({ exerciseId: "q" }, "m", "2"),
    /章节信息/,
  );
});

test("chapter group learning initializes the original cache then sends examGroupId to sequential loading", async () => {
  const calls = [];
  globalThis.__computerLearningRequest = async (...args) => {
    calls.push(args);
    return { exercises: [{ exerciseId: "q" }], exerciseTotalNumber: 96 };
  };
  await adapter.computerLearningApi.groups("chapter");
  await adapter.computerLearningApi.groupExercise(
    { id: "major", examCategory: 1 },
    "chapter",
    "group",
  );
  assert.deepEqual(calls[0], [
    "/api/exam/wx/practice/examination/group/list",
    { chapterId: "chapter", examExerciseType: 1 },
  ]);
  assert.deepEqual(calls[1], [
    "/api/exam/wx/practice/cache/examination/group",
    { groupId: "group" },
    "POST",
  ]);
  assert.deepEqual(calls[2], [
    "/api/exam/wx/practice/exerciseList",
    {
      majorId: "major",
      chapterId: "chapter",
      examGroupId: "group",
      examExerciseType: 1,
      examType: 3,
      examCategory: 1,
      number: 1,
    },
  ]);
});
test("record reset stays within explicitly selected upstream records and voice answers preserve URL-duration protocol", async () => {
  const calls = [];
  globalThis.__computerLearningRequest = async (...args) => {
    calls.push(args);
    return args[0].endsWith("/stat") ? { identifier: "fixture" } : true;
  };
  await assert.rejects(adapter.computerLearningApi.resetRecords([]), /请选择/);
  assert.equal(calls.length, 0);
  await adapter.computerLearningApi.resetRecords(["one", "two"]);
  assert.deepEqual(calls[1], [
    "/api/exam/wx/practice/examination/exercise/reset",
    {},
    "POST",
    { examRecordIdList: ["one", "two"], identifier: "fixture" },
  ]);
  assert.equal(
    adapter.computerVoiceAnswer("https://fixture.invalid/answer.webm", 31.6),
    "https://fixture.invalid/answer.webm$-$32",
  );
  assert.equal(
    adapter.computerVoiceAnswer("https://fixture.invalid/answer.webm", 0),
    "https://fixture.invalid/answer.webm$-$1",
  );
});

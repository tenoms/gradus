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
test("submission success reads the actual matching cloud report when the write only returned true", async () => {
  const seen = [];
  const report = { examRecord: { id: "new-record", examinationId: "new-paper", score: 8 }, answerList: [] };
  globalThis.__computerLearningRequest = async (path, query) => {
    seen.push({ path, query });
    if (path.endsWith("/examinationRecord")) return { list: [{ id: "unrelated", examinationId: "other-paper" }, { id: "new-record", examinationId: "new-paper" }] };
    assert.equal(query.examRecordId, "new-record");
    return report;
  };
  assert.equal(await adapter.computerLearningApi.submittedReport({ examinationId: "new-paper", majorId: "major", examType: 4 }), report);
  assert.deepEqual(seen.map(call => call.path), ["/api/exam/wx/practice/examinationRecord", "/api/exam/wx/practice/examinationRecord/detail"]);
  assert.equal(seen[0].query.examType, 4);
});
test("report reads never re-submit answers and preserve failures instead of fabricating report data", async () => {
  const seen = [];
  globalThis.__computerLearningRequest = async (path) => { seen.push(path); return { list: [{ id: "unrelated", examinationId: "other-paper" }] }; };
  await assert.rejects(adapter.computerLearningApi.submittedReport({ examinationId: "new-paper", majorId: "major", examType: 4 }), /尚未返回/);
  assert.deepEqual(seen, ["/api/exam/wx/practice/examinationRecord"]);
  globalThis.__computerLearningRequest = async (path) => { assert.equal(path, "/api/exam/wx/practice/examinationRecord/detail"); throw new Error("platform unavailable"); };
  await assert.rejects(adapter.computerLearningApi.submittedReport({ recordId: "known", examinationId: "new-paper", majorId: "major", examType: 4 }), /platform unavailable/);
});
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
test('feedback origin retains the distinct original source enum for every exercise family',()=>{
  const base={data:{},title:'test',majorId:'m',examType:2};
  for(const[source,expected]of Object.entries({school:'COLLEGE_EXAM',mooc:'ENHANCE_PASS',self:'BASE_PASS',online:'MODAL_EXAM',hot:'MISTAKE_REPORT',photo:'PHOTO_SEARCH',scan:'SCAN_CODE'}))assert.equal(adapter.computerFeedbackSource({...base,source}),expected);
  assert.equal(adapter.computerFeedbackSource(base),'KNOWLEDGE_TAG');
  assert.equal(adapter.computerFeedbackSource({...base,voice:true}),'TEACHER_RECRUITMENT');
  assert.equal(adapter.computerFeedbackSource({...base,random:true}),'HOLE_PASS');
  assert.equal(adapter.computerFeedbackSource({...base,readOnly:true}),'ANSWER_PARSE');
  assert.equal(adapter.computerFeedbackSource({...base,examType:22}),'COLLEGE_MODAL_EXAM');
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
test("partial interview reports preserve null unanswered slots without inventing skipped answers", () => {
  const skipOnly = adapter.normalizeComputerReport({ examRecord: { examType: 18 }, answerList: [null, null], exerciseMap: {} });
  assert.equal(skipOnly.unanswered, 2);
  assert.equal(skipOnly.correct, 0);
  assert.equal(skipOnly.score, 0);
  assert.deepEqual(skipOnly.answers, []);
  const voice = adapter.normalizeComputerReport({ examRecord: { examType: 19 }, answerList: [null, { exerciseId: "voice", answer: "https://fixture.invalid/answer.mp3$-$500", answerType: 3, markStatus: 1, score: 0 }], exerciseMap: { voice: { exerciseId: "voice", exerciseType: 4 } } });
  assert.equal(voice.unanswered, 1);
  assert.equal(voice.selfCheck, 1);
  assert.equal(voice.correct, 0);
  assert.equal(voice.answers[0].answer.endsWith("$-$500"), true);
  const launch = adapter.reportLaunch({ examRecord: { examType: 19 }, answerList: [null, voice.answers[0]] }, "major");
  assert.equal(launch.readOnly, true);
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
  calls.length=0;
  globalThis.__computerLearningRequest=async(...args)=>{calls.push(args);return args[0].endsWith('/stat')?{identifier:null}:args[0].endsWith('/detail')?{examRecord:{identifier:'record-owner'}}:null;};
  await adapter.computerLearningApi.resetRecords(['new-own-record']);
  assert.equal(calls[1][0],'/api/exam/wx/practice/examinationRecord/detail');
  assert.deepEqual(calls[2][3],{examRecordIdList:['new-own-record'],identifier:'record-owner'});
  assert.equal(
    adapter.computerVoiceAnswer("https://fixture.invalid/answer.webm", 31.6),
    "https://fixture.invalid/answer.webm$-$31600",
  );
  assert.equal(
    adapter.computerVoiceAnswer("https://fixture.invalid/answer.mp3", 0.5),
    "https://fixture.invalid/answer.mp3$-$500",
  );
  assert.equal(
    adapter.computerVoiceAnswer("https://fixture.invalid/answer.webm", 0),
    "https://fixture.invalid/answer.webm$-$1",
  );
});
test('mistake mutations reject an unconfirmed false result and cloud continuation uses the original one-based index',async()=>{
  const calls=[];
  globalThis.__computerLearningRequest=async(...args)=>{calls.push(args);return false;};
  await assert.rejects(adapter.computerLearningApi.markMistake({exerciseId:'new-q'},'m','chapter',1,true),/未完成错题移除/);
  assert.equal(calls[0][1].flag,2);
  globalThis.__computerLearningRequest=async(...args)=>{calls.push(args);return true;};
  await adapter.computerLearningApi.markMistake({exerciseId:'new-q'},'m','chapter',1);
  assert.equal(calls[1][1].flag,1);
  await adapter.computerLearningApi.saveSheetIndex('own-record',2);
  assert.deepEqual(calls[2],['/api/exam/wx/practice/submit/sheet/index',{},'POST',{examRecordId:'own-record',sheetIndex:2}]);
});

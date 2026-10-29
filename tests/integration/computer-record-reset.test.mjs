import test from "node:test";
import assert from "node:assert/strict";
import { startHttpApp, testLearner } from "../support/http-app.mjs";

function sourceFixture() {
  const calls = [];
  return {
    calls,
    yybRequest: async () => [{ id: "source", nickname: "练习题库", status: "alive" }],
    loginPlatform: async () => ({ connected: true, token: "fixture-token", user: { userId: "source-reader" } }),
    computerRequest: async (path, input) => {
      calls.push({ path, input });
      if (path.endsWith("/cache/examination/group")) return { code: 200, data: true };
      if (path.endsWith("/group/list")) return { code: 200, data: { groupList: ["one", "two"].map(id => ({ id, groupName: id, totalNumber: 3 })) } };
      assert.ok(path.endsWith("/exerciseList"), "reset writes must stay local");
      const group = input.query.examGroupId;
      return { code: 200, data: { examId: `paper-${group}`, exerciseTotalNumber: 3, examExerciseIdList: [1, 2, 3].map(n => `${group}-q${n}`), exercises: [{ exerciseId: `${group}-q1`, exerciseType: 1, exerciseStems: "题干", exerciseAnswer: "A" }] } };
    },
  };
}
const exercise = group => ({ path: "/api/exam/wx/practice/exerciseList", query: { majorId: "major", chapterId: "chapter", examGroupId: group, examType: 3, examCategory: 1, number: 1 } });
const groups = { path: "/api/exam/wx/practice/examination/group/list", query: { chapterId: "chapter", examExerciseType: 1 } };
async function call(app, auth, input, expected = 200) {
  const response = await app.request("/api/learning/platform/computer", { auth, body: input });
  const value = await response.json(); assert.equal(response.status, expected, JSON.stringify(value)); return value.data;
}
const reset = (app, auth, ids) => call(app, auth, { path: "/api/exam/wx/practice/examination/exercise/reset", method: "POST", data: { examRecordIdList: ids, identifier: auth.userId } });
const detail = (app, auth, id, status = 200) => call(app, auth, { path: "/api/exam/wx/practice/examinationRecord/detail", query: { examRecordId: id } }, status);
async function users(app) {
  const admin = await app.setup();
  for (const username of ["reset.first", "reset.second"]) await app.createUser(admin, testLearner(username, ""));
  assert.equal((await app.request("/api/admin/resource-sync", { auth: admin, method: "PUT", body: { enabled: true, revision: 0 } })).status, 200);
  return { first: await app.login("learning", "reset.first", "learner-password-123"), second: await app.login("learning", "reset.second", "learner-password-123") };
}
const answer = (app, auth, paper, group, answerType) => call(app, auth, { path: "/api/exam/wx/practice/submitExam", method: "POST", data: { examinationId: paper.examId, majorId: "major", chapterId: "chapter", examGroupId: group, examType: 3, answers: [{ exerciseId: `${group}-q1`, answer: answerType === 1 ? "A" : "B", answerType, score: answerType === 1 ? 1 : 0 }] } });

test("reset removes only the learner's selected answers and continuation, preserving other groups, notes and study time", async () => {
  const source = sourceFixture(), app = await startHttpApp(source);
  try {
    const { first, second } = await users(app);
    const one = await call(app, first, exercise("one")), two = await call(app, first, exercise("two")), otherUser = await call(app, second, exercise("one"));
    await answer(app, first, one, "one", 2); await answer(app, first, two, "two", 1); await answer(app, second, otherUser, "one", 1);
    await call(app, first, { path: "/api/exam/wx/practice/submit/sheet/index", method: "POST", data: { examRecordId: one.examRecordId, sheetIndex: 3 } });
    await call(app, first, { path: "/api/exam/wx/personal/collectExercise", method: "POST", data: { exerciseId: "one-q1", majorId: "major", collectFlag: 0 } });
    await call(app, first, { path: "/api/exam/wx/personal/addExerciseNote", method: "POST", data: { exerciseId: "one-q1", majorId: "major", exerciseNote: "保留笔记" } });
    const study = { tasks: [], activities: [{ id: "reading", at: new Date().toISOString(), platform: "computer", type: "study-time", title: "练习阅读", durationSeconds: 120 }], goalMinutes: 60 };
    assert.equal((await app.request("/api/learning/study/data", { auth: first, method: "PUT", body: { data: study, revision: 0 } })).status, 200);
    const before = await call(app, first, groups);
    assert.equal(before.groupList.find(group => group.id === "one").incorrectNumber, 1);
    const sourceReads = source.calls.length;
    await reset(app, first, [one.examRecordId, otherUser.examRecordId]);
    await detail(app, first, one.examRecordId, 404);
    assert.equal((await detail(app, first, two.examRecordId)).answerList.length, 1);
    assert.equal((await detail(app, second, otherUser.examRecordId)).answerList.length, 1);
    const refreshed = await call(app, first, groups), cleared = refreshed.groupList.find(group => group.id === "one");
    assert.equal(cleared.correctNumber, 0); assert.equal(cleared.incorrectNumber, 0); assert.equal(cleared.examRecordId, undefined);
    const reopened = await call(app, first, exercise("one"));
    assert.notEqual(reopened.examRecordId, one.examRecordId); assert.equal(reopened.sheetIndex, 1); assert.deepEqual(reopened.answers, []);
    const notes = await call(app, first, { path: "/api/exam/wx/personal/collectExerciseList", query: {} });
    assert.equal(notes.list.find(row => row.exerciseId === "one-q1").exerciseNote, "保留笔记");
    const mistakes = await call(app, first, { path: "/api/exam/wx/personal/incorrectExerciseList", query: {} });
    assert.ok(mistakes.list.some(row => row.exerciseId === "one-q1"));
    const saved = await (await app.request("/api/learning/study/data", { auth: first })).json();
    assert.deepEqual(saved.data, study);
    assert.equal(source.calls.length, sourceReads, "reset and refreshed progress do not write or reread the source");
  } finally { await app.close(); }
});

test("reset also removes imported answers before hiding the exam needed to resolve their ownership IDs", async () => {
  const app = await startHttpApp();
  try {
    const { first } = await users(app), db = app.app.locals.database;
    async function imported(collection, sourceKey, scope, data) {
      return (await db.query(`INSERT INTO ${db.web("personal_import_records")}(user_id,openid,platform,source_domain,collection,source_key,scope,scopes,data,source_hash) VALUES($1,'fixture-openid','computer','fixture-domain',$2,$3,$4,$5::jsonb,$6::jsonb,'fixture-hash') RETURNING id`, [first.userId, collection, sourceKey, scope, JSON.stringify([scope]), JSON.stringify(data)])).rows[0].id;
    }
    const examId = await imported("exams", "source-exam", "reports", { id: "source-exam", examinationId: "imported-paper", examGroupId: "one" });
    await imported("answers", "source-answer", "answers", { id: "source-answer", examRecordId: "source-exam", exerciseId: "imported-q", answer: "A", answerType: 1 });
    const projectedId = `import:${examId}`;
    assert.equal((await detail(app, first, projectedId)).answerList.length, 1);
    await reset(app, first, [projectedId]);
    await detail(app, first, projectedId, 404);
    const answers = await call(app, first, { path: "/api/exam/wx/practice/answerRecord", query: {} });
    assert.deepEqual(answers, []);
  } finally { await app.close(); }
});

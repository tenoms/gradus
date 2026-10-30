import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { startHttpApp, testLearner } from "../support/http-app.mjs";

const source = await readFile(new URL("../../src/features/computer/practice/computer-learning.ts", import.meta.url), "utf8");
const executable = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  .replace(/import\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?/g, "").replace(/^export /gm, "");
const createAdapter = new Function("computerRequest", "computerSubjects", "records", `${executable}\nreturn computerLearningApi;`);
async function call(app, auth, input) {
  const response = await app.request("/api/learning/platform/computer", { auth, body: input });
  const value = await response.json();
  assert.equal(response.status, 200, JSON.stringify(value));
  return value.data;
}
const adapter = (app, auth) => createAdapter(
  (path, query = {}, method = "GET", data) => call(app, auth, { path, query, method, data }),
  [], value => Array.isArray(value) ? value : value?.list || [],
);

test("408 mistake toggles and automatic wrong answers persist independently of favorites and other learners", async () => {
  const sourceCalls = [];
  const questions = [1, 2].map(index => ({ exerciseId: `q${index}`, exerciseType: 1, exerciseStems: `题目 ${index}`, exerciseAnswer: "A", majorId: "major", chapterId: "chapter" }));
  const app = await startHttpApp({
    yybRequest: async () => [{ id: "7", status: "alive" }],
    loginPlatform: async () => ({ connected: true, token: "fixture-token", user: { userId: "source-reader" } }),
    computerRequest: async (path, input) => {
      sourceCalls.push(path);
      assert.ok(path.endsWith("/exerciseList"), "all personal state changes must remain local");
      return { code: 200, data: { examId: "paper", exerciseTotalNumber: 2, examExerciseIdList: ["q1", "q2"], exercises: [questions[Number(input.query.number || 1) - 1]] } };
    },
  });
  try {
    const admin = await app.setup();
    for (const username of ["mistake.first", "mistake.second"]) await app.createUser(admin, testLearner(username, "7"));
    assert.equal((await app.request("/api/admin/resource-sync", { auth: admin, method: "PUT", body: { enabled: true, revision: 0 } })).status, 200);
    const first = await app.login("learning", "mistake.first", "learner-password-123");
    const second = await app.login("learning", "mistake.second", "learner-password-123");
    const input = { path: "/api/exam/wx/practice/exerciseList", query: { majorId: "major", chapterId: "chapter", examType: 3, examCategory: 1, number: 1 } };
    const paper = await call(app, first, input);
    const learning = adapter(app, first);
    const before = sourceCalls.length;
    assert.deepEqual(await learning.mistakeIds("major", 1), []);
    await learning.markMistake(questions[0], "major", "chapter", 1);
    assert.deepEqual(await learning.mistakeIds("major", 1), ["q1"]);
    assert.deepEqual(await learning.collectionIds("major", 1), []);
    await learning.collect(questions[0], "major", "chapter", 1);
    await learning.markMistake(questions[0], "major", "chapter", 1, true);
    assert.deepEqual(await learning.mistakeIds("major", 1), []);
    assert.deepEqual(await learning.collectionIds("major", 1), ["q1"]);

    await call(app, first, { path: "/api/exam/wx/practice/submitExam", method: "POST", data: {
      examinationId: paper.examId, majorId: "major", chapterId: "chapter", examType: 3, examCategory: 1,
      answers: [{ exerciseId: "q1", majorId: "major", chapterId: "chapter", answer: "B", answerType: 2, score: 0 }],
    } });
    assert.deepEqual(await learning.mistakeIds("major", 1), ["q1"], "incorrect submission automatically adds the real question");
    assert.deepEqual(await learning.collectionIds("major", 1), ["q1"]);
    await call(app, first, input);
    const reopened = adapter(app, first);
    assert.deepEqual(await reopened.mistakeIds("major", 1), ["q1"]);
    const another = adapter(app, second);
    assert.deepEqual(await another.mistakeIds("major", 1), []);
    assert.deepEqual(await another.collectionIds("major", 1), []);
    await reopened.markMistake(questions[0], "major", "chapter", 1, true);
    assert.deepEqual(await adapter(app, first).mistakeIds("major", 1), []);
    assert.deepEqual(await learning.collectionIds("major", 1), ["q1"]);
    assert.equal(sourceCalls.length, before, "membership reads, toggles, submissions and reopening reuse saved local resources");
  } finally {
    await app.close();
  }
});

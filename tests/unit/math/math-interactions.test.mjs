import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

async function interaction(file, apiName, titleText, dependencies) {
  const source = await readFile(new URL(`../../../src/features/math/${file}`, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let owner;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === apiName && node.arguments[0]?.getText(ast).includes(titleText)) {
      owner = node.parent;
      while (owner && !ts.isFunctionLike(owner)) owner = owner.parent;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(owner, 'expected business interaction exists');
  const executable = ts.transpileModule(`const action = ${owner.getText(ast)}; action;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return runInNewContext(executable, dependencies);
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('chapter reset waits for confirmation and keeps the selected chapter and payload after acceptance', async () => {
  let resolve, accepted = false;
  const calls = [], choice = new Promise(done => { resolve = done; });
  const dependencies = {
    rows: [{ID: 7, Name: '函数与极限'}], resetCatalog: '7', mathTitle: row => row.Name,
    stuid: 'web-student', mode: 2, type: 3, subject: 1,
    confirmAction: async options => { calls.push(['confirm', options]); return accepted ? true : choice; },
    setCreating: value => calls.push(['creating', value]), setError: value => calls.push(['error', value]), msg: error => error.message,
    mathPost: async (path, body) => calls.push(['post', path, JSON.parse(JSON.stringify(body))]),
    start: async id => calls.push(['start', id]), catalogs: {reload: () => calls.push(['catalog'])}, history: {reload: () => calls.push(['history'])},
  };
  const action = await interaction('MathWorkspace.tsx', 'confirmAction', '清除并重新练习', dependencies);
  const pending = action();
  assert.equal(calls.length, 1, 'no business writes or loading state before a decision');
  resolve(false); await pending;
  assert.equal(calls.filter(call => call[0] === 'post').length, 0);
  accepted = true; await action();
  assert.deepEqual(calls.find(call => call[0] === 'post'), ['post', '/api/choice_question_exercise_log/DelChoiceQuestionByStuID', {ExanType: 2, Type: 3, BusType: 1, CatalogID: 7, StuID: 'web-student'}]);
  assert.deepEqual(calls.filter(call => call[0] === 'start'), [['start', 7]]);
  assert.equal(calls.at(-1)[0], 'creating'); assert.equal(calls.at(-1)[1], false);
});

test('adding recommended questions preserves the cancellation boundary and original topic request', async () => {
  let accepted = false;
  const writes = [], state = [];
  const action = await interaction('courses/MathCourseRecommendations.tsx', 'confirmAction', '追加题目', {
    confirmAction: async () => accepted, context: {BookID: 8}, meta: {ID: 12}, completionSaved: {current: true},
    recommendationApi: {append: async (...args) => writes.push(JSON.parse(JSON.stringify(args)))},
    setBusy: value => state.push(['busy', value]), setError: () => {}, setShowTopics: () => {}, setSelectedTopic: () => {}, setNotice: () => {}, setView: () => {}, setVersion: () => {},
  });
  await action(19); assert.equal(writes.length, 0); assert.equal(state.length, 0);
  accepted = true; await action(19);
  assert.deepEqual(writes, [[{BookID: 8}, {ID: 12}, 19]]);
  assert.deepEqual(state, [['busy', true], ['busy', false]]);
});

test('exam renaming ignores cancelled or blank input, trims a saved name and reports server failures in the app', async () => {
  let value = null, fail = false;
  const writes = [], notices = [];
  let reloads = 0;
  const action = await interaction('exams/MathExams.tsx', 'promptAction', '重命名试卷', {
    exam: {ID: 20, Name: '旧名称'}, examName: row => row.Name,
    promptAction: async options => { assert.equal(options.defaultValue, '旧名称'); return value; },
    mathPost: async (path, body) => { writes.push([path, JSON.parse(JSON.stringify(body))]); if (fail) throw new Error('保存暂不可用'); },
    list: {reload: () => { reloads++; }}, showMessage: async options => notices.push(options),
  });
  await action(); value = '   '; await action(); await tick(); assert.equal(writes.length, 0);
  value = ' 期末复习卷 '; await action(); await tick();
  assert.deepEqual(writes[0], ['/api/ks_paper/Inner_ks_paper', {ID: 20, Name: '期末复习卷', UpdateColumns: 'ID,Name'}]);
  assert.equal(reloads, 1);
  fail = true; await action(); await tick();
  assert.equal(notices.length, 1); assert.equal(notices[0].description, '保存暂不可用'); assert.equal(reloads, 1);
});

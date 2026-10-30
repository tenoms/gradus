import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { noteQuestionRow, noteRecordId } from '../../../src/features/math/notebook/notebook-model.mjs';

const path = new URL('../../../src/features/math/notebook/MathNotebook.tsx', import.meta.url);
const source = await readFile(path, 'utf8');
const ast = ts.createSourceFile(path.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function executable(name) {
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(component);
  return ts.transpileModule(component.getText(ast).replace(/^export default /, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React, jsxFactory: 'element' },
  }).outputText;
}
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)];
const textOf = tree => !tree || typeof tree === 'boolean' ? '' : typeof tree === 'string' ? tree : (tree.props?.children || []).flat(Infinity).map(textOf).join('');
const element = (type, props, ...children) => ({ type, props: { ...props, children } });
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

function bankQuestion({ row = { QuestionID: 42, BusID: 7 }, initial = [], post = async () => ({ data: 101 }), readError = '' } = {}) {
  const states = [], writes = [], reads = [];
  const remote = { data: readError ? undefined : { data: initial }, loading: false, error: readError, reload() { reloads++; } };
  let cursor, tree, load, reloads = 0;
  const runtime = {
    React: { Fragment: 'Fragment' }, element,
    useState(initialValue) {
      const index = cursor++;
      if (!Object.hasOwn(states, index)) states[index] = initialValue;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useNotes(_key, loader) { load = loader; return remote; },
    mathRows: response => response?.data || [],
    mathData: response => response?.data ?? response,
    mathGet: async (route, query) => { reads.push({ route, query: structuredClone(query) }); return { data: initial }; },
    mathPost: async (route, data) => { writes.push({ route, data: structuredClone(data) }); return post(route, data); },
  };
  const component = runInNewContext(`${executable('NotebookBankQuestion')}\nNotebookBankQuestion;`, runtime);
  function render() {
    cursor = 0;
    tree = component({ row, stuid: 'current-student', renderQuestion: (question, favorite) => element('QuestionReader', { row: question, favorite }) });
  }
  const find = predicate => nodes(tree).find(predicate);
  render();
  return {
    render, writes, reads, remote,
    load: () => load(),
    main: () => find(node => node.type === 'QuestionReader'),
    alert: () => find(node => node.props?.role === 'alert'),
    retry: () => find(node => node.type === 'button' && textOf(node) === '重试'),
    notice: () => find(node => node.props?.role === 'status'),
    reloads: () => reloads,
  };
}

test('opening a bank notebook entry preserves its question and scope and returns to a refreshed list', async () => {
  const original = { ID: 66, QID: 905, QuestionID: 777, RelD: 88, BusID: 13, Type: '收藏' };
  const reloads = [], rendered = [];
  let cursor = 0;
  const state = { 0: '收藏', 1: 'bank', 8: original };
  const runtime = {
    element, useEffect() {},
    useState(initial) { const index = cursor++; return [Object.hasOwn(state, index) ? state[index] : initial, value => { state[index] = value; }]; },
    useNotes: key => ({ data: [], loading: false, error: '', reload: () => reloads.push(key) }),
    useMathLearningPlan: () => ({ subject: '数一' }),
    mathRows: () => [], mathTables: () => [], noteQuestionRow, noteRecordId,
    ArrowLeft: 'ArrowLeft', NotebookBankQuestion: 'NotebookBankQuestion',
  };
  const component = runInNewContext(`${executable('MathNotebook')}\nMathNotebook;`, runtime);
  const render = () => { cursor = 0; return component({ stuid: 'current-student', initialKind: '收藏', renderQuestion: (...args) => { rendered.push(args); return element('QuestionReader', { row: args[0], favorite: args[1] }); } }); };
  const tree = render();
  const bank = nodes(tree).find(node => node.type === 'NotebookBankQuestion');
  assert.ok(bank);
  assert.equal(bank.props.row.QuestionID, 905, 'bank QID is the question identity rather than the joined record or book identity');
  assert.equal(bank.props.row.BusID, 13);
  assert.equal(rendered.length, 0, 'bank entries go through their own favorite controller');
  const question = bankQuestion({ row: bank.props.row, initial: [{ ID: 88, Type: '收藏' }] });
  await question.load();
  assert.deepEqual(question.reads, [{ route: '/api/rel_question_log/GetListByPage', query: { StuID: 'current-student', Type: '收藏', QuestionID: 905, BusID: 13, page: 1, limit: 100 } }]);
  assert.equal(question.main().props.favorite.active, true);
  nodes(tree).find(node => node.type === 'button').props.onClick();
  assert.equal(state[8], undefined);
  assert.deepEqual(reloads, ['notes:current-student:收藏:0:0:bank']);

  state[1] = 'book'; state[8] = original;
  const bookTree = render();
  assert.equal(nodes(bookTree).some(node => node.type === 'NotebookBankQuestion'), false);
  assert.equal(rendered[0][0].QuestionID, 777);
  assert.equal(rendered[0][1], undefined, 'book entries retain the ordinary book favorite hook');
});

test('notebook bank favorites toggle their own record in place without success dialogs or book writes', async () => {
  const view = bankQuestion({ row: { QuestionID: 903, BusID: 0 }, initial: [{ ID: 201, Type: '收藏' }], post: async route => ({ data: route.includes('/Del_') ? true : 202 }) });
  const row = view.main().props.row;
  assert.equal(view.main().props.favorite.active, true);
  view.main().props.favorite.toggle();
  view.render();
  assert.equal(view.main().props.favorite.busy, true);
  await settle(); view.render();
  assert.equal(view.main().props.favorite.active, false);
  assert.deepEqual(view.writes[0], { route: '/api/rel_question_log/Del_rel_question_log', data: { ID: 201 } });
  view.main().props.favorite.toggle();
  await settle(); view.render();
  assert.equal(view.main().props.favorite.active, true);
  assert.deepEqual(view.writes[1], { route: '/api/rel_question_log/Inner_rel_question_log', data: { Type: '收藏', QuestionID: 903, StuID: 'current-student', BusID: 0, ID: 0, UpdateColumns: 'ID,Content' } });
  assert.equal(view.main().props.row, row, 'favorite updates keep the same active reader row');
  assert.equal(view.reloads(), 0);
  assert.equal(view.notice(), undefined);
  assert.equal(view.alert(), undefined);
  assert.equal(view.writes.some(call => /sys_user_book_question/.test(call.route)), false);
});

test('notebook bank read and write failures retain favorite state and expose a working retry', async () => {
  const read = bankQuestion({ readError: '收藏状态暂不可用' });
  assert.equal(read.main().props.favorite.busy, true);
  assert.match(textOf(read.alert()), /收藏状态暂不可用/);
  read.main().props.favorite.toggle();
  await settle(); read.render();
  assert.equal(read.writes.length, 0, 'an unknown favorite state cannot overwrite existing records');
  read.retry().props.onClick();
  assert.equal(read.reloads(), 1);

  for (const active of [false, true]) {
    let fail = true;
    const view = bankQuestion({ initial: active ? [{ ID: 301, Type: '收藏' }] : [], post: async route => {
      if (fail) return { data: false };
      return { data: route.includes('/Del_') ? true : 302 };
    } });
    view.main().props.favorite.toggle();
    await settle(); view.render();
    assert.equal(view.main().props.favorite.active, active);
    assert.match(textOf(view.alert()), /未成功/);
    fail = false;
    view.retry().props.onClick();
    await settle(); view.render();
    assert.equal(view.main().props.favorite.active, !active);
    assert.equal(view.alert(), undefined);
    assert.equal(view.reloads(), 0);
  }
});

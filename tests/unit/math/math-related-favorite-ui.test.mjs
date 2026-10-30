import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const path = new URL('../../../src/features/math/questions/MathRelatedQuestions.tsx', import.meta.url);
const source = await readFile(path, 'utf8');
const ast = ts.createSourceFile(path.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'RelatedReader');
assert.ok(component);
const executable = ts.transpileModule(component.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React, jsxFactory: 'element' },
}).outputText;
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)];
const textOf = tree => !tree || typeof tree === 'boolean' ? '' : typeof tree === 'string' ? tree : (tree.props?.children || []).flat(Infinity).map(textOf).join('');

function reader({ qid = 42, scope = 7, initial = [], answers = [], gradeState = 1, post = async () => ({ data: 101 }) } = {}) {
  const states = [], refs = [], effects = [], reads = [], writes = [], savedAnswers = [];
  const data = [
    { data: [{ QuestionID: qid, QuestionTxt: '当前题干' }] },
    { data: [[], [], [], [], initial, answers] },
    { data: [[], []] },
  ];
  let stateCursor, refCursor, effectCursor, tree, load, reloads = 0;
  const runtime = {
    React: { Fragment: 'Fragment' },
    element: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initialValue) {
      const index = stateCursor++;
      if (!Object.hasOwn(states, index)) states[index] = initialValue;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef(initialValue) { return refs[refCursor++] ||= { current: initialValue }; },
    useEffect(setup, dependencies) {
      const index = effectCursor++, previous = effects[index];
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) effects[index] = { dependencies, setup, pending: true };
    },
    useData(_key, loader) {
      load = loader;
      return { data, loading: false, error: '', reload() { reloads++; } };
    },
    mathCommand: async (command, params) => {
      reads.push({ command, params: structuredClone(params) });
      return data[command === 'GetQuestionDetails_rel_zyk' ? 0 : command === 'GetUserLogQuestionList_zyk' ? 1 : 2];
    },
    mathData: response => response?.data ?? response,
    mathRows: response => response?.data || [],
    mathTables: response => response?.data || [],
    mathPost: async (route, payload) => { writes.push({ route, payload: structuredClone(payload) }); return post(route, payload); },
    relatedGradeState: () => gradeState,
    ...Object.fromEntries(['State', 'ArrowLeft', 'Star', 'Flag'].map(name => [name, name])),
  };
  const renderComponent = runInNewContext(`${executable}\nRelatedReader;`, runtime);
  const props = {
    row: { QuestionID: qid }, stuid: 'current-student', scope, mode: '练习模式',
    renderQuestion: options => runtime.element('QuestionReader', { key: String(qid), ...options }),
    back() {}, onSaved: row => savedAnswers.push(row),
  };
  function render() {
    stateCursor = refCursor = effectCursor = 0;
    tree = renderComponent(props);
    let changed = false;
    for (const effect of effects) if (effect.pending) { effect.pending = false; effect.setup(); changed = true; }
    if (changed) return render();
    return tree;
  }
  const find = predicate => nodes(tree).find(predicate);
  render();
  return {
    render, reads, writes, savedAnswers,
    load: () => load(),
    reloads: () => reloads,
    main: () => find(node => node.type === 'QuestionReader'),
    bottom: () => find(node => node.type === 'button' && node.props.className?.includes('math-favorite-button')),
    star: () => nodes(find(node => node.type === 'button' && node.props.className?.includes('math-favorite-button'))).find(node => node.type === 'Star'),
    draft: () => find(node => node.type === 'textarea'),
    notice: () => find(node => node.props?.role === 'status'),
  };
}
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function assertFavorite(view, active) {
  assert.equal(view.main().props.favorite.active, active, 'main reader receives the same favorite state as the lower toolbar');
  assert.equal(view.bottom().props['aria-pressed'], active);
  assert.equal(view.star().props.fill, active ? 'currentColor' : 'none');
  assert.equal(textOf(view.bottom()), active ? '取消收藏' : '收藏本题');
}

test('related reader supplies existing scoped favorites to both controls without a separate book favorite lookup', async () => {
  const view = reader({ qid: 902, scope: 11, initial: [{ ID: 77, Type: '收藏' }, { ID: 78, Type: '笔记', Content: '已保存笔记' }] });
  await view.load();
  assertFavorite(view, true);
  assert.equal(view.main().props.row.QuestionID, 902);
  assert.equal(view.draft().props.value, '已保存笔记');
  const privateRead = view.reads.find(call => call.command === 'GetUserLogQuestionList_zyk');
  assert.equal(privateRead.params.QuestionID, 902);
  assert.equal(privateRead.params.BusID, 11);
  assert.equal(privateRead.params.StuID, 'current-student');
  assert.equal(view.reads.some(call => /sys_user_book_question/.test(call.command)), false);
  assert.equal(view.reloads(), 0);
});

test('either favorite control updates both stars while preserving the reader and an unsaved note draft', async () => {
  let resolveSave;
  const view = reader({ qid: 903, scope: 0, post: route => route.includes('/Inner_') ? new Promise(resolve => { resolveSave = resolve; }) : Promise.resolve({ data: true }) });
  view.draft().props.onChange({ target: { value: '尚未保存的题库笔记' } });
  view.render();
  const identity = [view.main().type, view.main().props.key, view.main().props.row.QuestionID];
  assertFavorite(view, false);
  view.main().props.favorite.toggle();
  view.render();
  assert.equal(view.main().props.favorite.busy, true);
  assert.equal(view.bottom().props.disabled, true);
  assertFavorite(view, false);
  assert.deepEqual(view.writes[0], {
    route: '/api/rel_question_log/Inner_rel_question_log',
    payload: { Type: '收藏', QuestionID: 903, StuID: 'current-student', BusID: 0, ID: 0, UpdateColumns: 'ID,Content' },
  });
  resolveSave({ data: 201 });
  await settle();
  view.render();
  assertFavorite(view, true);
  assert.equal(view.main().props.favorite.busy, false);
  assert.equal(view.notice(), undefined, 'favorite success uses its persistent star state instead of another success prompt');
  assert.equal(view.draft().props.value, '尚未保存的题库笔记');
  assert.deepEqual([view.main().type, view.main().props.key, view.main().props.row.QuestionID], identity);
  assert.equal(view.reloads(), 0, 'favorite updates must not reload details and unmount the active reader');

  await view.bottom().props.onClick();
  view.render();
  assertFavorite(view, false);
  assert.deepEqual(view.writes[1], { route: '/api/rel_question_log/Del_rel_question_log', payload: { ID: 201 } });
  assert.equal(view.draft().props.value, '尚未保存的题库笔记');
  assert.equal(view.notice(), undefined);
  assert.equal(view.reloads(), 0);
  assert.equal(view.savedAnswers.length, 0, 'changing a favorite never submits or replaces the current answer');
});

test('failed favorite creation or cancellation keeps the previous stars and draft without reloading the reader', async () => {
  for (const current of [false, true]) for (const failure of ['network', 'rejected']) {
    const initial = current ? [{ ID: 301, Type: '收藏' }] : [];
    const view = reader({ initial, post: async () => {
      if (failure === 'network') throw new Error('服务暂不可用');
      return { data: false };
    } });
    view.draft().props.onChange({ target: { value: '失败后继续编辑' } });
    view.render();
    await view.bottom().props.onClick();
    view.render();
    assertFavorite(view, current);
    assert.equal(view.main().props.favorite.busy, false);
    assert.equal(view.bottom().props.disabled, false);
    assert.equal(view.draft().props.value, '失败后继续编辑');
    assert.match(textOf(view.notice()), /服务暂不可用|未成功/);
    assert.equal(view.reloads(), 0);
    assert.equal(view.writes.length, 1);
  }
});

test('related mistakes restore and toggle independently of favorites and saved answers', async () => {
  const view = reader({ qid: 904, scope: 12, initial: [{ ID: 41, Type: '收藏' }, { ID: 42, Type: '错题' }], answers: [{ ID: 43, Type: '题目', MyAnswer: 'B', State: 2, IsSubmit: 1 }], post: async route => ({ data: route.includes('/Del_') ? true : 44 }) });
  assert.equal(view.main().props.mistake.active, true);
  assertFavorite(view, true);
  view.draft().props.onChange({ target: { value: '保留编辑中的笔记' } });
  view.render();
  view.main().props.mistake.toggle();
  await settle(); view.render();
  assert.equal(view.main().props.mistake.active, false);
  assertFavorite(view, true);
  assert.deepEqual(view.writes[0], { route: '/api/rel_question_log/Del_rel_question_log', payload: { ID: 42 } });
  assert.equal(view.main().props.row.MyAnswer, 'B');
  assert.equal(view.main().props.readOnly, true);
  view.main().props.mistake.toggle();
  await settle(); view.render();
  assert.equal(view.main().props.mistake.active, true);
  assert.deepEqual(view.writes[1], { route: '/api/rel_question_log/Inner_rel_question_log', payload: { Type: '错题', QuestionID: 904, StuID: 'current-student', BusID: 12, ID: 0, UpdateColumns: 'ID,Content' } });
  assertFavorite(view, true);
  assert.equal(view.main().props.row.MyAnswer, 'B');
  assert.equal(view.draft().props.value, '保留编辑中的笔记');
  assert.equal(view.notice(), undefined);
  assert.equal(view.savedAnswers.length, 0);
  assert.equal(view.reloads(), 0);
});

test('a wrong answer immediately marks the same related reader and the next click removes that persisted mistake', async () => {
  const view = reader({ qid: 905, scope: 0, gradeState: 2, initial: [{ ID: 61, Type: '收藏' }], post: async (route, payload) => ({ data: route.includes('/Del_') ? true : payload.Type === '错题' ? 63 : payload.Type === '题目' ? 62 : true }) });
  await view.main().props.onAnswered('B', false, { options: [{ ID: 1 }] });
  view.render();
  assert.equal(view.main().props.mistake.active, true);
  assertFavorite(view, true);
  assert.equal(view.main().props.row.MyAnswer, 'B');
  assert.equal(view.main().props.readOnly, true);
  assert.equal(view.savedAnswers.length, 1);
  assert.equal(view.savedAnswers[0].ID, 62);
  assert.equal(view.savedAnswers[0].IsSubmit, 1);
  assert.deepEqual(view.writes.find(call => call.payload.Type === '错题'), { route: '/api/rel_question_log/Inner_rel_question_log', payload: { Type: '错题', QuestionID: 905, StuID: 'current-student', BusID: 0, ID: 0 } });
  view.main().props.mistake.toggle();
  await settle(); view.render();
  assert.equal(view.main().props.mistake.active, false);
  assert.deepEqual(view.writes.at(-1), { route: '/api/rel_question_log/Del_rel_question_log', payload: { ID: 63 } });
  assert.equal(view.writes.filter(call => call.payload.Type === '错题').length, 1, 'the first click after automatic marking removes instead of adding the mistake again');
  assert.equal(view.main().props.row.MyAnswer, 'B');
  assert.equal(view.savedAnswers.length, 1);
  assert.equal(view.reloads(), 0);
});

test('failed mistake writes preserve the previous mark and an automatic-mark failure still preserves the saved answer', async () => {
  for (const active of [false, true]) {
    const view = reader({ initial: [{ ID: 71, Type: '收藏' }, ...(active ? [{ ID: 72, Type: '错题' }] : [])], post: async () => ({ data: false }) });
    view.main().props.mistake.toggle();
    await settle(); view.render();
    assert.equal(view.main().props.mistake.active, active);
    assertFavorite(view, true);
    assert.match(textOf(view.notice()), /未成功/);
    assert.equal(view.savedAnswers.length, 0);
    assert.equal(view.reloads(), 0);
  }
  const automatic = reader({ gradeState: 2, initial: [{ ID: 81, Type: '收藏' }], post: async (_route, payload) => ({ data: payload.Type === '错题' ? false : payload.Type === '题目' ? 82 : true }) });
  await automatic.main().props.onAnswered('A', false, { options: [{ ID: 1 }] });
  automatic.render();
  assert.equal(automatic.main().props.mistake.active, false);
  assertFavorite(automatic, true);
  assert.equal(automatic.main().props.row.MyAnswer, 'A');
  assert.equal(automatic.main().props.readOnly, true);
  assert.equal(automatic.savedAnswers.length, 1);
  assert.equal(automatic.savedAnswers[0].IsSubmit, 1);
  assert.match(textOf(automatic.notice()), /错题标记未保存/);
});

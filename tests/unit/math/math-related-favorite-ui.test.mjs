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

function reader({ qid = 42, scope = 7, initial = [], post = async () => ({ data: 101 }) } = {}) {
  const states = [], refs = [], effects = [], reads = [], writes = [], savedAnswers = [];
  const data = [
    { data: [{ QuestionID: qid, QuestionTxt: '当前题干' }] },
    { data: [[], [], [], [], initial, []] },
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
    relatedGradeState: () => 1,
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

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { mathQuestionChoice, mathQuestionPrompt } from "../../../src/features/math/questions/math-question-presentation.mjs";

async function declarations(file, names) {
  const source = await readFile(new URL(`../../../src/features/math/${file}`, import.meta.url), "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return names.map(name => {
    const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
    assert.ok(node, `run the actual ${name} implementation`);
    return node.getText(ast).replace(/^export\s+(?:default\s+)?/, "");
  }).join("\n");
}
const favoriteSource = await declarations("notebook/use-math-favorite.ts", ["useMathFavorite"]);
const toolsSource = await declarations("questions/MathQuestionTools.tsx", ["MathQuestionTools"]);
const readerSource = await declarations("questions/MathQuestionReader.tsx", ["QuestionReader"]);
const editorSource = await declarations("notebook/MathNoteEditor.tsx", ["msg", "useRemote", "MathNoteEditor"]);
const data = value => value && typeof value === "object" && "data" in value ? value.data : value;
const rows = value => {
  const result = data(value);
  return Array.isArray(result?.[0]) ? result[0] : Array.isArray(result) ? result : [];
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const textOf = node => Array.isArray(node) ? node.map(textOf).join("")
  : node && typeof node === "object" ? textOf(node.props?.children)
    : node == null || typeof node === "boolean" ? "" : String(node);

// Run real hooks, effects and event closures. Child components are inert nodes,
// allowing each parent to be checked without mounting unrelated question media.
function render(source, name, initialProps, dependencies = {}) {
  const hooks = [];
  let props = initialProps, cursor = 0, dirty = true, pending = [], tree;
  const scope = {
    Error,
    React: { Fragment: "Fragment" },
    element: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === "function" ? initial() : initial };
      return [hooks[index].value, value => {
        const next = typeof value === "function" ? value(hooks[index].value) : value;
        if (!Object.is(next, hooks[index].value)) { hooks[index].value = next; dirty = true; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: { current: initial } };
      return hooks[index].value;
    },
    useEffect(effect, dependencies) {
      const index = cursor++, previous = hooks[index];
      if (!previous || dependencies.some((value, offset) => !Object.is(value, previous.dependencies[offset])))
        pending.push(() => { previous?.cleanup?.(); hooks[index] = { dependencies, cleanup: effect() }; });
    },
    mathRows: rows,
    mathData: data,
    mathQuestionId: row => row.QuestionID || row.ID,
    mathTitle: row => row.Name || "数学题目",
    mergeMathQuestion: (row, fetched) => ({ ...row, ...fetched }),
    mathQuestionChoice,
    mathQuestionPrompt,
    useRemote: () => ({ loading: false, error: "", data: { question: {}, resolve: [], files: [] } }),
    useSession: () => ({ session: { platforms: { math: { user: { SubjectType: "数二" } } } } }),
    useStudyTimer() {},
    ...Object.fromEntries(["Star", "BookOpen", "PencilLine", "MessageCircle", "FileText", "LoaderCircle", "RefreshCw", "ArrowLeft", "ArrowRight", "Check", "X", "LearningWorkbench", "MathQuestionStem", "State", "MathNoteEditor", "AttachmentInput"].map(name => [name, name])),
    ...dependencies,
  };
  const output = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React, jsxFactory: "element",
  } }).outputText;
  const component = runInNewContext(`${output}\n${name};`, scope);
  function flush() {
    let attempts = 0;
    while (dirty) {
      assert.ok(++attempts < 30, "hook effects must settle");
      dirty = false; cursor = 0; pending = [];
      tree = component(props);
      for (const effect of pending) effect();
    }
  }
  function findAll(predicate, node) {
    if (arguments.length < 2) node = tree;
    if (Array.isArray(node)) return node.flatMap(child => findAll(predicate, child));
    if (!node || typeof node !== "object") return [];
    return [...(predicate(node) ? [node] : []), ...findAll(predicate, node.props?.children || [])];
  }
  flush();
  return {
    current: () => tree,
    findAll,
    find: predicate => findAll(predicate)[0],
    button: label => findAll(node => node.type === "button").find(node => textOf(node) === label),
    update(value) { props = { ...props, ...value }; dirty = true; flush(); },
    async settle() { for (let i = 0; i < 10; i++) { flush(); await new Promise(resolve => setImmediate(resolve)); } flush(); },
    unmount() { for (const hook of hooks) hook?.cleanup?.(); },
  };
}
const favoriteButton = view => view.find(node => node.type === "button" && node.props.className?.includes("math-favorite-button"));
const star = view => view.find(node => node.type === "Star");
const hookSource = `${favoriteSource}\nfunction FavoriteProbe({stuid,qid,enabled}) {return useMathFavorite(stuid,qid,enabled);}`;

test("favorite hook restores persisted state and clears it immediately on a question change", async () => {
  const second = deferred(), calls = [];
  const view = render(hookSource, "FavoriteProbe", { stuid: "student", qid: 10 }, {
    mathApi: { questionNotes: async (...args) => { calls.push(args); return args[2] === 10 ? { data: [[{ ID: 71 }]] } : second.promise; } },
  });
  assert.equal(view.current().loading, true);
  await view.settle();
  assert.equal(view.current().active, true);
  assert.deepEqual(calls[0], ["student", "收藏", 10]);
  view.update({ qid: 11 });
  assert.equal(view.current().active, false, "the previous question's star cannot remain filled");
  assert.equal(view.current().loading, true);
  second.resolve({ data: [[]] }); await view.settle();
  assert.equal(view.current().active, false);
  assert.equal(view.current().loading, false);
  view.unmount();
});

test("favorite hook ignores a previous question's response and retries a failed read", async () => {
  const old = deferred();
  let currentReads = 0;
  const view = render(hookSource, "FavoriteProbe", { stuid: "student", qid: "old" }, {
    mathApi: { questionNotes: async (stuid, kind, qid) => {
      if (qid === "old") return old.promise;
      if (++currentReads === 1) throw new Error("offline");
      return { data: [[{ ID: 72 }]] };
    } },
  });
  view.update({ qid: "current" }); await view.settle();
  assert.equal(view.current().error, "offline");
  old.resolve({ data: [[{ ID: 70 }]] }); await view.settle();
  assert.equal(view.current().active, false);
  assert.equal(view.current().error, "offline");
  view.current().reload(); await view.settle();
  assert.equal(view.current().active, true);
  assert.equal(view.current().error, "");
  view.unmount();
});

test("question tools use the same filled star and pressed state on initial load and after saving", async () => {
  const saved = new Set([10]);
  const view = render(`${favoriteSource}\n${toolsSource}`, "MathQuestionTools", { stuid: "student", qid: 10 }, {
    mathApi: { questionNotes: async (stuid, kind, qid) => ({ data: [saved.has(qid) ? [{ ID: 70 }] : []] }) },
  });
  assert.equal(favoriteButton(view).props.disabled, true);
  await view.settle();
  assert.equal(favoriteButton(view).props["aria-pressed"], true);
  assert.equal(star(view).props.fill, "currentColor");
  view.update({ qid: 11 }); await view.settle();
  assert.equal(favoriteButton(view).props["aria-pressed"], false);
  assert.equal(star(view).props.fill, "none");
  favoriteButton(view).props.onClick(); await view.settle();
  const editor = view.find(node => node.type === "MathNoteEditor");
  assert.equal(editor.props.qid, 11);
  assert.equal(editor.props.kind, "收藏");
  editor.props.onSaved(); editor.props.close(); await view.settle();
  assert.equal(favoriteButton(view).props["aria-pressed"], true);
  assert.equal(star(view).props.fill, "currentColor");
  assert.equal(view.find(node => node.type === "MathNoteEditor"), undefined);
  view.unmount();
});

test("question reader restores its filled star and no longer renders teacher question actions", async () => {
  const view = render(`${favoriteSource}\n${readerSource}`, "QuestionReader", { stuid: "student", row: { QuestionID: 10 } }, {
    mathApi: { questionNotes: async () => ({ data: [[{ ID: 70 }]] }) },
  });
  await view.settle();
  assert.equal(favoriteButton(view).props["aria-pressed"], true);
  assert.equal(star(view).props.fill, "currentColor");
  const toolbar = view.find(node => node.props.className === "math-question-tools");
  assert.deepEqual(view.findAll(node => node.type === "button", toolbar).map(node => node.props["aria-label"]), ["加入错题本", "已收藏，编辑收藏", "写笔记"]);
  view.unmount();
});

test("external favorite controls drive reader state and actions without querying book favorites", async () => {
  let toggles = 0, reads = 0;
  const favorite = { active: true, toggle: () => { toggles++; } };
  const view = render(`${favoriteSource}\n${readerSource}`, "QuestionReader", { stuid: "student", row: { QuestionID: 10 }, favorite }, {
    mathApi: { questionNotes: async () => { reads++; return { data: [[]] }; } },
  });
  await view.settle();
  assert.equal(reads, 0, "an external favorite controller owns its persistence");
  assert.equal(favoriteButton(view).props.disabled, false);
  assert.equal(favoriteButton(view).props["aria-label"], "取消收藏");
  assert.equal(favoriteButton(view).props["aria-pressed"], true);
  assert.equal(star(view).props.fill, "currentColor");
  favoriteButton(view).props.onClick();
  assert.equal(toggles, 1);
  view.update({ favorite: { ...favorite, active: false, busy: true } });
  assert.equal(favoriteButton(view).props["aria-pressed"], false);
  assert.equal(favoriteButton(view).props.disabled, true);
  assert.equal(star(view).props.fill, "none");
  view.unmount();
});

function editorFixture(saveNote, existing = []) {
  const calls = [], events = [];
  const view = render(editorSource, "MathNoteEditor", {
    qid: 10, bookId: 8, stuid: "student", kind: "收藏", source: "课程", isCourse: true,
    onSaved: () => events.push("saved"), close: () => events.push("close"),
  }, {
    mathApi: {
      noteCatalogs: async (...args) => { calls.push(["catalogs", ...args]); return { data: [[{ ID: 7, Name: "默认分类" }]] }; },
      questionNotes: async (...args) => { calls.push(["notes", ...args]); return { data: [existing] }; },
      saveNote: async payload => { calls.push(["save", structuredClone(payload)]); return saveNote(payload); },
    },
  });
  return { view, calls, events };
}

test("saving a favorite invokes onSaved and closes directly without another saved panel", async () => {
  const { view, calls, events } = editorFixture(async () => ({ data: true }));
  await view.settle();
  view.find(node => node.type === "textarea").props.onChange({ target: { value: "复习提醒" } });
  await view.settle();
  await view.button("保存").props.onClick(); await view.settle();
  assert.deepEqual(events, ["saved", "close"]);
  const payload = calls.find(call => call[0] === "save")[1];
  assert.deepEqual(payload, { StuID: "student", Type: "收藏", QuestionID: 10, BookID: 8, Source: "课程", IsCourse: "2", Content: "复习提醒", ContentImg: "", CatalogID: 7 });
  assert.equal(view.button("保存")?.props.disabled, false);
  assert.equal(view.button("已保存"), undefined);
  assert.equal(view.button("完成"), undefined);
  assert.equal(view.find(node => node.props.className === "math-save-success"), undefined);
  view.unmount();
});

for (const failure of ["false", "error"]) {
  test(`a ${failure} favorite save leaves the editor and draft open without onSaved`, async () => {
    const { view, calls, events } = editorFixture(async () => {
      if (failure === "error") throw new Error("保存暂不可用");
      return { data: false };
    }, [{ ID: 70, CatalogID: 7, Content: "旧内容" }]);
    await view.settle();
    view.find(node => node.type === "textarea").props.onChange({ target: { value: "保留的草稿" } });
    await view.settle();
    await view.button("保存").props.onClick(); await view.settle();
    assert.deepEqual(events, []);
    assert.equal(view.find(node => node.type === "textarea").props.value, "保留的草稿");
    assert.equal(view.button("保存").props.disabled, false);
    assert.match(textOf(view.find(node => node.props.role === "alert")), failure === "error" ? /保存暂不可用/ : /保存未成功/);
    assert.equal(calls.find(call => call[0] === "save")[1].ID, 70, "editing updates the existing favorite");
    view.unmount();
  });
}

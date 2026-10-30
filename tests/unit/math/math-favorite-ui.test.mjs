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
const markSource = await declarations("notebook/use-math-question-mark.ts", ["useMathQuestionMark"]);
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
const markButton = (view, kind) => view.find(node => node.type === "button" && node.props.className?.includes(kind === "收藏" ? "math-favorite-button" : "math-mistake-button"));
const markIcon = (view, kind) => view.findAll(node => ["Star", "FileText", "BookOpen"].includes(node.type), markButton(view, kind))[0];
const hookSource = `${markSource}\nfunction MarkProbe({stuid,qid,kind,enabled}) {return useMathQuestionMark(stuid,qid,kind,enabled);}`;
const components = [
  { name: "question reader", component: "QuestionReader", source: readerSource, props: { stuid: "student", row: { QuestionID: 10 } } },
  { name: "question tools", component: "MathQuestionTools", source: toolsSource, props: { stuid: "student", qid: 10 } },
];

for (const kind of ["收藏", "错题"]) {
  const label = kind === "收藏" ? "favorite" : "mistake";
  const other = kind === "收藏" ? "错题" : "收藏";

  test(`${label} hook restores persisted state and clears it immediately on a question change`, async () => {
    const second = deferred(), calls = [];
    const view = render(hookSource, "MarkProbe", { stuid: "student", qid: 10, kind }, {
      mathApi: { questionNotes: async (...args) => { calls.push(args); return args[2] === 10 ? { data: [[{ ID: 71 }]] } : second.promise; } },
    });
    assert.equal(view.current().loading, true);
    await view.settle();
    assert.equal(view.current().active, true);
    assert.deepEqual(calls[0], ["student", kind, 10]);
    view.update({ qid: 11 });
    assert.equal(view.current().active, false, "the previous question's mark cannot remain filled");
    assert.equal(view.current().loading, true);
    second.resolve({ data: [[]] }); await view.settle();
    assert.equal(view.current().active, false);
    assert.equal(view.current().loading, false);
    view.unmount();
  });

  test(`${label} hook ignores a previous question's response and retries a failed read`, async () => {
    const old = deferred();
    let currentReads = 0;
    const view = render(hookSource, "MarkProbe", { stuid: "student", qid: "old", kind }, {
      mathApi: { questionNotes: async (stuid, requestedKind, qid) => {
        assert.equal(requestedKind, kind);
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

  for (const fixture of components) {
    const { name, component, source, props } = fixture;
    test(`${name} restores, saves and removes a ${label} without changing the other mark`, async () => {
      const saved = new Set([10]), deletions = [];
      const view = render(`${markSource}\n${source}`, component, props, {
        mathApi: {
          questionNotes: async (stuid, requestedKind, qid) => ({ data: [requestedKind === kind && saved.has(qid) ? [{ ID: qid === 10 ? 70 : 71 }] : []] }),
          deleteNote: async (id, stuid) => { deletions.push([id, stuid]); saved.delete(11); return { data: true }; },
        },
      });
      assert.equal(markButton(view, kind).props.disabled, true);
      await view.settle();
      assert.equal(markButton(view, kind).props["aria-pressed"], true);
      assert.equal(markIcon(view, kind).props.fill, "currentColor");
      if (kind === "错题") assert.equal(markIcon(view, kind).props.stroke, "var(--on-accent)");
      assert.equal(markButton(view, other).props["aria-pressed"], false);
      view.update(component === "QuestionReader" ? { row: { QuestionID: 11 } } : { qid: 11 });
      await view.settle();
      assert.equal(markButton(view, kind).props["aria-pressed"], false);
      assert.equal(markIcon(view, kind).props.fill, "none");
      if (kind === "错题") assert.equal(markIcon(view, kind).props.stroke, "currentColor");
      markButton(view, kind).props.onClick(); await view.settle();
      const editor = view.find(node => node.type === "MathNoteEditor");
      assert.equal(editor.props.qid, 11);
      assert.equal(editor.props.kind, kind);
      saved.add(11);
      editor.props.onSaved(); editor.props.close(); await view.settle();
      assert.equal(markButton(view, kind).props["aria-pressed"], true);
      assert.equal(markIcon(view, kind).props.fill, "currentColor");
      assert.equal(markButton(view, other).props["aria-pressed"], false, "saving targets only the selected mark kind");
      assert.equal(view.find(node => node.type === "MathNoteEditor"), undefined);
      markButton(view, kind).props.onClick(); await view.settle();
      assert.deepEqual(deletions, [[71, "student"]], "a newly saved mark removes its actual current-question record");
      assert.equal(markButton(view, kind).props["aria-pressed"], false);
      assert.equal(markIcon(view, kind).props.fill, "none");
      assert.equal(view.find(node => node.type === "MathNoteEditor"), undefined);
      view.unmount();
    });

    test(`${name} removes a saved ${label} and opens the editor only when adding again`, async () => {
      const pending = deferred(), deletions = [];
      let saved = true;
      const view = render(`${markSource}\n${source}`, component, props, {
        mathApi: {
          questionNotes: async (stuid, requestedKind, qid) => {
            assert.equal(qid, 10);
            return { data: [requestedKind === kind && saved ? [{ ID: 70, QuestionID: 10 }] : []] };
          },
          deleteNote: async (id, stuid) => {
            deletions.push([id, stuid]);
            await pending.promise;
            saved = false;
            return { data: true };
          },
        },
      });
      await view.settle();
      assert.equal(markButton(view, kind).props["aria-pressed"], true);
      assert.equal(markIcon(view, kind).props.fill, "currentColor");
      if (kind === "错题") assert.equal(markButton(view, kind).props["aria-label"] || textOf(markButton(view, kind)), "移出错题本");
      markButton(view, kind).props.onClick(); await view.settle();
      assert.deepEqual(deletions, [[70, "student"]]);
      assert.equal(view.find(node => node.type === "MathNoteEditor"), undefined, "a filled mark cancels instead of opening editing");
      assert.equal(markButton(view, kind).props.disabled, true);
      assert.equal(markButton(view, kind).props["aria-pressed"], true, "keep the saved state visible until deletion succeeds");
      pending.resolve(); await view.settle();
      assert.equal(markButton(view, kind).props["aria-pressed"], false);
      assert.equal(markButton(view, kind).props.disabled, false);
      assert.equal(markIcon(view, kind).props.fill, "none");
      if (kind === "错题") assert.equal(markButton(view, kind).props["aria-label"] || textOf(markButton(view, kind)), component === "QuestionReader" ? "加入错题本" : "加入错题");
      markButton(view, kind).props.onClick(); await view.settle();
      const editor = view.find(node => node.type === "MathNoteEditor");
      assert.equal(editor.props.qid, 10);
      assert.equal(editor.props.kind, kind);
      assert.equal(deletions.length, 1, "the empty mark starts adding instead of deleting again");
      view.unmount();
    });

    for (const failure of ["false", "error"]) {
      test(`${name} preserves its filled ${label} after ${failure} deletion and retries from the same button`, async () => {
        let attempts = 0, saved = true;
        const view = render(`${markSource}\n${source}`, component, props, {
          mathApi: {
            questionNotes: async (stuid, requestedKind) => ({ data: [requestedKind === kind && saved ? [{ ID: 70, QuestionID: 10 }] : []] }),
            deleteNote: async () => {
              if (++attempts === 1) {
                if (failure === "error") throw new Error("移除暂不可用");
                return { data: false };
              }
              saved = false;
              return { data: true };
            },
          },
        });
        await view.settle();
        markButton(view, kind).props.onClick(); await view.settle();
        assert.equal(markButton(view, kind).props["aria-pressed"], true);
        assert.equal(markButton(view, kind).props.disabled, false);
        assert.equal(markIcon(view, kind).props.fill, "currentColor");
        assert.ok(textOf(view.find(node => node.props.role === "alert")));
        assert.equal(view.find(node => node.type === "MathNoteEditor"), undefined);
        markButton(view, kind).props.onClick(); await view.settle();
        assert.equal(attempts, 2, "retry removes the mark rather than merely reloading its state");
        assert.equal(markButton(view, kind).props["aria-pressed"], false);
        assert.equal(markIcon(view, kind).props.fill, "none");
        assert.equal(view.find(node => node.props.role === "alert"), undefined);
        view.unmount();
      });
    }

    test(`${name} retries a failed ${label} read without opening its editor or changing the other mark`, async () => {
      let reads = 0;
      const view = render(`${markSource}\n${source}`, component, props, {
        mathApi: { questionNotes: async (stuid, requestedKind) => {
          if (requestedKind === other) return { data: [[{ ID: 90 }]] };
          if (++reads === 1) throw new Error(`${kind}状态暂不可用`);
          return { data: [[]] };
        } },
      });
      await view.settle();
      assert.equal(markButton(view, kind).props.disabled, false);
      assert.equal(markButton(view, kind).props["aria-pressed"], false);
      assert.equal(markButton(view, other).props["aria-pressed"], true);
      assert.equal(markButton(view, kind).props["aria-label"] || textOf(markButton(view, kind)), `重新读取${kind}状态`);
      assert.equal(view.find(node => node.props.role === "alert"), undefined, "read failures use the retry action rather than the removal error banner");
      markButton(view, kind).props.onClick(); await view.settle();
      assert.equal(reads, 2);
      assert.equal(view.find(node => node.type === "MathNoteEditor"), undefined);
      assert.equal(markButton(view, kind).props["aria-pressed"], false);
      assert.equal(markButton(view, other).props["aria-pressed"], true);
      assert.equal(view.find(node => node.props.role === "alert"), undefined);
      view.unmount();
    });
  }

  for (const failure of ["false", "error"]) {
    test(`a ${failure} ${label} deletion keeps the hook active and can be retried`, async () => {
      let attempts = 0, saved = true;
      const view = render(hookSource, "MarkProbe", { stuid: "student", qid: 10, kind }, {
        mathApi: {
          questionNotes: async (stuid, requestedKind) => {
            assert.equal(requestedKind, kind);
            return { data: [saved ? [{ ID: 70, QuestionID: 10 }] : []] };
          },
          deleteNote: async (id, stuid) => {
            assert.equal(id, 70);
            assert.equal(stuid, "student");
            if (++attempts === 1) {
              if (failure === "error") throw new Error("移除暂不可用");
              return { data: false };
            }
            saved = false;
            return { data: true };
          },
        },
      });
      await view.settle();
      await view.current().remove(); await view.settle();
      assert.equal(view.current().active, true);
      assert.equal(view.current().loading, false);
      assert.ok(view.current().removeError, "a failed removal remains visible");
      assert.equal(view.current().error, "", "removal failures do not become read failures");
      await view.current().remove(); await view.settle();
      assert.equal(attempts, 2);
      assert.equal(view.current().active, false);
      assert.equal(view.current().loading, false);
      assert.equal(view.current().removeError, "");
      view.unmount();
    });
  }

  test(`external ${label} controls drive reader state and actions without querying that ordinary mark`, async () => {
    let toggles = 0;
    const reads = [], control = { active: true, toggle: () => { toggles++; } };
    const propName = kind === "收藏" ? "favorite" : "mistake";
    const view = render(`${markSource}\n${readerSource}`, "QuestionReader", { stuid: "student", row: { QuestionID: 10 }, [propName]: control }, {
      mathApi: { questionNotes: async (stuid, requestedKind) => { reads.push(requestedKind); return { data: [[]] }; } },
    });
    await view.settle();
    assert.deepEqual(reads, [other], "each external controller only owns its own persistence");
    assert.equal(markButton(view, kind).props.disabled, false);
    assert.equal(markButton(view, kind).props["aria-label"], kind === "收藏" ? "取消收藏" : "移出错题本");
    assert.equal(markButton(view, kind).props["aria-pressed"], true);
    assert.equal(markIcon(view, kind).props.fill, "currentColor");
    assert.equal(markButton(view, other).props["aria-pressed"], false);
    markButton(view, kind).props.onClick();
    assert.equal(toggles, 1);
    view.update({ [propName]: { ...control, active: false, busy: true } });
    assert.equal(markButton(view, kind).props["aria-pressed"], false);
    assert.equal(markButton(view, kind).props.disabled, true);
    assert.equal(markIcon(view, kind).props.fill, "none");
    assert.equal(markButton(view, other).props.disabled, false);
    view.unmount();
  });
}

test("mark hook changes kind and user without carrying the previous persisted state", async () => {
  const calls = [];
  const view = render(hookSource, "MarkProbe", { stuid: "first", qid: 10, kind: "收藏" }, {
    mathApi: { questionNotes: async (...args) => { calls.push(args); return { data: args[0] === "first" && args[1] === "收藏" ? [[{ ID: 70 }]] : [[]] }; } },
  });
  await view.settle();
  assert.equal(view.current().active, true);
  view.update({ kind: "错题" });
  assert.equal(view.current().active, false);
  assert.equal(view.current().loading, true);
  await view.settle();
  assert.equal(view.current().active, false);
  view.update({ stuid: "second", kind: "收藏" });
  assert.equal(view.current().active, false);
  await view.settle();
  assert.deepEqual(calls, [["first", "收藏", 10], ["first", "错题", 10], ["second", "收藏", 10]]);
  assert.equal(view.current().active, false);
  view.unmount();
});

test("question reader restores both filled marks and no longer renders teacher question actions", async () => {
  const view = render(`${markSource}\n${readerSource}`, "QuestionReader", { stuid: "student", row: { QuestionID: 10 } }, {
    mathApi: { questionNotes: async (stuid, kind) => ({ data: [[{ ID: kind === "收藏" ? 70 : 71 }]] }) },
  });
  await view.settle();
  for (const kind of ["收藏", "错题"]) {
    assert.equal(markButton(view, kind).props["aria-pressed"], true);
    assert.equal(markIcon(view, kind).props.fill, "currentColor");
  }
  const toolbar = view.find(node => node.props.className === "math-question-tools");
  assert.deepEqual(view.findAll(node => node.type === "button", toolbar).map(node => node.props["aria-label"]), ["移出错题本", "取消收藏", "写笔记"]);
  view.unmount();
});

test("two external mark controllers avoid ordinary annotation reads and keep their actions separate", async () => {
  const toggles = [];
  const view = render(`${markSource}\n${readerSource}`, "QuestionReader", {
    stuid: "student", row: { QuestionID: 10 },
    favorite: { active: true, toggle: () => toggles.push("收藏") },
    mistake: { active: true, toggle: () => toggles.push("错题") },
  }, {
    mathApi: { questionNotes: async () => { assert.fail("external controls own both persistence contracts"); } },
  });
  await view.settle();
  markButton(view, "错题").props.onClick();
  markButton(view, "收藏").props.onClick();
  assert.deepEqual(toggles, ["错题", "收藏"]);
  assert.equal(view.find(node => node.type === "MathNoteEditor"), undefined);
  view.unmount();
});

function editorFixture(saveNote, existing = [], kind = "收藏") {
  const calls = [], events = [];
  const view = render(editorSource, "MathNoteEditor", {
    qid: 10, bookId: 8, stuid: "student", kind, source: "课程", isCourse: true,
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

for (const kind of ["收藏", "错题"]) {
  const label = kind === "收藏" ? "favorite" : "mistake";
  test(`saving a ${label} invokes onSaved and closes directly without another saved panel`, async () => {
    const { view, calls, events } = editorFixture(async () => ({ data: true }), [], kind);
    await view.settle();
    view.find(node => node.type === "textarea").props.onChange({ target: { value: "复习提醒" } });
    await view.settle();
    await view.button("保存").props.onClick(); await view.settle();
    assert.deepEqual(events, ["saved", "close"]);
    const payload = calls.find(call => call[0] === "save")[1];
    assert.deepEqual(payload, { StuID: "student", Type: kind, QuestionID: 10, BookID: 8, Source: "课程", IsCourse: "2", Content: "复习提醒", ContentImg: "", CatalogID: 7 });
    assert.deepEqual(calls.find(call => call[0] === "notes").slice(1), ["student", kind, 10]);
    assert.equal(view.button("保存")?.props.disabled, false);
    assert.equal(view.button("已保存"), undefined);
    assert.equal(view.button("完成"), undefined);
    assert.equal(view.find(node => node.props.className === "math-save-success"), undefined);
    view.unmount();
  });

  for (const failure of ["false", "error"]) {
    test(`a ${failure} ${label} save leaves the editor and draft open without onSaved`, async () => {
      const { view, calls, events } = editorFixture(async () => {
        if (failure === "error") throw new Error("保存暂不可用");
        return { data: false };
      }, [{ ID: 70, CatalogID: 7, Content: "旧内容" }], kind);
      await view.settle();
      view.find(node => node.type === "textarea").props.onChange({ target: { value: "保留的草稿" } });
      await view.settle();
      await view.button("保存").props.onClick(); await view.settle();
      assert.deepEqual(events, []);
      assert.equal(view.find(node => node.type === "textarea").props.value, "保留的草稿");
      assert.equal(view.button("保存").props.disabled, false);
      assert.match(textOf(view.find(node => node.props.role === "alert")), failure === "error" ? /保存暂不可用/ : /保存未成功/);
      assert.equal(calls.find(call => call[0] === "save")[1].ID, 70, "editing updates the existing mark");
      view.unmount();
    });
  }
}

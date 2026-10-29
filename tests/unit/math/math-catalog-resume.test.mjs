import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { paginationState } from "../../../src/shared/ui/pagination/pagination-model.mjs";

async function functionsFrom(path, names) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return names.map(name => {
    const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(declaration, `the test executes the actual ${name} function`);
    return declaration.getText(ast).replace(/^export\s+/, "");
  }).join("\n");
}

const componentSource = await functionsFrom("../../../src/features/math/MathWorkspace.tsx", ["BookWorkspace", "useRemote"]);
const paginationSource = await functionsFrom("../../../src/shared/ui/pagination/use-pagination.ts", ["usePagination"]);
const mathSource = await functionsFrom("../../../src/features/math/api/math.ts", ["mathRows", "mathQuestionId", "mathTitle"]);
const executable = ts.transpileModule([componentSource, paginationSource, mathSource].join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React, jsxFactory: "element" },
}).outputText;

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const questions = Array.from({ length: 75 }, (_, index) => ({
  QuestionID: index + 1,
  QuestionPage: index + 1,
  QuestionSort: index % 5 + 1,
  ChapterName: "目录章节",
}));

// Render the actual component and pagination hook. Child components remain inert
// elements so requests, effects, selection and navigation run without a DOM.
function workspace({ catalogue = deferred(), resume = deferred(), save = () => Promise.resolve() } = {}) {
  const hooks = [];
  const loads = [], saves = [], catalogueLoads = [];
  let cursor = 0, dirty = true, pending = [], tree;
  const scope = {
    element: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === "function" ? initial() : initial };
      return [hooks[index].value, value => {
        const next = typeof value === "function" ? value(hooks[index].value) : value;
        if (!Object.is(next, hooks[index].value)) { hooks[index].value = next; dirty = true; }
      }];
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = hooks[index];
      if (!previous || dependencies.some((value, offset) => !Object.is(value, previous.dependencies[offset]))) {
        pending.push(() => {
          previous?.cleanup?.();
          hooks[index] = { dependencies, cleanup: effect() };
        });
      }
    },
    paginationState,
    mathData: response => response?.data ?? response,
    mathApi: { bookCatalog: (...args) => { catalogueLoads.push(args); return catalogue.promise; } },
    loadBookPosition: (...args) => { loads.push(args); return resume.promise; },
    saveBookPosition: (...args) => { saves.push(args); return save(...args); },
    invalidateCatalogResources() {},
    msg: error => error.message,
  };
  for (const name of ["ArrowLeft", "ArrowRight", "BookOpen", "ChevronRight", "RefreshCw", "Search", "Suspense", "State", "Pagination", "QuestionReader"])
    scope[name] = name;
  const BookWorkspace = runInNewContext(`${executable}\nBookWorkspace;`, scope);
  const props = { book: { ID: 34, Name: "测试书籍" }, stuid: "web-student", back() {} };
  function render() {
    let attempts = 0;
    while (dirty) {
      assert.ok(++attempts < 30, "component effects settle without a render loop");
      dirty = false;
      cursor = 0;
      pending = [];
      tree = BookWorkspace(props);
      for (const effect of pending) effect();
    }
    return tree;
  }
  async function settle() {
    for (let attempt = 0; attempt < 20; attempt++) {
      render();
      await new Promise(resolve => setImmediate(resolve));
      if (!dirty) return;
    }
    assert.fail("asynchronous component work did not settle");
  }
  function elements(predicate, node) {
    if (arguments.length < 2) node = tree;
    if (Array.isArray(node)) return node.flatMap(child => elements(predicate, child));
    if (!node || typeof node !== "object") return [];
    return [...(predicate(node) ? [node] : []), ...elements(predicate, node.props?.children)];
  }
  function textOf(node) {
    if (arguments.length === 0) node = tree;
    if (Array.isArray(node)) return node.map(textOf).join("");
    if (node == null || typeof node === "boolean") return "";
    return typeof node === "object" ? textOf(node.props?.children) : String(node);
  }
  render();
  return {
    catalogue, resume, loads, saves, catalogueLoads, render, settle, elements, textOf,
    rerender: () => { dirty = true; return render(); },
    reader: () => elements(node => node.type === "QuestionReader")[0]?.props,
    pagination: () => elements(node => node.type === "Pagination")[0]?.props,
    buttons: () => elements(node => node.type === "button"),
    catalogButtons: () => elements(node => node.props?.className === "math-catalog-list")
      .flatMap(node => elements(item => item.type === "button", node)),
    unmount: () => { for (const hook of hooks) hook.cleanup?.(); },
  };
}

for (const first of ["catalogue", "resume"]) {
  test(`the book restores question 61 and its catalogue page when ${first} arrives first`, async () => {
    const view = workspace();
    assert.deepEqual(view.loads, [["web-student", 34]], "every book opens through the position loader");
    assert.deepEqual(view.catalogueLoads, [[34]]);
    assert.equal(view.reader(), undefined);
    const position = { QuestionID: "61", QuestionSort: 999, QuestionPage: 999 };
    if (first === "catalogue") {
      view.catalogue.resolve({ data: [questions] });
      await view.settle();
      assert.equal(view.reader(), undefined);
      view.resume.resolve(position);
    } else {
      view.resume.resolve(position);
      await view.settle();
      assert.equal(view.reader(), undefined, "a resume record cannot open before its catalogue entry exists");
      view.catalogue.resolve({ data: [questions] });
    }
    await view.settle();
    assert.equal(view.reader().row, questions[60], "string IDs select the full catalogue row, not a sparse resume record or printed number");
    assert.equal(view.pagination().page, 3);
    assert.equal(view.catalogButtons().filter(node => node.props.className === "active").length, 1);
    assert.equal(typeof view.reader().prev, "function");
    assert.equal(typeof view.reader().next, "function");
    assert.deepEqual(view.saves, [[34, questions[60]]]);

    view.pagination().onPageChange(1);
    view.render();
    assert.equal(view.pagination().page, 1);
    view.rerender();
    assert.equal(view.pagination().page, 1, "rerender preserves manual catalogue browsing");
    view.pagination().onPageSizeChange(15);
    view.render();
    assert.equal(view.pagination().page, 5, "page size changes reveal the selected question again");
    assert.equal(view.saves.length, 1, "catalogue pagination does not create a new reading position");
    view.unmount();
  });
}

test("a late resume response cannot replace a question the learner already selected", async () => {
  const view = workspace();
  view.catalogue.resolve({ data: [questions] });
  await view.settle();
  view.catalogButtons()[1].props.onClick();
  await view.settle();
  assert.equal(view.reader().row, questions[1]);
  view.resume.resolve({ QuestionID: "61" });
  await view.settle();
  assert.equal(view.reader().row, questions[1]);
  assert.deepEqual(view.saves, [[34, questions[1]]]);
  view.unmount();
});

test("previous and next follow the full book, cross catalogue pages and stop at both ends", async () => {
  const view = workspace();
  view.catalogue.resolve({ data: [questions] });
  view.resume.resolve(undefined);
  await view.settle();
  view.buttons().find(node => view.textOf(node).includes("从第一题开始")).props.onClick();
  await view.settle();
  assert.equal(view.reader().row, questions[0]);
  assert.equal(view.reader().prev, undefined);
  assert.equal(typeof view.reader().next, "function");
  view.reader().next();
  await view.settle();
  assert.equal(view.reader().row, questions[1]);
  assert.equal(view.saves.at(-1)[1], questions[1], "flipping saves progress without loading a child reader or opening analysis");

  view.catalogButtons().at(-1).props.onClick();
  await view.settle();
  assert.equal(view.reader().row, questions[29]);
  view.reader().next();
  await view.settle();
  assert.equal(view.reader().row, questions[30]);
  assert.equal(view.pagination().page, 2);
  view.reader().prev();
  await view.settle();
  assert.equal(view.reader().row, questions[29]);
  assert.equal(view.pagination().page, 1);

  view.pagination().onPageChange(3);
  view.render();
  view.catalogButtons().at(-1).props.onClick();
  await view.settle();
  assert.equal(view.reader().row, questions.at(-1));
  assert.equal(view.reader().next, undefined);
  assert.equal(typeof view.reader().prev, "function");
  view.reader().prev();
  await view.settle();
  assert.equal(view.reader().row, questions.at(-2));
  assert.equal(view.saves.at(-1)[1], questions.at(-2));
  view.unmount();
});

test("an obsolete resume question never opens a different question with the same record or printed number", async () => {
  const view = workspace();
  view.catalogue.resolve({ data: [questions] });
  view.resume.resolve({ QuestionID: "deleted-question", ID: 12, QuestionSort: 1 });
  await view.settle();
  assert.equal(view.reader(), undefined);
  assert.match(view.textOf(), /上次阅读的题目已不在当前目录/);
  assert.equal(view.saves.length, 0);
  view.catalogButtons()[0].props.onClick();
  await view.settle();
  assert.equal(view.reader().row, questions[0], "the catalogue remains usable after an invalid resume");
  view.unmount();
});

test("a failed position save offers a working retry for the current question", async () => {
  let attempts = 0;
  const view = workspace({ save: () => ++attempts === 1 ? Promise.reject(new Error("temporarily unavailable")) : Promise.resolve() });
  view.catalogue.resolve({ data: [questions] });
  view.resume.resolve({ QuestionID: "4" });
  await view.settle();
  assert.equal(view.reader().row, questions[3]);
  assert.match(view.textOf(), /阅读位置未能保存/);
  const retry = view.buttons().find(node => view.textOf(node).includes("重试保存位置"));
  assert.ok(retry);
  retry.props.onClick();
  await view.settle();
  assert.deepEqual(view.saves, [[34, questions[3]], [34, questions[3]]]);
  assert.doesNotMatch(view.textOf(), /阅读位置未能保存/);
  view.unmount();
});

test("a failed resume read leaves manual selection and saving available", async () => {
  const view = workspace();
  view.catalogue.resolve({ data: [questions] });
  view.resume.reject(new Error("temporarily unavailable"));
  await view.settle();
  assert.match(view.textOf(), /上次阅读位置暂未读取/);
  view.catalogButtons()[2].props.onClick();
  await view.settle();
  assert.equal(view.reader().row, questions[2]);
  assert.deepEqual(view.saves, [[34, questions[2]]]);
  view.unmount();
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as workflow from "../../../src/features/computer/practice/question-workflow.mjs";

async function functionsFrom(path, names) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return names.map(name => {
    const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(declaration, `execute the actual ${name} function`);
    return declaration.getText(ast).replace(/^export\s+(?:default\s+)?/, "");
  }).join("\n");
}
const source = await functionsFrom("../../../src/features/computer/practice/ComputerExerciseSession.tsx", ["ExerciseSession"]);
const api = await functionsFrom("../../../src/features/computer/api/computer.ts", ["records", "extractExercises", "restoreComputerAnswers", "computerSkippedIds", "plain"]);
const executable = ts.transpileModule(source + "\n" + api, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React, jsxFactory: "element" },
}).outputText;
const question = number => ({ exerciseId: `q${number}`, exerciseType: 4, exerciseStems: `Question ${number}` });
const cacheKey = (record = "own-record") => `study:computer:draft:["web-student"]:major:1:${record}:3:group:`;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

function session({ data = {}, launch = {}, cache = new Map(), load, save = async () => true, report = { examRecord: { id: "own-record" }, answerList: [] } } = {}) {
  const hooks = [], loads = [], saves = [], studyTimers = [];
  let cursor = 0, dirty = true, pending = [], tree;
  const scope = {
    ...workflow,
    React: { Fragment: "Fragment" },
    element: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useSession: () => ({ session: { user: { id: "web-student" } } }),
    useStudyTimer: options => studyTimers.push(options),
    buildComputerAnswer: ({ question, answer }) => ({ exerciseId: question.exerciseId, answer, answerType: 1 }),
    buildComputerSubmission: ({ answers }) => ({ answers }),
    recordActivity: () => {},
    window: { confirm: () => true },
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === "function" ? initial() : initial };
      return [hooks[index].value, value => {
        const next = typeof value === "function" ? value(hooks[index].value) : value;
        if (!Object.is(next, hooks[index].value)) { hooks[index].value = next; dirty = true; }
      }];
    },
    useRef(value) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: { current: value } };
      return hooks[index].value;
    },
    useEffect(effect, dependencies) {
      const index = cursor++, previous = hooks[index];
      if (!previous || dependencies.some((value, offset) => !Object.is(value, previous.dependencies[offset]))) {
        pending.push(() => { previous?.cleanup?.(); hooks[index] = { dependencies, cleanup: effect() }; });
      }
    },
    localStorage: { getItem: key => cache.get(key), setItem: (key, value) => cache.set(key, value), removeItem: key => cache.delete(key) },
    request: async (...args) => {
      loads.push(args);
      if (args[0].endsWith("/submitExam")) return { examRecordId: "own-record" };
      return load ? load(...args) : { exercises: [question(args[1].number)], examRecordId: "own-record" };
    },
    computerLearningApi: {
      saveSheetIndex: async (...args) => { saves.push(args); return save(...args); },
      submittedReport: async () => report,
    },
    exerciseSource: () => "",
    typeNames: { 4: "综合题" },
    safeLink: value => value,
  };
  for (const name of ["ArrowLeft", "ArrowRight", "BookOpen", "Check", "ImagePlus", "LoaderCircle", "RefreshCw", "Star", "X", "RichContent", "LearningWorkbench", "ComputerQuestionTools", "ComputerInterviewRecorder", "ComputerKnowledgeTags", "ComputerQuestionVideo", "ComputerExamReport", "Status"])
    scope[name] = name;
  const ExerciseSession = runInNewContext(`${executable}\nExerciseSession;`, scope);
  const props = { launch: { majorId: "major", chapterId: "chapter", examGroupId: "group", title: "章节练习", examType: 3, ...launch, data: { exercises: [question(1)], exerciseTotalNumber: 3, examId: "shared-paper", examRecordId: "own-record", sheetIndex: 1, ...data } }, onClose() {} };
  function render() {
    let attempts = 0;
    while (dirty) {
      assert.ok(++attempts < 30, "component effects settle");
      dirty = false; cursor = 0; pending = [];
      tree = ExerciseSession(props);
      for (const effect of pending) effect();
    }
  }
  async function settle() {
    for (let attempt = 0; attempt < 20; attempt++) { render(); await new Promise(resolve => setImmediate(resolve)); if (!dirty) return; }
    assert.fail("asynchronous component work did not settle");
  }
  function elements(predicate, node) {
    if (arguments.length < 2) node = tree;
    if (Array.isArray(node)) return node.flatMap(child => elements(predicate, child));
    if (!node || typeof node !== "object") return [];
    return [...(predicate(node) ? [node] : []), ...elements(predicate, node.props?.children || [])];
  }
  function textOf(node) {
    if (Array.isArray(node)) return node.map(textOf).join("");
    if (node == null || typeof node === "boolean") return "";
    return typeof node === "object" ? textOf(node.props?.children) : String(node);
  }
  render();
  return {
    loads, saves, render, settle, cache,
    studyTimer: () => studyTimers.at(-1),
    related: data => elements(node => node.type === "ComputerQuestionTools")[0].props.onRelated(data),
    closeRelated: () => elements(node => node.props?.launch && node.props?.onClose)[0].props.onClose(),
    workbench: () => elements(node => node.type === "LearningWorkbench")[0].props,
    button: name => elements(node => node.type === "button").find(node => textOf(node) === name)?.props,
    sheet: () => elements(node => node.type === "button" && node.props?.["aria-current"] === "step")[0]?.props,
    sheetButtons: () => elements(node => node.type === "button" && /^第 \d+ 题，/.test(node.props?.["aria-label"] || "")).map(node => node.props),
    stem: () => elements(node => node.type === "RichContent" && node.props?.className === "computer-question-stem")[0]?.props.content,
    report: () => elements(node => node.type === "ComputerExamReport")[0]?.props.data,
    error: () => elements(node => node.type === "Status")[0]?.props.error,
    notice: () => elements(node => node.props?.className === "computer-notice").map(textOf).join(""),
    unmount: () => { for (const hook of hooks) hook.cleanup?.(); },
  };
}

test("cloud continuation overrides an older browser position while keeping the learner's answer draft", async () => {
  const cache = new Map([[cacheKey(), JSON.stringify({ answers: { q3: "draft" }, current: 0 })]]);
  const view = session({ data: { sheetIndex: 3 }, cache });
  assert.equal(view.workbench().disabled, true, "restore disables keyboard navigation");
  assert.equal(view.studyTimer().enabled, false, "restoring a question is not learning time");
  assert.ok(view.sheetButtons().every(button => button.disabled));
  await view.settle();
  assert.equal(view.loads[0][1].number, 3);
  assert.equal(view.stem(), "Question 3");
  assert.equal(view.studyTimer().enabled, true);
  assert.match(view.studyTimer().title, /第 3 题/);
  assert.deepEqual(view.saves, [["own-record", 3]]);
  assert.equal(view.button("上一题").disabled, false);
  assert.equal(view.button("下一题").disabled, true);
  const saved = JSON.parse(cache.get(cacheKey()));
  assert.equal(saved.current, 2);
  assert.equal(saved.answers.q3, "draft");
  view.unmount();
});

test("successful flips save the visited question without submitting an answer, including cached returns", async () => {
  const view = session(); await view.settle();
  assert.equal(view.button("上一题").disabled, true);
  assert.equal(view.button("下一题").disabled, false);
  view.button("下一题").onClick(); await view.settle();
  assert.equal(view.stem(), "Question 2");
  assert.deepEqual(view.saves, [["own-record", 2]]);
  assert.equal(view.loads.length, 1);
  view.workbench().previous(); await view.settle();
  assert.equal(view.stem(), "Question 1");
  assert.deepEqual(view.saves.at(-1), ["own-record", 1]);
  assert.equal(view.loads.length, 1, "cached questions remain navigable without a fetch");
  assert.equal(view.button("上一题").disabled, true);
  view.unmount();
});

for (const response of ["failure", "empty"]) {
  test(`a ${response} next-question response keeps the displayed question and continuation position`, async () => {
    const view = session({ load: async () => { if (response === "failure") throw new Error("offline"); return { exercises: [] }; } });
    await view.settle(); view.button("下一题").onClick(); await view.settle();
    assert.equal(view.stem(), "Question 1");
    assert.equal(view.saves.length, 0);
    assert.ok(view.error());
    assert.equal(view.button("下一题").disabled, false, "the learner can retry the next question");
    assert.equal(JSON.parse(view.cache.get(cacheKey())).current, 0);
    view.unmount();
  });
}

test("question navigation remains disabled until its cloud position is saved", async () => {
  const saved = deferred(), view = session({ save: () => saved.promise });
  await view.settle(); view.button("下一题").onClick(); await view.settle();
  assert.equal(view.stem(), "Question 2");
  assert.equal(view.workbench().disabled, true);
  assert.equal(view.studyTimer().enabled, false, "pending source work is excluded from reading time");
  assert.equal(view.button("上一题").disabled, true);
  assert.equal(view.button("下一题").disabled, true);
  assert.ok(view.sheetButtons().every(button => button.disabled));
  saved.resolve(true); await view.settle();
  assert.equal(view.workbench().disabled, false);
  assert.equal(view.studyTimer().enabled, true);
  assert.equal(view.button("上一题").disabled, false);
  view.unmount();
});

test("a failed cloud save keeps the visited question and reports the unsaved position", async () => {
  const view = session({ save: async () => { throw new Error("offline"); } });
  await view.settle(); view.button("下一题").onClick(); await view.settle();
  assert.equal(view.stem(), "Question 2");
  assert.match(view.notice(), /云端续学位置尚未同步.*offline/);
  assert.equal(view.button("下一题").disabled, false);
  assert.equal(JSON.parse(view.cache.get(cacheKey())).current, 1);
  view.unmount();
});

test("new practice records cannot inherit the previous attempt's browser position or draft", async () => {
  const cache = new Map([[cacheKey("old-record"), JSON.stringify({ answers: { q1: "old attempt" }, current: 2 })]]);
  const view = session({ cache }); await view.settle();
  assert.equal(view.stem(), "Question 1");
  assert.equal(view.loads.length, 0);
  assert.equal(JSON.parse(cache.get(cacheKey())).answers.q1, undefined);
  view.unmount();
});

test("report review respects its explicit question and does not overwrite practice continuation", async () => {
  const view = session({ data: { exercises: [question(1), question(2), question(3)], initialIndex: 2, sheetIndex: 1 }, launch: { readOnly: true } });
  await view.settle();
  assert.equal(view.stem(), "Question 3");
  assert.equal(view.studyTimer().enabled, true, "reading saved explanations is real study even without another submission");
  view.button("上一题").onClick(); await view.settle();
  assert.equal(view.stem(), "Question 2");
  assert.equal(view.saves.length, 0);
  assert.equal(view.cache.size, 0);
  view.unmount();
});

test("empty question sessions do not start study time, and related practice suspends its parent", async () => {
  const empty = session({ data: { exercises: [], exerciseTotalNumber: 0 } });
  await empty.settle();
  assert.equal(empty.studyTimer().enabled, false);
  empty.unmount();
  const view = session(); await view.settle();
  assert.equal(view.studyTimer().enabled, true);
  view.related({ exercises: [question(9)], examId: "related-paper" }); view.render();
  assert.equal(view.studyTimer().enabled, false, "a hidden parent cannot count alongside its related practice");
  view.closeRelated(); view.render();
  assert.equal(view.studyTimer().enabled, true);
  view.unmount();
});

test("handing in a paper keeps visible questions and explanations timed alongside its inline report", async () => {
  const view = session({
    launch: { examType: 2 },
    data: { exercises: [question(1)], exerciseTotalNumber: 1, answerList: [{ exerciseId: "q1", answer: "A" }] },
  });
  await view.settle();
  assert.equal(view.studyTimer().enabled, true);
  view.button("交卷").onClick(); await view.settle();
  assert.equal(view.button("交卷"), undefined, "the actual paper submission completed");
  assert.equal(view.report().examRecord.id, "own-record");
  assert.equal(view.stem(), "Question 1", "the question remains visible below the report");
  assert.equal(view.studyTimer().enabled, true, "post-submit review is still real learning");
  view.unmount();
});

test("editing a note blocks mouse, answer-sheet and keyboard navigation consistently", async () => {
  const view = session(); await view.settle();
  view.button("记笔记").onClick(); view.render();
  assert.equal(view.workbench().disabled, true);
  assert.equal(view.button("下一题").disabled, true);
  assert.ok(view.sheetButtons().every(button => button.disabled));
  view.button("记笔记").onClick(); view.render();
  assert.equal(view.workbench().disabled, false);
  assert.equal(view.button("下一题").disabled, false);
  view.unmount();
});

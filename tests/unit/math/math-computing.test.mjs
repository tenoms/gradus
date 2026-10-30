import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
globalThis.__computingFixture = {
  mathData: (r) => r?.data ?? r?.Data ?? r,
  mathRows: (r) => {
    const d = r?.data ?? r?.Data ?? r;
    return Array.isArray(d) ? (Array.isArray(d[0]) ? d[0] : d) : [];
  },
  mathCommand: (...args) => globalThis.__computingCommand(...args),
  mathGet: (...args) => globalThis.__computingGet(...args),
  mathPost: (...args) => globalThis.__computingPost(...args),
};
const source = await readFile(
  new URL("../../../src/features/math/practice/math-computing.ts", import.meta.url),
  "utf8",
);
const output = ts
  .transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace(
    /import \{([^}]+)\} from ['"]\.\.\/api\/math['"];?/,
    (_, names) => `const {${names}}=globalThis.__computingFixture;`,
  );
const adapter = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);
const context = { stuid: "student", catalogID: 10, PaperID: 20 };
const question = {
  QuestionID: 30,
  options: [
    { ID: 31, IsAnswer: 1 },
    { ID: 32, IsAnswer: 0 },
    { ID: 33, IsAnswer: 1 },
  ],
};

test("computing catalogue preserves root allocations and string/number parent relationships", () => {
  const tree = adapter.computingTree([
    { ID: 1, PID: 0, isapply: 1 },
    { ID: 2, PID: "1", BusID: 50 },
    { ID: 3, PID: 0, isapply: 0 },
  ]);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].children[0].BusID, 50);
  assert.equal(tree[0].isapply, 1);
  assert.equal(tree[1].isapply, 0);
  assert.deepEqual(adapter.computingRows({ data: [[{ ID: 1 }]] }), [{ ID: 1 }]);
});
test("computing questions join per-question stems, options, steps, attempts and feedback IDs", () => {
  const result = adapter.mergeComputingQuestions(
    [{ QuestionID: 30 }, { QuestionID: 40 }],
    [
      { QuestionID: 30, ID: 1, Type: "题干", Content: "stem" },
      { QuestionID: 30, ID: 2, Type: "选项", IsAnswer: 1 },
      { QuestionID: 30, ID: 3, Type: "解题步骤", Content: "step" },
      { QuestionID: 40, ID: 4, Type: "题干" },
    ],
    [{ QuestionID: 30, Context: "analysis" }],
    [
      { ID: 9, QuestionID: 30, BusType: "题目", Answer: "2" },
      {
        ID: 10,
        QuestionID: 30,
        BusType: "查看解析步骤",
        BusValue: 3,
        AnswerState: 1,
      },
    ],
  );
  assert.equal(result[0].stems.length, 1);
  assert.equal(result[0].options[0].ID, 2);
  assert.equal(result[0].steps[0].looklog.ID, 10);
  assert.equal(result[0].record.ID, 9);
  assert.equal(result[0].analyses[0].Context, "analysis");
  assert.equal(result[1].record, null);
});
test("computing grading compares complete option ID sets and never grades an empty answer correct", () => {
  assert.equal(adapter.computingCorrect(question, "33,31"), true);
  assert.equal(adapter.computingCorrect(question, "31"), false);
  assert.equal(adapter.computingCorrect(question, ""), false);
});
test("computing attempt preserves actors, IDs, attempts, elapsed seconds and original update columns", () => {
  const first = adapter.computingRecord(context, question, "31", 25);
  assert.equal(first.Type, "四大计算");
  assert.equal(first.BusType, "题目");
  assert.equal(first.QuestionID, 30);
  assert.equal(first.PaperID, 20);
  assert.equal(first.BusID, 10);
  assert.equal(first.AnswerState, 0);
  assert.equal(first.BusValue, 1);
  assert.equal(first.Notes, "25");
  const retry = adapter.computingRecord(
    context,
    { ...question, record: { ID: 90, BusValue: 2 } },
    "31,33",
    32,
  );
  assert.equal(retry.ID, 90);
  assert.equal(retry.BusValue, 3);
  assert.equal(retry.IsFinished, 1);
  assert.equal(retry.AnswerState, 1);
  assert.match(retry.UpdateColumns, /Notes/);
});
test("step feedback writes the step in BusValue, and mistake retry updates the original mistake record", () => {
  const hint = adapter.computingHintRecord(
    context,
    question,
    { ID: 80, looklog: { ID: 81 } },
    1,
  );
  assert.equal(hint.ID, 81);
  assert.equal(hint.BusType, "查看解析步骤");
  assert.equal(hint.BusValue, 80);
  assert.equal(hint.QuestionID, 30);
  assert.equal(hint.UpdateColumns, "AnswerState");
  const review = adapter.computingRecord(
    { ...context, mistakes: true },
    { ...question, userRecordID: 91 },
    "33,31",
    1,
  );
  assert.deepEqual(review, {
    ID: 91,
    IsFinished: 1,
    AnswerState: 1,
    UpdateColumns: "IsFinished,AnswerState",
  });
});
test("computing completion submits missing questions before marking the existing paper finished", async () => {
  const calls = [];
  globalThis.__computingPost = async (path, data) => {
    calls.push({ path, data });
    return { msg: "操作成功", data: 1 };
  };
  await adapter.computingApi.finish(
    context,
    [
      { QuestionID: 30, record: { ID: 90 } },
      { QuestionID: 40, questiontime: 15 },
    ],
    { ID: 100 },
  );
  assert.equal(calls.length, 2);
  assert.equal(
    calls[0].path,
    "/api/c_paper_users_record/InnerAll_c_paper_users_record",
  );
  const missing = JSON.parse(calls[0].data.Content);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].QuestionID, 40);
  assert.equal(missing[0].AnswerState, 0);
  assert.equal(missing[0].Notes, "15");
  assert.equal(
    calls[1].path,
    "/api/c_paper_users_record/Inner_c_paper_users_record",
  );
  assert.equal(calls[1].data.ID, 100);
  assert.equal(calls[1].data.IsFinished, 1);
  assert.equal(calls[1].data.BusType, "试卷");
  assert.equal(calls[1].data.QuestionID, 0);
});
test("catalog allocation uses Model endpoint and retry keeps catalogue-specific scope", async () => {
  let seen;
  globalThis.__computingCommand = async (...args) => {
    seen = args;
    return { data: [[]] };
  };
  await adapter.computingApi.catalogs("student");
  assert.deepEqual(seen, [
    "GetMajorComputingAndUserAllocation",
    { StuID: "student", IsValid: 1 },
    true,
  ]);
  globalThis.__computingPost = async (...args) => {
    seen = args;
    return { msg: "操作成功" };
  };
  await adapter.computingApi.retry(context);
  assert.equal(seen[0], "/api/c_paper_users_record/RetryPaper");
  assert.equal(seen[1].BusID, 10);
  assert.equal(seen[1].PaperID, 20);
});

test("computing hint URLs and provider IDs use the shared video recovery player with resolve provenance", async () => {
  const source = await readFile(new URL("../../../src/features/math/practice/MathComputing.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("MathComputing.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "map" && node.expression.expression.getText(ast) === "steps") callback = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(callback);
  const output = ts.transpileModule(`const render = ${callback.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: "jsx" } }).outputText;
  const render = runInNewContext(`${output}\nrender;`, {
    jsx: (type, props, ...children) => ({ type, props: props || {}, children }),
    MathQuestionVideo: "MathQuestionVideo", RichContent: "RichContent", question: { QuestionID: 30 }, loading: false, hint() {},
  });
  const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === "object" ? [node, ...nodes(node.children)] : [];
  for (const step of [{ ID: 80, Files: "https://media.example/hint.m3u8" }, { ID: 81, Files: "hint-vid" }, { Files: "https://media.example/unique-hint.mp4" }]) {
    const tree = render(step, 0), player = nodes(tree).find(node => node.type === "MathQuestionVideo");
    assert.ok(player, "direct links and VIDs both use the shared cache/recovery component");
    assert.equal(player.props.row.PolyvVID, step.Files);
    assert.equal(player.props.row.ID, undefined, "resolve-step IDs never become question-file feedback IDs");
    assert.equal(JSON.stringify(player.props.origin), JSON.stringify({ kind: "resolve", questionId: 30, ...(step.ID ? { itemId: step.ID } : {}) }));
    assert.equal(nodes(tree).some(node => node.type === "a"), false);
  }
});

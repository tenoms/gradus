import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../../../src/features/math/practice/MathModelTraining.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("MathModelTraining.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const loader = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "loadModuleQuestion");
assert.ok(loader, "the component and regression use the same question loader");
globalThis.__moduleQuestionFixture = {
  mathApi: {
    question: (...args) => globalThis.__moduleQuestion(...args),
    resolve: (...args) => globalThis.__moduleResolve(...args),
    analysis: (...args) => globalThis.__moduleAnalysis(...args),
  },
  mathRows(response) {
    const data = response?.data ?? response;
    return Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  },
};
const output = ts.transpileModule(loader.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { loadModuleQuestion } = await import(`data:text/javascript;base64,${Buffer.from("const {mathApi,mathRows}=globalThis.__moduleQuestionFixture;" + output).toString("base64")}`);

test("module question text and choices survive a failed analysis request", async () => {
  const question = { ID: 91, QuestionTxt: "实际题干" }, option = { ID: 92, Type: "选项", Content: "A" };
  globalThis.__moduleQuestion = async () => ({ data: [question] });
  globalThis.__moduleResolve = async () => ({ data: [option] });
  globalThis.__moduleAnalysis = async () => { throw new Error("analysis unavailable"); };
  const result = await loadModuleQuestion({ QuestionID: 91 });
  assert.deepEqual(result.question, question);
  assert.deepEqual(result.resolve, [option]);
  assert.deepEqual(result.analysis, []);
  assert.match(result.errors[0], /解析.*analysis unavailable/);
});

test("module analysis remains readable when choices fail and question request falls back to returned row data", async () => {
  globalThis.__moduleQuestion = async () => { throw new Error("question unavailable"); };
  globalThis.__moduleResolve = async () => { throw new Error("choices unavailable"); };
  globalThis.__moduleAnalysis = async () => ({ data: [{ ID: 93, Content: "已返回解析" }] });
  const row = { QuestionID: 91, QuestionTxt: "目录已返回题干" };
  const result = await loadModuleQuestion(row);
  assert.deepEqual(result.question, row);
  assert.equal(result.analysis[0].Content, "已返回解析");
  assert.equal(result.errors.length, 2);
  assert.match(result.errors.join(" "), /question unavailable/);
  assert.match(result.errors.join(" "), /choices unavailable/);
});

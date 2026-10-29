import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../../../src/features/math/library/math-book-position.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace(/import[^;]+;/g, "");
const compile = new Function("api", "mathQuestionId", "bookshelfApi", "shelfLastQuestion", "shelfRows",
  output.replace(/export /g, "") + ";return {loadBookPosition,saveBookPosition};");
function fixture(api, legacy = async () => ({ data: [] })) {
  return compile(api, row => row.QuestionID ?? row.ID, { lastQuestion: legacy }, row => row,
    response => Array.isArray(response.data?.[0]) ? response.data[0] : response.data);
}

test("a saved Web position takes priority over an older analysis record", async () => {
  const calls = [];
  const adapter = fixture(async path => { calls.push(path); return { position: { QuestionID: 700061 } }; }, async () => { throw new Error("legacy must not be read"); });
  assert.deepEqual(await adapter.loadBookPosition("student", 42), { QuestionID: 700061 });
  assert.deepEqual(calls, ["/api/platform/math/books/42/position"]);
});

test("a book with no saved position can resume its previous analysis", async () => {
  const adapter = fixture(async () => ({ position: null }), async (stuid, bookId) => {
    assert.equal(stuid, "student");
    assert.equal(bookId, 42);
    return { data: [[{ QuestionID: 700001 }]] };
  });
  assert.deepEqual(await adapter.loadBookPosition("student", 42), { QuestionID: 700001 });
  assert.equal(await fixture(async () => ({ position: null })).loadBookPosition("student", 42), undefined);
});

test("visiting a book question saves its identifier and printed position through the private position endpoint", async () => {
  let call;
  const adapter = fixture(async (...args) => { call = args; });
  await adapter.saveBookPosition(42, { ID: 3, QuestionID: 700061, QuestionPage: 12, QuestionSort: 2, MyAnswer: "private answer" });
  assert.equal(call[0], "/api/platform/math/books/42/position");
  assert.equal(call[1].method, "PUT");
  assert.deepEqual(JSON.parse(call[1].body), { QuestionID: 700061, QuestionPage: 12, QuestionSort: 2 });
});

test("failed position reads and saves remain visible to the workspace", async () => {
  const adapter = fixture(async () => { throw new Error("offline"); });
  await assert.rejects(adapter.loadBookPosition("student", 42), /offline/);
  await assert.rejects(adapter.saveBookPosition(42, { QuestionID: 700001 }), /offline/);
});

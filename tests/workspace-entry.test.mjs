import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React, { useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

let search = "";
const loads = [];
const icon = () => null;
const subjects = [{ id: "major", name: "数据结构", examCategory: 1 }];
globalThis.__workspaceEntryFixture = {
  React, useEffect, useRef, useState,
  useSearchParams: () => [new URLSearchParams(search)],
  useComputerSubjects: () => ({ subjects, reload() {} }),
  computerSubjects: subjects,
  computerPracticeType: (_category, exam) => exam ? 2 : 3,
  useLoad(path, query) { loads.push({ path, query }); return { data: [], loading: false }; },
  descendants: rows => rows,
  records: rows => rows || [],
  ComputerSubjectPicker: () => null,
  Status: () => null,
  useMathLearningPlan: () => ({ subject: "数一" }),
  useRemote: () => ({ data: [], loading: false, reload() {} }),
  mathRows: data => data || [],
  mathApi: { books: async () => ({ data: [] }) },
  usePagination: () => ({ page: 1, pageSize: 36, start: 0, end: 36 }),
  Pagination: () => null,
  MathBookshelf: () => React.createElement("h2", null, "我的书架"),
  State: () => null,
  BookOpen: icon, Camera: icon, ArrowRight: icon, ImagePlus: icon,
  Search: icon, RefreshCw: icon, ChevronRight: icon,
};

async function component(file, name) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(node);
  const output = ts.transpileModule(`export ${node.getText(ast)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
  }).outputText;
  const fixture = `const {${Object.keys(globalThis.__workspaceEntryFixture).join(",")}}=globalThis.__workspaceEntryFixture;`;
  return (await import(`data:text/javascript;base64,${Buffer.from(fixture + output).toString("base64")}`))[name];
}
const QuestionBank = await component("../src/pages/ComputerWorkspace.tsx", "QuestionBank");
const Library = await component("../src/pages/MathWorkspace.tsx", "Library");

test("computer question bank opens sequential practice and loads practice chapters", () => {
  search = "";
  loads.length = 0;
  const html = renderToStaticMarkup(React.createElement(QuestionBank, { launch() {} }));
  assert.match(html, /class="active">逐题练习/);
  assert.doesNotMatch(html, /class="active">章节测评/);
  assert.equal(loads[0].path, "/api/exam/wx/practice/knowledge");
  assert.equal(loads[0].query.examType, 3);
});

test("math question bank opens the personal bookshelf with a path to discover more books", () => {
  search = "";
  const html = renderToStaticMarkup(React.createElement(Library, { stuid: "student" }));
  assert.match(html, /<h2>我的书架<\/h2>/);
  assert.match(html, /浏览教辅与真题/);
  assert.doesNotMatch(html, /搜索教辅和真题/);
});

test("math global search opens catalogue results instead of hiding the query behind the bookshelf", () => {
  search = "q=2025";
  const html = renderToStaticMarkup(React.createElement(Library, { stuid: "student" }));
  assert.doesNotMatch(html, /<h2>我的书架<\/h2>/);
  assert.match(html, /aria-label="搜索教辅和真题"[^>]*value="2025"/);
  assert.match(html, /我的书架/);
});

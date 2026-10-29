import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import React, { Suspense, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

async function component(path, name, scope, constants = []) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `render the actual ${name} component`);
  const values = constants.map(name => {
    const node = ast.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(ast) === name));
    assert.ok(node, `use the actual ${name} configuration`);
    return node.getText(ast);
  });
  const executable = ts.transpileModule([...values, declaration.getText(ast).replace(/^export\s+(?:default\s+)?/, "")].join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  return runInNewContext(`${executable}\n${name};`, { React, ...scope });
}

const icon = () => null;
const ComputerLearningSettings = await component("../../../src/features/computer/ComputerWorkspace.tsx", "ComputerLearningSettings", {
  ArrowLeft: icon,
  ComputerSubjects: () => React.createElement("h3", null, "管理自选科目"),
  useLoad: () => assert.fail("computer learning settings must not request source profile details"),
  request: () => assert.fail("computer learning settings must not save source profiles"),
  computerUpload: () => assert.fail("computer learning settings must not upload source avatars"),
});
let currentTab = "";
const PersonalCenter = await component("../../../src/features/identity/PersonalCenter.tsx", "PersonalCenter", {
  Suspense, useState,
  useSearchParams: () => [new URLSearchParams(currentTab ? { tab: currentTab } : {}), () => {}],
  useSession: () => ({ session: { user: { id: "web-student", username: "student", displayName: "Web 学习者" }, platforms: { math: { user: { UserNick: "source nickname" } } } }, refresh: async () => {} }),
  MathLearningPlan: ({ children }) => children,
  MathPreparationSettings: () => React.createElement("h2", { "data-math-preparation": true }, "备考设置"),
  MathAccountTools: ({ tab }) => React.createElement("h2", null, tab),
  MathQuestionReader: () => null,
  AccountProfile: ({ userId }) => React.createElement("div", { "data-account-profile": userId }, "Web 个人资料表单"),
  PasswordSettings: () => React.createElement("h2", null, "修改密码"),
  PersonalLearningAccount: () => React.createElement("h2", null, "我的小程序学习账号"),
  ComputerLearningSettings,
  ArrowLeft: icon, LoaderCircle: icon, LogOut: icon, UserRound: icon,
}, ["sections"]);

function renderTab(tab) {
  currentTab = tab;
  return renderToStaticMarkup(React.createElement(PersonalCenter, { settings: React.createElement("h2", null, "学习设置") }));
}

test("the Web profile belongs to my account and receives the Web user identity", () => {
  for (const tab of ["", "account"]) {
    const html = renderTab(tab);
    assert.match(html, /<h2>个人资料<\/h2>/);
    assert.match(html, /data-account-profile="web-student"/);
    assert.equal((html.match(/data-account-profile=/g) || []).length, 1);
    assert.match(html, /修改密码/);
    assert.doesNotMatch(html, /<h2>学习账号<\/h2>|显示名称|用户名<\/strong>/);
  }
  for (const tab of ["math", "computer", "settings", "source"]) {
    const html = renderTab(tab);
    assert.doesNotMatch(html, /data-account-profile|<h2>个人资料<\/h2>/, tab);
  }
});

test("math account tools open preparation settings and do not duplicate the profile tab", () => {
  const html = renderTab("math");
  assert.match(html, /class="active">备考设置<\/button>/);
  assert.match(html, /data-math-preparation="true"/);
  assert.match(html, /学习记录/);
  assert.match(html, /学习榜单/);
  assert.doesNotMatch(html, /个人资料|计算机学习资料|备考信息/);
});

test("computer account settings keep only the selected-subject manager", () => {
  const html = renderTab("computer");
  assert.match(html, /<h3>管理自选科目<\/h3>/);
  assert.equal((html.match(/<div class="panel">/g) || []).length, 1);
  assert.doesNotMatch(html, /个人资料|计算机学习资料|备考信息|保存学习资料|保存备考信息|<form|type="file"/);
});

test("computer learning settings retain their optional return-to-learning action", () => {
  const html = renderToStaticMarkup(React.createElement(ComputerLearningSettings));
  assert.doesNotMatch(html, /返回学习/);
  let closed = false;
  const tree = ComputerLearningSettings({ onClose: () => { closed = true; } });
  const button = React.Children.toArray(tree.props.children).find(child => child.type === "button");
  assert.ok(button);
  button.props.onClick();
  assert.equal(closed, true);
  assert.match(renderToStaticMarkup(tree), /返回学习/);
});

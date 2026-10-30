import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const file = "../../../src/features/computer/practice/ComputerQuestionTools.tsx";
const source = await readFile(new URL(file, import.meta.url), "utf8");
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ComputerQuestionTools");
assert.ok(component);
const executable = ts.transpileModule(component.getText(ast).replace(/^export default /, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React, jsxFactory: "element" },
}).outputText;
const nodes = tree => !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(nodes)
  : [tree, ...nodes(tree.props?.children)];
const textOf = tree => Array.isArray(tree) ? tree.map(textOf).join("") : tree && typeof tree === "object"
  ? textOf(tree.props?.children) : tree == null || typeof tree === "boolean" ? "" : String(tree);
function tools(mistake) {
  const render = runInNewContext(`${executable}\nComputerQuestionTools;`, {
    element: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => [initial, () => {}],
  });
  return render({ question: { exerciseId: "q1" }, majorId: "major", onRelated() {}, mistake });
}

test("the mistake action is filled exactly when its persisted controller is active", () => {
  let toggles = 0;
  const control = { active: true, busy: false, error: "", toggle: () => { toggles++; } };
  const active = nodes(tools(control)).find(node => node.type === "button" && node.props["aria-pressed"] === true);
  assert.equal(textOf(active), "移出错题本");
  assert.match(active.props.className, /btn-primary/);
  active.props.onClick();
  assert.equal(toggles, 1, "clicking the filled action directly asks its controller to remove");
  const inactive = nodes(tools({ ...control, active: false })).find(node => node.type === "button" && node.props["aria-pressed"] === false);
  assert.equal(textOf(inactive), "加入错题本");
  assert.match(inactive.props.className, /btn-secondary/);
  inactive.props.onClick();
  assert.equal(toggles, 2);
});

test("the mistake action disables during writes and exposes read retry without a success panel", () => {
  const busy = nodes(tools({ active: true, busy: true, error: "", toggle() {} }));
  const button = busy.find(node => node.type === "button" && node.props["aria-pressed"] === true);
  assert.equal(button.props.disabled, true);
  assert.equal(button.props["aria-busy"], true);
  let retries = 0;
  const failed = nodes(tools({ active: false, busy: false, error: "读取失败", retry: () => { retries++; }, toggle: () => assert.fail("retry must read membership before writing") }));
  const retry = failed.find(node => node.type === "button" && textOf(node) === "重新读取错题状态");
  retry.props.onClick();
  assert.equal(retries, 1);
  assert.equal(textOf(failed.find(node => node.props.role === "alert")), "读取失败");
  assert.equal(failed.some(node => node.props.className === "computer-notice"), false);
});

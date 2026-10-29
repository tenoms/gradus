import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const path = new URL("../../src/shared/ui/workspace-bar/WorkspaceBar.tsx", import.meta.url);
const source = await readFile(path, "utf8");
const ast = ts.createSourceFile(path.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const executable = ts.transpileModule(
  ast.statements.filter(node => !ts.isImportDeclaration(node))
    .map(node => node.getText(ast).replace(/^export\s+(?:default\s+)?/, "")).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } },
).outputText;

/** Run the actual shared controls with the renderer used by a source-extracted fixture. */
export function workspaceBarComponents(React) {
  return runInNewContext(`${executable}\n({ WorkspaceBar, WorkspaceTabs });`, { React });
}

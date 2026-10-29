import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../../../src/shared/lib/focus.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("focus.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const executable = ts.transpileModule(
  ast.statements.filter(node => !ts.isImportDeclaration(node))
    .map(node => node.getText(ast).replace(/^export\s+/, "")).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

function dialog(controls, { mounted = true } = {}) {
  const document = { activeElement: null };
  const focusCalls = [];
  const control = (id, properties = {}) => ({
    id, tagName: "BUTTON", type: "button", name: "", form: null,
    checked: false, disabled: false, offsetParent: {}, ...properties,
    focus() { document.activeElement = this; focusCalls.push(this.id); },
  });
  const previous = control("trigger");
  document.activeElement = previous;
  const items = controls.map(item => control(...item));
  const listeners = new Map();
  const root = {
    // Native querySelectorAll omits disabled controls; visibility is tested by the hook.
    querySelectorAll() { return items.filter(item => !item.disabled); },
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type, callback) {
      assert.equal(listeners.get(type), callback);
      listeners.delete(type);
    },
  };
  let cleanup;
  const useDialogFocus = runInNewContext(`${executable}\nuseDialogFocus;`, {
    document, useEffect: effect => { cleanup = effect(); },
  });
  useDialogFocus({ current: mounted ? root : null });
  return {
    items, document, focusCalls, listeners, control,
    key(key = "Tab", shiftKey = false) {
      const event = { key, shiftKey, prevented: false, preventDefault() { this.prevented = true; } };
      listeners.get("keydown")?.(event);
      return event;
    },
    unmount() { cleanup?.(); },
  };
}

const radio = (name, checked = false, form = null) => ({ tagName: "INPUT", type: "radio", name, checked, form });

test("the final selected light mode wraps to close and reverse Tab returns to light, not unchecked dark", () => {
  const f = dialog([
    ["close"], ["math-blue", radio("math", true)],
    ["system", radio("mode")], ["light", radio("mode", true)], ["dark", radio("mode")],
  ]);
  assert.equal(f.document.activeElement.id, "close");
  f.items[3].focus();
  assert.equal(f.key().prevented, true);
  assert.equal(f.document.activeElement.id, "close");
  assert.equal(f.key("Tab", true).prevented, true);
  assert.equal(f.document.activeElement.id, "light");
  assert.equal(f.items[4].checked, false);
  assert.equal(f.focusCalls.includes("dark"), false);
  f.unmount();
});

test("an unselected radio group uses its first enabled visible option", () => {
  const f = dialog([
    ["close"],
    ["disabled-checked", { ...radio("mode", true), disabled: true }],
    ["hidden-checked", { ...radio("mode", true), offsetParent: null }],
    ["system", radio("mode")], ["light", radio("mode")], ["dark", radio("mode")],
  ]);
  assert.equal(f.key("Tab", true).prevented, true);
  assert.equal(f.document.activeElement.id, "system");
  f.unmount();
});

test("radio groups with the same name in different forms retain independent Tab stops", () => {
  const firstForm = {}, secondForm = {};
  const f = dialog([
    ["close"], ["first-light", radio("mode", true, firstForm)], ["first-dark", radio("mode", false, firstForm)],
    ["second-light", radio("mode", true, secondForm)], ["second-dark", radio("mode", false, secondForm)],
  ]);
  f.key("Tab", true);
  assert.equal(f.document.activeElement.id, "second-light");
  f.unmount();
});

test("unnamed radio controls remain separate Tab stops", () => {
  const f = dialog([["close"], ["first", radio("")], ["last", radio("")]]);
  f.key("Tab", true);
  assert.equal(f.document.activeElement.id, "last");
  f.unmount();
});

test("the trap reads changed selections, visibility and newly rendered controls on each key event", () => {
  const f = dialog([["close"], ["light", radio("mode", true)], ["dark", radio("mode")]]);
  f.items[1].checked = false;
  f.items[2].checked = true;
  f.key("Tab", true);
  assert.equal(f.document.activeElement.id, "dark");
  f.items[2].offsetParent = null;
  f.items[0].focus();
  f.key("Tab", true);
  assert.equal(f.document.activeElement.id, "light");
  const added = f.control("added-action");
  f.items.push(added);
  f.items[0].focus();
  f.key("Tab", true);
  assert.equal(f.document.activeElement, added);
  f.unmount();
});

test("other controls keep their order, only boundary Tab is trapped, and cleanup restores the trigger", () => {
  const f = dialog([["close"], ["entry", { tagName: "TEXTAREA" }], ["help", { tagName: "A" }]]);
  f.items[1].focus();
  assert.equal(f.key().prevented, false);
  assert.equal(f.document.activeElement.id, "entry");
  assert.equal(f.key("Escape").prevented, false);
  f.items[2].focus();
  assert.equal(f.key().prevented, true);
  assert.equal(f.document.activeElement.id, "close");
  f.unmount();
  assert.equal(f.document.activeElement.id, "trigger");
  assert.equal(f.listeners.size, 0);
  assert.equal(f.focusCalls.filter(id => id === "trigger").length, 1);
  assert.equal(f.key().prevented, false);
});

test("empty dialogs trap Tab safely and a missing dialog does not install a listener", () => {
  const empty = dialog([]);
  assert.equal(empty.key().prevented, true);
  assert.equal(empty.document.activeElement.id, "trigger");
  empty.unmount();
  const missing = dialog([["close"]], { mounted: false });
  assert.equal(missing.listeners.size, 0);
  assert.deepEqual(missing.focusCalls, []);
  missing.unmount();
});

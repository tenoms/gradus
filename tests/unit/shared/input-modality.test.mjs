import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../../../src/shared/lib/input-modality.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const scope = { exports: {} };
runInNewContext(output, scope);
const { trackInputModality } = scope.exports;

const captureOptions = options => typeof options === "boolean" ? { capture: options } : options;
class TestDocument extends EventTarget {
  documentElement = { dataset: {} };
  registrations = [];
  focusCalls = 0;
  blurCalls = 0;
  activeElement = { focus: () => { this.focusCalls++; }, blur: () => { this.blurCalls++; } };

  addEventListener(type, listener, options) {
    this.registrations.push({ type, capture: !!captureOptions(options)?.capture });
    super.addEventListener(type, listener, captureOptions(options));
  }

  removeEventListener(type, listener, options) {
    // Node's boolean capture argument does not remove listeners like a browser's.
    super.removeEventListener(type, listener, captureOptions(options));
  }
}

function dispatch(doc, type, properties) {
  const event = Object.assign(new Event(type, { cancelable: true }), properties);
  assert.equal(doc.dispatchEvent(event), true, "tracking must not cancel native control interaction");
  assert.equal(event.defaultPrevented, false);
}
const pointer = (doc, pointerType = "mouse") => dispatch(doc, "pointerdown", { pointerType });
const key = (doc, value) => dispatch(doc, "keydown", { key: value });

test("pointer tracking covers mouse, touch and pen without moving or blurring focus", () => {
  const doc = new TestDocument(), focused = doc.activeElement;
  const cleanup = trackInputModality(doc);
  assert.equal(Object.hasOwn(doc.documentElement.dataset, "inputModality"), false, "native focus styles apply before an interaction");
  for (const pointerType of ["mouse", "touch", "pen"]) {
    key(doc, "Tab");
    pointer(doc, pointerType);
    assert.equal(doc.documentElement.dataset.inputModality, "pointer", pointerType);
  }
  assert.equal(doc.activeElement, focused);
  assert.equal(doc.focusCalls, 0);
  assert.equal(doc.blurCalls, 0);
  for (const type of ["pointerdown", "keydown"])
    assert.ok(doc.registrations.some(registration => registration.type === type && registration.capture), `${type} must be observed in capture`);
  cleanup();
});

test("Tab, arrows, Enter and typed characters restore keyboard focus indicators after a pointer action", () => {
  const doc = new TestDocument();
  const cleanup = trackInputModality(doc);
  for (const value of ["Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "a", "中", " "]) {
    pointer(doc);
    key(doc, value);
    assert.equal(doc.documentElement.dataset.inputModality, "keyboard", JSON.stringify(value));
  }
  assert.equal(doc.focusCalls, 0);
  assert.equal(doc.blurCalls, 0);
  cleanup();
});

test("standalone modifier keys do not turn pointer interaction into keyboard navigation", () => {
  const doc = new TestDocument();
  const cleanup = trackInputModality(doc);
  for (const value of ["Shift", "Control", "Alt", "Meta"]) {
    key(doc, value);
    assert.equal(Object.hasOwn(doc.documentElement.dataset, "inputModality"), false, value);
  }
  pointer(doc);
  for (const value of ["Shift", "Control", "Alt", "Meta"]) {
    key(doc, value);
    assert.equal(doc.documentElement.dataset.inputModality, "pointer", value);
  }
  key(doc, "Tab");
  key(doc, "Shift");
  assert.equal(doc.documentElement.dataset.inputModality, "keyboard");
  cleanup();
});

test("cleanup removes the modality marker and both listeners so native focus styling can resume", () => {
  const doc = new TestDocument();
  const cleanup = trackInputModality(doc);
  pointer(doc);
  assert.equal(doc.documentElement.dataset.inputModality, "pointer");
  cleanup();
  assert.equal(Object.hasOwn(doc.documentElement.dataset, "inputModality"), false);
  key(doc, "Tab");
  pointer(doc, "touch");
  assert.equal(Object.hasOwn(doc.documentElement.dataset, "inputModality"), false, "disposed tracking must not overwrite native mode");
  assert.equal(doc.focusCalls, 0);
  assert.equal(doc.blurCalls, 0);
});

test("documents track and dispose their input modality independently", () => {
  const first = new TestDocument(), second = new TestDocument();
  const cleanupFirst = trackInputModality(first), cleanupSecond = trackInputModality(second);
  pointer(first);
  assert.equal(first.documentElement.dataset.inputModality, "pointer");
  assert.equal(Object.hasOwn(second.documentElement.dataset, "inputModality"), false);
  key(second, "ArrowDown");
  assert.equal(second.documentElement.dataset.inputModality, "keyboard");
  assert.equal(first.documentElement.dataset.inputModality, "pointer");
  cleanupFirst();
  pointer(second, "touch");
  key(first, "Enter");
  assert.equal(Object.hasOwn(first.documentElement.dataset, "inputModality"), false);
  assert.equal(second.documentElement.dataset.inputModality, "pointer");
  cleanupSecond();
  assert.equal(Object.hasOwn(second.documentElement.dataset, "inputModality"), false);
});

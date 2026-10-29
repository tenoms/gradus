import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../../../src/features/computer/practice/ComputerRecordReset.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("ComputerRecordReset.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const hook = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "useComputerRecordReset");
const executable = ts.transpileModule(hook.getText(ast).replace("export ", ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const rows = [{ id: "own-one", title: "第一组", answered: 3 }, { id: "own-two", title: "第二组", answered: 5 }];

function controller({ reset = async () => {}, refresh = async () => {} } = {}) {
  const values = [], refs = [], dependencies = [];
  let cursor = 0, refCursor = 0, effectCursor = 0, dirty = false, effects = [];
  const create = runInNewContext(`${executable}\nuseComputerRecordReset;`, {
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [values[index], next => { values[index] = typeof next === "function" ? next(values[index]) : next; dirty = true; }];
    },
    useRef(initial) { const index = refCursor++; return refs[index] ||= { current: initial }; },
    useEffect(effect, deps) {
      const index = effectCursor++;
      if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) effects.push(effect);
      dependencies[index] = deps;
    },
    computerLearningApi: { resetRecords: reset },
  });
  const fixture = {
    options: { records: rows, scope: "chapter-one", refresh },
    render() {
      do {
        dirty = false; cursor = 0; refCursor = 0; effectCursor = 0; effects = [];
        fixture.current = create(fixture.options);
        effects.forEach(effect => effect());
      } while (dirty);
      return fixture.current;
    },
    act(method, ...args) { fixture.current[method](...args); return fixture.render(); },
  };
  fixture.render();
  return fixture;
}

test("reset selection can be reviewed and cancelled without modifying records", () => {
  let writes = 0;
  const f = controller({ reset: async () => { writes++; } });
  f.act("start"); f.act("toggle", "own-two"); f.act("open");
  assert.equal(f.current.confirming, true);
  assert.deepEqual(Array.from(f.current.review, row => row.id), ["own-two"]);
  f.act("close");
  assert.equal(f.current.confirming, false);
  assert.deepEqual(Array.from(f.current.selected), ["own-two"]);
  assert.equal(writes, 0);
});

test("confirm resets only reviewed records once, waits for fresh progress and then clears selection", async () => {
  const resetGate = deferred(), refreshGate = deferred(), writes = [];
  let reads = 0;
  const f = controller({ reset: async ids => { writes.push(Array.from(ids)); await resetGate.promise; }, refresh: async () => { reads++; await refreshGate.promise; } });
  f.act("start"); f.act("toggle", "own-one"); f.act("open");
  const completed = f.current.confirm(); f.render();
  assert.equal(f.current.phase, "resetting");
  f.act("close"); assert.equal(f.current.confirming, true, "pending requests cannot be dismissed");
  await f.current.confirm(); assert.equal(writes.length, 1, "double clicks do not duplicate reset requests");
  resetGate.resolve(); await new Promise(done => setImmediate(done)); f.render();
  assert.equal(f.current.phase, "refreshing");
  assert.equal(f.current.selected.length, 1, "readback completes before selection is cleared");
  refreshGate.resolve(); await completed; f.render();
  assert.deepEqual(writes, [["own-one"]]); assert.equal(reads, 1);
  assert.equal(f.current.confirming, false); assert.equal(f.current.selecting, false);
  assert.equal(f.current.selected.length, 0); assert.match(f.current.notice, /进度已更新/);
});

test("failed resets preserve selection for retry, while failed readback retries only the read", async () => {
  let writes = 0, reads = 0, failWrite = true, failRead = true;
  const f = controller({ reset: async () => { writes++; if (failWrite) throw new Error("暂不可用"); }, refresh: async () => { reads++; if (failRead) throw new Error("读取失败"); } });
  f.act("start"); f.act("toggle", "own-two"); f.act("open");
  await f.current.confirm(); f.render();
  assert.match(f.current.error, /重置未完成/); assert.equal(f.current.selected.length, 1); assert.equal(reads, 0);
  failWrite = false;
  await f.current.confirm(); f.render();
  assert.match(f.current.error, /记录已重置.*刷新失败/); assert.equal(f.current.applied, true); assert.equal(f.current.selected.length, 1);
  f.act("close");
  assert.equal(f.current.confirming, false); assert.equal(f.current.selected.length, 0);
  assert.match(f.current.notice, /进度暂未刷新/);
  failRead = false;
  await f.current.confirm(); f.render();
  assert.equal(writes, 2, "readback retry must not reset records a second time"); assert.equal(reads, 2);
  assert.equal(f.current.selected.length, 0); assert.equal(f.current.confirming, false);
});

test("changing chapters or practice categories discards stale selections", () => {
  const f = controller();
  f.act("start"); f.act("selectAll"); f.act("open");
  f.options = { ...f.options, scope: "chapter-two" }; f.render();
  assert.equal(f.current.selected.length, 0); assert.equal(f.current.selecting, false); assert.equal(f.current.confirming, false);
});

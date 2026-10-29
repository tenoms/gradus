import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const resourceDirectory = new URL("../../../src/features/admin/resources/", import.meta.url);
const dataSource = await readFile(new URL("resource-data.ts", resourceDirectory), "utf8");
const dataCode = ts.transpileModule(dataSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const resourceData = await import(`data:text/javascript;base64,${Buffer.from(dataCode).toString("base64")}`);
const source = {};
for (const file of ["ResourceManager", "ResourceDialog"]) {
  const text = await readFile(new URL(`${file}.tsx`, resourceDirectory), "utf8");
  const ast = ts.createSourceFile(`${file}.tsx`, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  source[file] = ts.transpileModule(ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast).replace(/^export\s+(?:default\s+)?/, "")).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React, jsxFactory: "element" },
  }).outputText;
}
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
const row = { sourceId: "public-math-source", platform: "math", key: "a".repeat(64), scope: "public", kind: "math.books", path: "/books", title: "高等数学", revision: 3, syncedAt: "2026-10-29T03:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", mediaCount: 1, entityCount: 2 };
const detail = { ...row, request: { path: "/books", data: {} }, response: { books: [{ title: "高等数学" }] }, source: { id: row.sourceId, platform: "math", accountRef: "" }, media: [], entities: [] };
const page = { resources: [row], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 }, summary: { total: 1, fresh: 1, expired: 0, mediaReferences: 1 }, facets: { kinds: [{ value: "math.books", count: 1 }], sources: [{ ...detail.source, count: 1 }] } };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(done => setImmediate(done));
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.children)];
}
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node == null || typeof node === "boolean") return "";
  return typeof node === "object" ? textOf(node.children) : String(node);
}
function controller(component, options, request) {
  const values = [], refs = [], dependencies = [], cleanup = [];
  let cursor = 0, refCursor = 0, effectCursor = 0, dirty = false, effects = [];
  const executable = component === "ResourceDialog" ? source.ResourceDialog : source.ResourceManager;
  const fixture = { options, calls: [] };
  const create = runInNewContext(`${executable}\n${component};`, {
    ...resourceData, ApiError, URLSearchParams, React: { Fragment: "fragment" },
    element: (type, props, ...children) => ({ type, props: props || {}, children }),
    ...Object.fromEntries(["Check", "CircleAlert", "Clock3", "Database", "Download", "Edit3", "ExternalLink", "FileJson", "Layers3", "Link2", "LoaderCircle", "RefreshCw", "Search", "SlidersHorizontal", "Trash2", "X"].map(name => [name, name])),
    ResourceDialog: "ResourceDialog", Pagination: "Pagination", useDialogFocus() {},
    api: async (path, input) => { fixture.calls.push({ path, input }); return request(path, input); },
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [values[index], next => { values[index] = typeof next === "function" ? next(values[index]) : next; dirty = true; }];
    },
    useRef(initial) { const index = refCursor++; return refs[index] ||= { current: initial }; },
    useEffect(effect, deps) {
      const index = effectCursor++;
      if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) effects.push(() => { cleanup[index]?.(); cleanup[index] = effect(); });
      dependencies[index] = deps;
    },
  });
  Object.assign(fixture, {
    render() {
      do {
        dirty = false; cursor = 0; refCursor = 0; effectCursor = 0; effects = [];
        fixture.tree = create(fixture.options);
        effects.forEach(effect => effect());
      } while (dirty);
      return fixture.tree;
    },
    find(predicate) { const result = nodes(fixture.tree).find(predicate); assert.ok(result, "expected interaction exists"); return result; },
    button(label) { return fixture.find(node => node.type === "button" && (textOf(node) === label || node.props["aria-label"] === label)); },
    click(label) { fixture.button(label).props.onClick(); fixture.render(); },
    async flush() { await tick(); fixture.render(); },
  });
  fixture.render(); return fixture;
}
function batchFixture(request, extra = {}) {
  const events = { closed: 0, reloaded: 0, messages: [] };
  const fixture = controller("BatchDialog", {
    action: "delete", resources: [row], onClose: () => { events.closed++; }, onReload: () => { events.reloaded++; }, onChanged: text => events.messages.push(text), ...extra,
  }, request);
  return { fixture, events };
}

test("resource batch submits the reviewed identities once and locks dismissal while pending", async () => {
  const gate = deferred();
  const { fixture: f, events } = batchFixture(async () => { await gate.promise; return { count: 1 }; });
  const submit = f.button("确认删除资源").props.onClick;
  submit(); f.render(); submit(); f.render();
  assert.equal(f.calls.length, 1);
  assert.deepEqual(JSON.parse(f.calls[0].input.body), { action: "delete", resources: [{ platform: row.platform, sourceId: row.sourceId, key: row.key, revision: 3 }] });
  assert.equal(f.button("取消操作").props.disabled, true);
  f.tree.props.onClick(); f.tree.children[0].props.onKeyDown({ key: "Escape" });
  assert.equal(events.closed, 0);
  gate.resolve(); await f.flush();
  assert.equal(events.messages.length, 1); assert.match(events.messages[0], /已删除 1 份/);
});

test("batch conflicts preserve the review and require refreshed identities before another write", async () => {
  const { fixture: f, events } = batchFixture(async () => { throw new ApiError("资源已更新", 409); });
  f.click("确认删除资源"); await f.flush();
  assert.match(textOf(f.tree), /本次操作未执行，所选资源均未更改/);
  assert.equal(f.button("确认删除资源").props.disabled, true);
  f.click("重新读取目录并选择");
  assert.equal(events.reloaded, 1); assert.equal(events.messages.length, 0);
});

test("a lost batch response asks for readback instead of claiming unchanged records or resending", async () => {
  const { fixture: f } = batchFixture(async () => { throw new Error("网络断开"); });
  f.click("确认删除资源"); await f.flush();
  assert.match(textOf(f.tree), /未能确认操作结果.*重新读取目录核实/);
  assert.doesNotMatch(textOf(f.tree), /均未更改/);
  assert.equal(f.button("确认删除资源").props.disabled, true);
  f.button("确认删除资源").props.onClick(); await f.flush();
  assert.equal(f.calls.length, 1);
});

test("a successful resource mutation refreshes the directory, clears selection and preserves success if readback fails", async () => {
  let reads = 0;
  const f = controller("ResourceManager", {}, async () => { if (++reads > 1) throw new Error("目录暂不可用"); return page; });
  await f.flush();
  f.find(node => node.type === "input" && node.props["aria-label"] === "选择当前页全部资源").props.onChange({ target: { checked: true } }); f.render();
  assert.equal(f.button("删除所选").props.disabled, false);
  f.click("管理资源 高等数学");
  f.find(node => node.type === "ResourceDialog").props.onChanged("资源已保存"); f.render(); await f.flush();
  assert.equal(reads, 2); assert.match(textOf(f.tree), /资源已保存/); assert.match(textOf(f.tree), /目录未能刷新.*目录暂不可用/);
  assert.equal(f.button("删除所选").props.disabled, true);
  f.click("重新读取目录"); await f.flush(); assert.equal(reads, 3);
  assert.equal(f.calls.every(call => !call.input), true, "readback retries never replay the mutation");
});

test("invalid JSON never reaches the write API and unsaved changes require a close decision", async () => {
  let closed = 0;
  const f = controller("ResourceDialog", { item: row, onClose: () => { closed++; }, onChanged() {} }, async () => detail);
  await f.flush(); f.click("编辑内容");
  f.find(node => node.type === "textarea").props.onChange({ target: { value: '{"books":' } }); f.render();
  f.click("保存资源内容"); await f.flush();
  assert.equal(f.calls.length, 1); assert.match(textOf(f.tree), /不是有效的 JSON/);
  f.click("关闭资源详情"); assert.equal(closed, 0); assert.match(textOf(f.tree), /放弃尚未保存的修改/);
  f.click("返回编辑"); assert.match(textOf(f.tree), /不是有效的 JSON/);
  f.click("关闭资源详情"); f.click("放弃修改并关闭"); assert.equal(closed, 1);
});

test("editing a stale resource keeps the draft until the operator reloads the latest revision", async () => {
  let reads = 0;
  const f = controller("ResourceDialog", { item: row, onClose() {}, onChanged() {} }, async (_path, input) => {
    if (input) throw new ApiError("资源已更新，请重新读取", 409);
    return { ...detail, revision: ++reads === 1 ? 3 : 4 };
  });
  await f.flush(); f.click("编辑内容");
  f.find(node => node.type === "textarea").props.onChange({ target: { value: '{"books":[]}' } }); f.render();
  f.click("保存资源内容"); await f.flush();
  assert.equal(f.button("保存资源内容").props.disabled, true);
  assert.equal(f.find(node => node.type === "textarea").props.value, '{"books":[]}');
  f.click("重新读取最新资源"); await f.flush();
  assert.match(textOf(f.tree), /版本 4/); assert.equal(reads, 2);
});

test("resource content accepts objects and arrays but rejects scalar or malformed JSON", () => {
  assert.deepEqual(resourceData.parseResource("[]"), []);
  assert.deepEqual(resourceData.parseResource('{"data":[]}'), { data: [] });
  for (const value of ["null", "true", "3", '"text"', "{"]) assert.throws(() => resourceData.parseResource(value));
});

test("resource directory uses business names and Chinese labels without exposing transport identifiers", async () => {
  const named = { ...row, platform: "computer", title: "操作系统强化课程", typeLabel: "课程课时", subtitle: "内存管理 · 第三讲", kind: "computer.lessons", path: "/api/wx/course/getLessonList", sourceId: "b".repeat(64) };
  const data = { ...page, resources: [named], facets: { kinds: [{ value: named.kind, label: "课程课时", count: 1 }], sources: [{ id: named.sourceId, platform: "computer", accountRef: "private-raw-reference", label: "计算机 408 公共课程库", count: 1 }] } };
  const f = controller("ResourceManager", {}, async () => data);
  await f.flush();
  const text = textOf(f.tree);
  assert.match(text, /操作系统强化课程/); assert.match(text, /内存管理 · 第三讲/);
  assert.match(text, /课程课时/); assert.match(text, /计算机 408 公共课程库/);
  for (const identifier of [named.path, named.kind, named.sourceId, "private-raw-reference"]) assert.equal(text.includes(identifier), false, identifier);
  assert.equal(nodes(f.tree).some(node => String(node.props?.title || "").includes(named.sourceId)), false, "hover titles do not reveal source hashes");
});

test("resource details keep technical identifiers in a collapsed section and label content indexes in Chinese", async () => {
  const response = { ...detail, typeLabel: "课程课时", subtitle: "操作系统 · 内存管理", sourceId: "c".repeat(64), path: "/api/wx/course/getLessonList", kind: "computer.lessons", command: "GetLessons", source: { ...detail.source, accountRef: "source-account-001", label: "课程共享资源" }, entities: [{ kind: "question", count: 3 }] };
  const f = controller("ResourceDialog", { item: response, onClose() {}, onChanged() {} }, async () => response);
  await f.flush();
  const technical = f.find(node => node.type === "details" && nodes(node).some(child => child.type === "summary" && textOf(child) === "技术信息"));
  assert.equal(technical.props.open, undefined);
  const technicalText = textOf(technical);
  for (const identifier of [response.path, response.sourceId, response.kind, response.command, response.source.accountRef]) assert.ok(technicalText.includes(identifier), identifier);
  const publicText = node => Array.isArray(node) ? node.map(publicText).join("") : !node || typeof node !== "object" ? textOf(node) : node === technical ? "" : publicText(node.children);
  const overview = publicText(f.tree);
  assert.match(overview, /课程课时/); assert.match(overview, /操作系统 · 内存管理/); assert.match(overview, /课程共享资源/); assert.match(overview, /题目3/);
  assert.equal(overview.includes(response.path), false); assert.equal(overview.includes(response.sourceId), false); assert.equal(overview.includes(response.kind), false);
});

test("missing business names and source labels fall back to readable categories rather than paths or hashes", () => {
  for (const title of [row.path, row.kind, "f".repeat(64), "/api/books/GetList"]) {
    assert.equal(resourceData.displayName({ ...row, title }), "教辅书籍");
  }
  assert.equal(resourceData.displayName({ ...row, title: "GetLessons", command: "GetLessons", typeLabel: "课程课时" }), "课程课时");
  assert.equal(resourceData.sourceName({ id: "f".repeat(64), platform: "math", accountRef: "private-source-ref" }), "考研数学账号资源");
  assert.equal(resourceData.entityName("analysis"), "题目解析"); assert.equal(resourceData.entityName("file"), "附件");
});

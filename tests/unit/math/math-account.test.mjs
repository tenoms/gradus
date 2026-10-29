import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createProfileAvatar } from "../../../src/features/math/profile/profile-avatar.ts";

const source = await readFile(new URL("../../../src/features/math/profile/MathStudyProfile.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("MathStudyProfile.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "MathStudyProfile");
assert.ok(component, "regressions execute the actual profile component");
const executable = ts.transpileModule(component.getText(ast).replace(/^export\s+default\s+/, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React, jsxFactory: "element" },
}).outputText;
const profile = {
  nickname: "Web 学习者", avatar: "", subject: "数一", examYear: "2027", province: "浙江省",
  major: "计算机科学与技术", preparationStatus: "应届", reviewMonth: "3月",
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

// Execute component state, effects and event handlers. Inert JSX children keep
// the tests focused on user-visible fields and the real save orchestration.
function editor({ read = async () => structuredClone(profile), save = async value => value, sync = async () => {}, refresh = async () => {}, avatar = async () => "data:image/webp;base64,YXZhdGFy" } = {}) {
  const hooks = [], calls = [], events = [], avatarFiles = [];
  let cursor = 0, dirty = true, pending = [], tree;
  const scope = {
    Error,
    element: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === "function" ? initial() : initial };
      return [hooks[index].value, value => {
        const next = typeof value === "function" ? value(hooks[index].value) : value;
        if (!Object.is(next, hooks[index].value)) { hooks[index].value = next; dirty = true; }
      }];
    },
    useEffect(effect, dependencies) {
      const index = cursor++, previous = hooks[index];
      if (!previous || dependencies.some((value, offset) => !Object.is(value, previous.dependencies[offset]))) {
        pending.push(() => { previous?.cleanup?.(); hooks[index] = { dependencies, cleanup: effect() }; });
      }
    },
    useSession: () => ({ refresh: async () => { events.push("session.refresh"); await refresh(); } }),
    retryStudySync: async () => { events.push("study.sync"); await sync(); },
    createProfileAvatar: async file => { avatarFiles.push(file); return avatar(file); },
    api: async (path, options = {}) => {
      assert.equal(path, "/api/learning/profile/math", "personal data only uses the owned Web endpoint");
      const method = options.method || "GET", body = options.body ? JSON.parse(options.body) : undefined;
      calls.push({ path, method, body }); events.push(`api.${method}`);
      return { profile: method === "GET" ? await read() : await save(body) };
    },
  };
  for (const name of ["Camera", "LoaderCircle", "Save", "UserRound"]) scope[name] = name;
  const MathStudyProfile = runInNewContext(`${executable}\nMathStudyProfile;`, scope);
  function render() {
    let attempts = 0;
    while (dirty) {
      assert.ok(++attempts < 30, "profile effects settle without a render loop");
      dirty = false; cursor = 0; pending = [];
      tree = MathStudyProfile({ user: { ID: "web-student", StuID: "web-student", UserNick: "stale platform name" } });
      for (const effect of pending) effect();
    }
    return tree;
  }
  async function settle() {
    for (let attempt = 0; attempt < 20; attempt++) {
      render(); await new Promise(resolve => setImmediate(resolve));
      if (!dirty) return;
    }
    assert.fail("profile asynchronous work did not settle");
  }
  function elements(predicate, node) {
    if (arguments.length < 2) node = tree;
    if (Array.isArray(node)) return node.flatMap(child => elements(predicate, child));
    if (!node || typeof node !== "object") return [];
    return [...(predicate(node) ? [node] : []), ...elements(predicate, node.props?.children)];
  }
  function textOf(node) {
    if (arguments.length === 0) node = tree;
    if (Array.isArray(node)) return node.map(child => textOf(child)).join("");
    if (node == null || typeof node === "boolean") return "";
    return typeof node === "object" ? textOf(node.props?.children) : String(node);
  }
  function control(label) {
    const field = elements(node => node.type === "label" && node.props.children.filter(child => typeof child === "string").join("").trim() === label)[0];
    assert.ok(field, `visible field: ${label}`);
    return elements(node => ["input", "select", "textarea"].includes(node.type), field)[0]?.props;
  }
  render();
  return {
    calls, events, avatarFiles, render, settle, elements, textOf, control,
    change: (label, value) => { control(label).onChange({ target: { value } }); render(); },
    fileInput: () => elements(node => node.type === "input" && node.props.type === "file")[0]?.props,
    submit: () => elements(node => node.type === "form")[0].props.onSubmit({ preventDefault() {} }),
    button: label => elements(node => node.type === "button" && textOf(node) === label)[0]?.props,
    fieldset: () => elements(node => node.type === "fieldset")[0]?.props,
    error: () => elements(node => node.props?.role === "alert").map(node => textOf(node)).join(""),
    notice: () => elements(node => node.props?.className === "math-account-notice").map(node => textOf(node)).join(""),
    unmount: () => { for (const hook of hooks) hook.cleanup?.(); },
  };
}

test("personal profiles load only Web-owned fields and remove source survey and school controls", async () => {
  const loaded = deferred(), view = editor({ read: () => loaded.promise });
  assert.match(view.textOf(), /正在读取个人资料/);
  assert.equal(view.elements(node => node.type === "form").length, 0);
  loaded.resolve(structuredClone(profile)); await view.settle();
  for (const [label, value] of [["昵称", profile.nickname], ["数学类别", "数一"], ["考研年份", "2027"], ["所在省份", "浙江省"], ["报考专业", profile.major], ["备考状态", "应届"], ["开始复习月份", "3月"]])
    assert.equal(view.control(label).value, value);
  for (const removed of ["补充备考资料", "本科学校", "目标院校", "姓名", "QQ", "目标分数", "跨专业报考", "同时使用的学习应用", "其他备考问题"])
    assert.equal(view.textOf().includes(removed), false, removed);
  assert.equal(view.elements(node => ["details", "datalist"].includes(node.type)).length, 0);
  assert.equal(view.calls.length, 1);
  assert.equal(view.calls[0].method, "GET");
  view.unmount();
});

test("editing all retained fields and a local avatar saves one Web profile before syncing the session", async () => {
  const view = editor(); await view.settle();
  const next = { nickname: "新昵称", avatar: "data:image/webp;base64,YXZhdGFy", subject: "数二", examYear: "2028", province: "江苏省", major: "电子信息", preparationStatus: "在职", reviewMonth: "6月" };
  for (const [label, value] of [["昵称", next.nickname], ["数学类别", next.subject], ["考研年份", next.examYear], ["所在省份", next.province], ["报考专业", next.major], ["备考状态", next.preparationStatus], ["开始复习月份", next.reviewMonth]]) view.change(label, value);
  const file = { type: "image/png", name: "avatar.png" };
  view.fileInput().onChange({ target: { files: [file] } }); await view.settle();
  assert.equal(view.avatarFiles[0], file);
  assert.equal(view.calls.length, 1, "selecting an avatar does not upload to a YYB source");
  assert.equal(view.elements(node => node.type === "img")[0].props.src, next.avatar);
  await view.submit(); await view.settle();
  assert.equal(view.calls.length, 2);
  assert.equal(view.calls[1].method, "PUT");
  assert.deepEqual(view.calls[1].body, next);
  assert.deepEqual(view.events, ["api.GET", "api.PUT", "study.sync", "session.refresh"]);
  assert.match(view.notice(), /个人资料已保存/);
  assert.equal(view.fieldset().disabled, false);
  view.unmount();
});

test("save success waits for both study synchronization and session refresh", async () => {
  const synchronization = deferred(), refreshed = deferred();
  const view = editor({ sync: () => synchronization.promise, refresh: () => refreshed.promise });
  await view.settle(); view.change("数学类别", "数三");
  const submitted = view.submit(); await view.settle();
  assert.deepEqual(view.events, ["api.GET", "api.PUT", "study.sync"]);
  assert.equal(view.fieldset().disabled, true);
  assert.equal(view.fileInput().disabled, true);
  assert.equal(view.notice(), "");
  synchronization.resolve(); await view.settle();
  assert.deepEqual(view.events, ["api.GET", "api.PUT", "study.sync", "session.refresh"]);
  assert.equal(view.fieldset().disabled, true);
  assert.equal(view.notice(), "");
  refreshed.resolve(); await submitted; await view.settle();
  assert.equal(view.fieldset().disabled, false);
  assert.match(view.notice(), /个人资料已保存/);
  view.unmount();
});

test("failed profile reads show a working retry without acquiring a source account", async () => {
  let attempts = 0;
  const view = editor({ read: async () => { if (++attempts === 1) throw new Error("Web 服务暂不可用"); return structuredClone(profile); } });
  await view.settle();
  assert.match(view.error(), /Web 服务暂不可用/);
  assert.equal(view.elements(node => node.type === "form").length, 0);
  view.button("重新读取").onClick(); await view.settle();
  assert.equal(view.control("昵称").value, profile.nickname);
  assert.equal(view.calls.length, 2);
  assert.ok(view.calls.every(call => call.method === "GET"));
  view.unmount();
});

test("failed saves retain the entered profile and can be retried without reporting success", async () => {
  let attempts = 0;
  const view = editor({ save: async value => { if (++attempts === 1) throw new Error("资料保存失败，请重试"); return value; } });
  await view.settle(); view.change("报考专业", "应用统计");
  await view.submit(); await view.settle();
  assert.match(view.error(), /资料保存失败/);
  assert.equal(view.control("报考专业").value, "应用统计");
  assert.equal(view.fieldset().disabled, false);
  assert.equal(view.notice(), "");
  assert.deepEqual(view.events, ["api.GET", "api.PUT"]);
  await view.submit(); await view.settle();
  assert.equal(view.calls[2].body.major, "应用统计");
  assert.equal(view.error(), "");
  assert.match(view.notice(), /个人资料已保存/);
  view.unmount();
});

test("avatar selection errors leave the previous avatar and allow the learner to continue", async () => {
  const view = editor({ avatar: async () => { throw new Error("请选择有效头像"); } });
  await view.settle();
  view.fileInput().onChange({ target: { files: [{ type: "image/png" }] } }); await view.settle();
  assert.match(view.error(), /请选择有效头像/);
  assert.equal(view.fileInput().disabled, false);
  assert.equal(view.elements(node => node.type === "img").length, 0);
  assert.equal(view.calls.length, 1);
  view.unmount();
});

test("local avatar preparation rejects unsupported formats before decoding or uploading", async () => {
  await assert.rejects(createProfileAvatar(new File(["fixture"], "avatar.gif", { type: "image/gif" })), /PNG、JPEG 或 WebP/);
});

test("local avatar preparation rejects oversized images before decoding or uploading", async () => {
  await assert.rejects(createProfileAvatar({ type: "image/png", size: 10 * 1024 * 1024 + 1 }), /10MB/);
});

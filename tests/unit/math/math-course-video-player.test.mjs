import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { durationSeconds, videoProgressRecord } from "../../../src/features/math/courses/course-model.mjs";
import { mathVideoSource } from "../../../src/features/math/media/math-video-source.mjs";

const files = await Promise.all(["MathCourses", "MathCourseRecommendations"].map(async name => {
  const path = new URL(`../../../src/features/math/courses/${name}.tsx`, import.meta.url);
  const source = await readFile(path, "utf8");
  return [name, ts.createSourceFile(path.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)];
}));
const sources = Object.fromEntries(files);
function compile(file, name) {
  const ast = sources[file];
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(component, `${file} contains ${name}`);
  return ts.transpileModule(component.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React, jsxFactory: "element" },
  }).outputText + `\n${name};`;
}
const courseCode = compile("MathCourses", "NativeVodPlayer");
const specialCode = compile("MathCourseRecommendations", "SpecialVideos");
const productCode = compile("MathCourses", "Product");
const nodes = tree => !tree || typeof tree !== "object" ? [] : [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)];
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// Execute real parent components and hooks. Media retrieval/recovery belongs to
// MathVideoPlayer; these tests exercise the course's readiness and business events.
function mount(code, props, extra = {}) {
  const states = [], refs = [], effects = [];
  const listeners = { document: new Map(), window: new Map() };
  const surface = name => ({
    addEventListener: (event, handler) => listeners[name].set(event, handler),
    removeEventListener: (event, handler) => { if (listeners[name].get(event) === handler) listeners[name].delete(event); },
  });
  const document = { ...surface("document"), hidden: false };
  let stateCursor, refCursor, effectCursor, tree, mountedMedia;
  const scope = {
    React: { Fragment: "Fragment" }, document, window: surface("window"),
    element: (type, properties, ...children) => ({ type, props: { ...properties, children } }),
    useState(initial) {
      const index = stateCursor++;
      if (!Object.hasOwn(states, index)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useRef(initial) { return refs[refCursor++] ||= { current: initial }; },
    useEffect(setup, dependencies) {
      const index = effectCursor++;
      const previous = effects[index];
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i]))
        effects[index] = { dependencies, setup, previous, pending: true };
    },
    durationSeconds, videoProgressRecord, mathVideoSource,
    mathRows: response => Array.isArray(response?.data) ? response.data : [],
    mathData: response => response?.data,
    courseLabel: row => row.Title || row.Name || "课程视频",
    ...Object.fromEntries(["MathVideoPlayer", "MathQuestionVideo", "MathVideoFeedback", "Files", "LoaderCircle", "ArrowLeft", "Status", "Back", "RichContent"].map(name => [name, name])),
    ...extra,
  };
  const Component = runInNewContext(code, scope);
  function render(media) {
    stateCursor = refCursor = effectCursor = 0;
    tree = Component(props);
    const player = nodes(tree).find(node => node.type === "MathVideoPlayer");
    if (player?.props.ref && media) player.props.ref.current = mountedMedia = media;
    for (const effect of effects) if (effect.pending) {
      effect.previous?.cleanup?.();
      effect.cleanup = effect.setup();
      effect.pending = false;
    }
    return tree;
  }
  render();
  return {
    render, listeners, find: predicate => nodes(tree).find(predicate),
    fire(event, position = mountedMedia.currentTime) {
      mountedMedia.currentTime = position;
      nodes(tree).find(node => node.type === "MathVideoPlayer").props[event]?.({ currentTarget: mountedMedia });
    },
    pagehide() { listeners.window.get("pagehide")?.(); },
    hide() { document.hidden = true; listeners.document.get("visibilitychange")?.(); },
    unmount() {
      if (mountedMedia) {
        mountedMedia.currentTime = 0;
        mountedMedia.duration = NaN;
        for (const ref of refs) if (ref.current === mountedMedia) ref.current = null;
      }
      for (const effect of effects) effect.cleanup?.();
    },
  };
}

const context = { StuID: "web-student", CourseID: 5, CalendarID: 6, ProductID: 7 };
const task = { BusID: 9, Data: { ID: 11, Title: "课程课时", PolyvVID: "course-video", VideoUrl: "https://media.example.test/old.mp4", Duration: 100 } };

test("course video waits for private records before mounting the shared cache/recovery player", async () => {
  const records = deferred(), calls = [], writes = [], activities = [];
  let saved = 0;
  const view = mount(courseCode, { task, context, onSaved() { saved++; }, onRetry() {} }, {
    courseApi: {
      records: input => { calls.push(structuredClone(input)); return records.promise; },
      saveRecord: async input => { writes.push(structuredClone(input)); return { data: 19 }; },
    },
    recordActivity: activity => activities.push(activity),
  });
  assert.equal(view.find(node => node.type === "MathVideoPlayer"), undefined, "an early URL response cannot start playback before resume records");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { ...context, BusType: 2, BusID: 9 });
  records.resolve({ data: [{ ID: 19, BusValue: 46 }] });
  await settle();
  const media = { currentTime: 0, duration: 100 };
  view.render(media);
  const player = view.find(node => node.type === "MathVideoPlayer");
  assert.deepEqual(structuredClone(player.props.origin), { kind: "course", calendarId: 6, productId: 7, itemId: 9 });
  assert.equal(player.props.row, task.Data, "the shared player receives authoritative source fields rather than a pre-resolved URL");
  player.props.onLoadedMetadata({ currentTarget: media });
  assert.equal(media.currentTime, 46);
  player.props.onPlaying();
  player.props.onPlaying();
  assert.equal(activities.length, 1, "refresh and buffering playing events do not duplicate the business activity");
  media.currentTime = 70;
  player.props.onTimeUpdate({ currentTarget: media });
  await settle();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].BusValue, 70);
  assert.equal(writes[0].ID, 19);
  assert.equal(writes[0].BusID, 9);
  assert.equal(saved, 1);
  media.currentTime = 90;
  player.props.onEnded();
  await settle();
  assert.equal(writes[1].IsFinished, 1, "existing completion threshold and progress persistence remain active");
});

test("failed course-record loading keeps playback gated and offers the record retry", async () => {
  const records = deferred();
  let retries = 0;
  const view = mount(courseCode, { task, context, onSaved() {}, onRetry() { retries++; } }, {
    courseApi: { records: () => records.promise }, recordActivity() {},
  });
  records.reject(new Error("records unavailable"));
  await settle();
  view.render();
  assert.equal(view.find(node => node.type === "MathVideoPlayer"), undefined);
  assert.ok(view.find(node => node.props.role === "alert"));
  view.find(node => node.type === "button" && node.props.children.includes("重试")).props.onClick();
  assert.equal(retries, 1);
});

test("direct and provider-only special videos share scoped cache recovery and deduplicate study events", async () => {
  const activities = [], requests = [];
  const videos = [
    { ID: 101, Name: "直链专题", VideoUrl: "https://media.example.test/special.mp4", PolyvVID: "direct-vid" },
    { ID: 102, Name: "VID专题", VideoUrl: "provider-only-vid" },
  ];
  const view = mount(specialCode, { LinkSort: 88, onClose() {} }, {
    recommendationApi: { videos: async id => { requests.push(id); return { data: videos }; } },
    recordStudy: activity => activities.push(activity),
  });
  await settle();
  view.render();
  let player = view.find(node => node.type === "MathVideoPlayer");
  assert.equal(requests.length, 1);
  assert.deepEqual(structuredClone(player.props.origin), { kind: "special", specialId: 88, itemId: 101 });
  assert.equal(player.props.row.VideoUrl, videos[0].VideoUrl);
  assert.equal(player.props.row.PolyvVID, "direct-vid");
  assert.equal(player.props.study.path, "/study/courses");
  assert.equal(view.find(node => node.type === "MathVideoFeedback"), undefined, "direct-video playback does not add new feedback requests");
  player.props.onTimeUpdate({ currentTarget: { currentTime: 1 } });
  player.props.onTimeUpdate({ currentTarget: { currentTime: 2 } });
  assert.equal(activities.length, 1);
  view.find(node => node.type === "button" && node.props.children.includes("VID专题")).props.onClick();
  view.render();
  player = view.find(node => node.type === "MathVideoPlayer");
  assert.equal(player.props.row.PolyvVID, "provider-only-vid", "legacy VideoUrl VID values remain playable");
  assert.deepEqual(structuredClone(player.props.origin), { kind: "special", specialId: 88, itemId: 102 });
  assert.equal(view.find(node => node.type === "MathVideoFeedback").props.vid, "provider-only-vid");
  player.props.onTimeUpdate({ currentTarget: { currentTime: 1 } });
  view.find(node => node.type === "button" && node.props.children.includes("直链专题")).props.onClick();
  view.render();
  view.find(node => node.type === "MathVideoPlayer").props.onTimeUpdate({ currentTarget: { currentTime: 3 } });
  assert.equal(activities.length, 2, "returning to or recovering a source does not duplicate watched items");
});

test("product introductions pass product provenance to the shared question-video wrapper", () => {
  const product = { ID: 77, Json: "product-video", PlayToken: "source-token", Name: "产品课程" };
  const view = mount(productCode, { product, stuid: "web-student", onBack() {} }, {
    useContent: () => ({ data: { data: product }, loading: false, error: "", reload() {} }),
    courseImages: () => [],
  });
  const player = view.find(node => node.type === "MathQuestionVideo");
  assert.deepEqual(structuredClone(player.props.origin), { kind: "product", productId: 77 });
  assert.equal(player.props.row.PolyvVID, "product-video");
  assert.equal(player.props.row.playsafe, "source-token");
});


async function courseFixture({ previous = 0, saveRecord, selectedTask = task } = {}) {
  const writes = [], activities = [];
  const view = mount(courseCode, { task: selectedTask, context, onSaved() {}, onRetry() {} }, {
    courseApi: {
      records: async () => ({ data: previous ? [{ ID: 19, BusValue: previous }] : [] }),
      saveRecord: input => {
        writes.push(structuredClone(input));
        return saveRecord ? saveRecord(input, writes.length) : Promise.resolve({ data: 19 });
      },
    },
    recordActivity: activity => activities.push(activity),
  });
  await settle();
  const media = { currentTime: 0, duration: 100 };
  view.render(media);
  view.fire("onLoadedMetadata");
  return { ...view, writes, activities, media };
}

test("math course progress saves every 20 seconds without a manual save control or duplicate fractional writes", async () => {
  const view = await courseFixture();
  assert.equal(view.find(node => node.type === "button" && node.props.children.includes("保存播放进度")), undefined);
  view.fire("onTimeUpdate", 19.9);
  assert.equal(view.writes.length, 0);
  view.fire("onTimeUpdate", 20.4);
  await settle();
  assert.equal(view.writes.length, 1);
  assert.equal(view.writes[0].BusValue, 20);
  view.fire("onPause", 20.8);
  await settle();
  assert.equal(view.writes.length, 1, "pause does not resend the same integer position");
});

test("pause saves the final sub-interval automatically and backward seeking keeps the furthest learned position", async () => {
  const view = await courseFixture({ previous: 40 });
  view.fire("onTimeUpdate", 48);
  assert.equal(view.writes.length, 0);
  view.fire("onPause", 49);
  await settle();
  assert.equal(view.writes[0].BusValue, 49);
  view.fire("onTimeUpdate", 12);
  view.fire("onPause");
  await settle();
  assert.equal(view.writes.length, 1, "course completion continues to use the furthest observation");
});

test("hidden and pagehide events flush pending progress once and unregister on exit", async () => {
  const view = await courseFixture();
  view.fire("onTimeUpdate", 8);
  view.hide();
  view.pagehide();
  await settle();
  assert.equal(view.writes.length, 1);
  assert.equal(view.writes[0].BusValue, 8);
  view.unmount();
  await settle();
  assert.equal(view.writes.length, 1);
  assert.equal(view.listeners.window.size, 0);
  assert.equal(view.listeners.document.size, 0);
});

test("switching lessons through unmount saves the captured observation after the old video is cleared", async () => {
  const first = await courseFixture();
  first.fire("onTimeUpdate", 13.5);
  first.unmount();
  await settle();
  assert.equal(first.writes.length, 1);
  assert.equal(first.writes[0].BusValue, 13);
  assert.equal(first.writes[0].BusID, 9);
  const second = await courseFixture({ selectedTask: { ...task, BusID: 10 } });
  second.pagehide();
  await settle();
  assert.equal(second.writes.length, 0, "opening another unwatched lesson never writes zero progress");
});

test("leaving before records are ready never writes an empty progress record", async () => {
  const records = deferred(), writes = [];
  const view = mount(courseCode, { task, context, onSaved() {}, onRetry() {} }, {
    courseApi: { records: () => records.promise, saveRecord: async input => { writes.push(input); return { data: 19 }; } },
    recordActivity() {},
  });
  view.hide(); view.pagehide(); view.unmount();
  records.resolve({ data: [{ ID: 19, BusValue: 40 }] });
  await settle();
  assert.equal(writes.length, 0);
  assert.equal(view.listeners.window.size, 0);
  assert.equal(view.listeners.document.size, 0);
});

test("pause and exit during an in-flight periodic save deliver the latest observed tail afterward", async () => {
  const first = deferred();
  const view = await courseFixture({ saveRecord: (_input, attempt) => attempt === 1 ? first.promise : Promise.resolve({ data: 19 }) });
  view.fire("onTimeUpdate", 20);
  assert.equal(view.writes.length, 1);
  view.fire("onTimeUpdate", 27);
  view.fire("onPause");
  view.fire("onTimeUpdate", 29.5);
  view.unmount();
  assert.equal(view.writes.length, 1, "final events do not launch concurrent writes");
  first.resolve({ data: 19 });
  await settle();
  assert.equal(view.writes.length, 2);
  assert.deepEqual(view.writes.map(value => value.BusValue), [20, 29]);
  assert.equal(view.writes[1].ID, 19, "the follow-up uses the record identity returned by the first save");
});

test("failed periodic saves retain progress for the next automatic update", async () => {
  const view = await courseFixture({ saveRecord: (_input, attempt) => attempt === 1 ? Promise.reject(new Error("connection interrupted")) : Promise.resolve({ data: 19 }) });
  view.fire("onTimeUpdate", 20);
  await settle();
  view.fire("onTimeUpdate", 21);
  await settle();
  assert.deepEqual(view.writes.map(value => value.BusValue), [20, 21]);
});

test("a failed pause save keeps its observed tail available through the explicit error retry", async () => {
  const view = await courseFixture({ saveRecord: (_input, attempt) => attempt === 1 ? Promise.reject(new Error("connection interrupted")) : Promise.resolve({ data: 19 }) });
  view.fire("onPause", 8);
  await settle();
  view.render();
  assert.ok(view.find(node => node.props.role === "alert"));
  view.find(node => node.type === "button" && node.props.children.includes("重试")).props.onClick();
  await settle();
  assert.deepEqual(view.writes.map(value => value.BusValue), [8, 8]);
  view.render();
  assert.equal(view.find(node => node.props.role === "alert"), undefined);
});

test("an in-flight failure honors one pending final save and stops retrying without another event", async () => {
  const first = deferred();
  const view = await courseFixture({ saveRecord: (_input, attempt) => attempt === 1 ? first.promise : Promise.reject(new Error("still offline")) });
  view.fire("onTimeUpdate", 20);
  view.fire("onPause", 27);
  view.unmount();
  first.reject(new Error("offline"));
  await settle(); await settle();
  assert.deepEqual(view.writes.map(value => value.BusValue), [20, 27], "only the requested final observation is retried");
});

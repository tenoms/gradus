import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as courseModel from "../../../src/features/computer/courses/course-model.mjs";

// Run the real component and event handlers with a controlled clock and media
// element. Effect cleanup also models the video source being cleared on removal.
const path = new URL("../../../src/features/computer/courses/ComputerCourses.tsx", import.meta.url);
const source = await readFile(path, "utf8");
const ast = ts.createSourceFile(path.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ComputerCourses");
const executable = ts.transpileModule(component.getText(ast).replace(/^export default /, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React, jsxFactory: "element" },
}).outputText;
const mediaUrl = "https://media.example.test/shared.mp4";
const makeMedia = () => ({ currentTime: 0, duration: 200, paused: false, seeking: false, readyState: 4 });
const nodes = tree => !tree || typeof tree !== "object" ? [] : [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)];

function player({ initialPosition = 0, failures = 0 } = {}) {
  const course = { id: "package", name: "408课程", courseRelated: "a,b", courses: [{ id: "a", name: "分课A" }, { id: "b", name: "分课B" }] };
  const first = { id: "first", lessonName: "第一课", videoUrl: mediaUrl, watchHistoryTime: initialPosition };
  const second = { id: "second", lessonName: "第二课", videoUrl: mediaUrl, watchHistoryTime: 4 };
  const states = { 2: course, 3: "a", 4: { ...first, _studyCourseId: "a" }, 8: mediaUrl };
  const refs = [], effects = [], writes = [], activities = [];
  const listeners = { document: new Map(), window: new Map() };
  let stateCursor, refCursor, effectCursor, tree, media = makeMedia(), clock = 1000;
  const surface = name => ({
    addEventListener: (event, handler) => listeners[name].set(event, handler),
    removeEventListener: (event, handler) => { if (listeners[name].get(event) === handler) listeners[name].delete(event); },
  });
  const document = { ...surface("document"), hidden: false };
  const scope = {
    ...courseModel,
    React: { Fragment: "Fragment" },
    Date: class extends Date { static now() { return clock; } },
    document, window: surface("window"),
    element: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const index = stateCursor++;
      if (!Object.hasOwn(states, index)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useRef(initial) {
      const index = refCursor++;
      // The initial rendered state represents a lesson already selected by play().
      return refs[index] ||= { current: index === 2 ? initialPosition : initial };
    },
    useEffect(setup, dependencies) {
      const index = effectCursor++;
      const previous = effects[index];
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i]))
        effects[index] = { dependencies, setup, previous, pending: true };
    },
    useResource: (route, query) => ({
      data: route.endsWith("lessonList") ? [query.courseId === "b" ? second : first] : route.endsWith("courseList") ? [course] : {},
      loading: false, error: "", reload() {},
    }),
    usePagination: () => ({ start: 0, end: 12, page: 1, pageSize: 12, setPage() {}, setPageSize() {} }),
    records: value => Array.isArray(value) ? value : value?.list || [],
    label: value => value?.lessonName || value?.name || "课程",
    plain: value => String(value || ""),
    safeLink: value => /^https?:\/\//.test(String(value || "")) ? String(value) : undefined,
    recordActivity: activity => activities.push(activity),
    request: async (route, query, method, data) => {
      assert.equal(route, "/api/exam/wx/lessonHistory/add/", "direct video URLs need no upstream request");
      assert.equal(method, "POST");
      writes.push(structuredClone(data));
      if (failures-- > 0) throw new Error("temporary connection failure");
      return {};
    },
    ...Object.fromEntries(["WorkspaceBar", "WorkspaceTabs", "Pagination", "Status", "LearningVideo", "RichContent", "ArrowLeft", "ArrowRight", "BookOpen", "FileText", "LoaderCircle", "Play"].map(name => [name, name])),
  };
  const renderComponent = runInNewContext(`${executable}\nComputerCourses;`, scope);
  function render(nextMedia = media) {
    stateCursor = refCursor = effectCursor = 0;
    tree = renderComponent();
    const video = nodes(tree).find(node => node.type === "LearningVideo");
    if (video) video.props.ref.current = nextMedia;
    media = nextMedia;
    for (const effect of effects) if (effect.pending) {
      effect.previous?.cleanup?.();
      effect.cleanup = effect.setup();
      effect.pending = false;
    }
    return tree;
  }
  function fire(name, position = media.currentTime) {
    media.currentTime = position;
    const video = nodes(tree).find(node => node.type === "LearningVideo");
    assert.ok(video, "lesson player is visible");
    video.props[name]?.({ currentTarget: media });
  }
  render();
  fire("onLoadedMetadata");
  return {
    writes, activities, listeners,
    advance: milliseconds => { clock += milliseconds; },
    fire, render,
    find: predicate => nodes(tree).find(predicate),
    hide() { document.hidden = true; listeners.document.get("visibilitychange")?.(); },
    pagehide() { listeners.window.get("pagehide")?.(); },
    unmount() {
      // LearningVideo clears its source; the parent's captured position must survive.
      media.currentTime = 0;
      media.duration = NaN;
      for (const ref of refs) if (ref.current === media) ref.current = null;
      for (const effect of effects) effect.cleanup?.();
    },
  };
}

const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

test("backward seeking keeps periodic autosave based on actual watch time", () => {
  const view = player({ initialPosition: 100 });
  view.fire("onPlaying");
  view.advance(1000);
  view.fire("onSeeking", 90);
  view.fire("onSeeked");
  view.advance(29000);
  view.fire("onTimeUpdate", 119);
  assert.equal(view.writes.length, 1, "30 watched seconds save even when position advanced by less than 30");
  assert.equal(view.writes[0].watchHistoryTime, 119);
  assert.equal(view.writes[0].time, 30);
});

test("a large backward seek saves its new resume position immediately", () => {
  const view = player({ initialPosition: 100 });
  view.fire("onPlaying");
  view.advance(1000);
  view.fire("onSeeking", 40);
  view.fire("onSeeked");
  view.fire("onTimeUpdate");
  assert.equal(view.writes.length, 1);
  assert.equal(view.writes[0].watchHistoryTime, 40);
  assert.equal(view.writes[0].time, 1);
});

test("pause and end automatically save each watched interval and record playback once", () => {
  const view = player();
  view.fire("onPlaying");
  view.advance(8000);
  view.fire("onPause", 8);
  view.advance(1000);
  view.fire("onPlaying");
  view.advance(6000);
  view.fire("onEnded", 14);
  assert.deepEqual(view.writes.map(row => [row.watchHistoryTime, row.time]), [[8, 8], [14, 6]]);
  assert.equal(view.activities.length, 1);
});

test("leaving the course saves unsent playback even after the video element was cleared", () => {
  const view = player();
  view.fire("onPlaying");
  view.advance(8000);
  view.fire("onTimeUpdate", 8);
  assert.equal(view.writes.length, 0);
  view.unmount();
  assert.equal(view.writes.length, 1);
  const saved = view.writes[0];
  assert.equal(saved.lessonId, "first");
  assert.equal(saved.courseId, "a");
  assert.equal(saved.watchHistoryTime, 8, "unmount never overwrites progress with the cleared element's zero");
  assert.equal(saved.time, 8);
  assert.equal(saved.progress, "4%");
  assert.equal(Number.isFinite(saved.historyModifyDate), true);
  assert.equal(view.listeners.document.size, 0);
  assert.equal(view.listeners.window.size, 0);
});

test("hidden pages and pagehide flush progress without duplicate interval writes", () => {
  const view = player();
  view.fire("onPlaying");
  view.advance(5000);
  view.fire("onTimeUpdate", 5);
  view.hide();
  view.pagehide();
  view.unmount();
  assert.equal(view.writes.length, 1);
  assert.equal(view.writes[0].watchHistoryTime, 5);
  assert.equal(view.writes[0].time, 5);
});

test("switching subcourses saves the original lesson and resets timing for another lesson sharing its URL", async () => {
  const view = player();
  view.fire("onPlaying");
  view.advance(17000);
  view.fire("onTimeUpdate", 17);
  view.find(node => node.props?.["aria-label"] === "选择分课程").props.onChange({ target: { value: "b" } });
  view.render();
  view.find(node => node.type === "button" && node.props.className?.startsWith("computer-lesson ")).props.onClick();
  await settle();
  assert.equal(view.writes.length, 1);
  assert.equal(view.writes[0].lessonId, "first");
  assert.equal(view.writes[0].courseId, "a", "changing the directory does not reassign the active lesson");
  assert.equal(view.writes[0].watchHistoryTime, 17);
  const replacement = makeMedia();
  view.render(replacement);
  view.fire("onLoadedMetadata");
  assert.equal(replacement.currentTime, 4, "the new lesson restores its own saved position");
  view.advance(1000);
  view.fire("onPlaying");
  view.advance(6000);
  view.fire("onPause", 10);
  assert.equal(view.writes.length, 2, "the previous effect cleanup does not write a duplicate or zero position");
  assert.equal(view.writes[1].lessonId, "second");
  assert.equal(view.writes[1].courseId, "b");
  assert.equal(view.writes[1].watchHistoryTime, 10);
  assert.equal(view.writes[1].time, 6);
});


test("returning A to B to A resumes the latest saved position without refetching the directory", async () => {
  const view = player();
  view.fire("onPlaying");
  view.advance(17000);
  view.fire("onPause", 17);
  await settle();
  for (const subcourse of ["b", "a"]) {
    view.find(node => node.props?.["aria-label"] === "选择分课程").props.onChange({ target: { value: subcourse } });
    view.render();
    view.find(node => node.type === "button" && node.props.className?.startsWith("computer-lesson ")).props.onClick();
    await settle();
    const replacement = makeMedia();
    view.render(replacement);
    view.fire("onLoadedMetadata");
    assert.equal(replacement.currentTime, subcourse === "a" ? 17 : 4);
  }
  assert.equal(view.writes.length, 1, "switching unwatched lessons needs no new save or directory request");
});

test("a failed periodic save retries on the next update with all unsaved watch time", async () => {
  const view = player({ failures: 1 });
  view.fire("onPlaying");
  view.advance(30000);
  view.fire("onTimeUpdate", 30);
  await settle();
  view.render();
  assert.match(view.find(node => node.type === "Status").props.error, /学习进度保存失败/);
  view.advance(1000);
  view.fire("onTimeUpdate", 31);
  await settle();
  assert.equal(view.writes.length, 2);
  assert.equal(view.writes[1].watchHistoryTime, 31);
  assert.equal(view.writes[1].time, 31, "failed delivery does not discard the first 30 seconds");
  view.render();
  assert.equal(view.find(node => node.type === "Status").props.error, "", "successful retry clears the save failure");
});

test("a failed pause save remains pending for the pagehide retry at the same position", async () => {
  const view = player({ failures: 1 });
  view.fire("onPlaying");
  view.advance(8000);
  view.fire("onPause", 8);
  await settle();
  view.pagehide();
  await settle();
  assert.equal(view.writes.length, 2, "the failed position must not be treated as already saved");
  assert.equal(view.writes[1].watchHistoryTime, 8);
  assert.equal(view.writes[1].time, 8);
});

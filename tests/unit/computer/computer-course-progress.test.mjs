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
const makeMedia = () => ({ currentTime: 0, duration: 200, paused: false, seeking: false, readyState: 4, playCalls: 0, async play() { this.playCalls++; this.paused = false; } });
const nodes = tree => !tree || typeof tree !== "object" ? [] : [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)];

function player({ initialPosition = 0, failures = 0, loadSecond, mediaId, storagePlatform, loadSource } = {}) {
  const course = { id: "package", name: "408课程", courseRelated: "a,b", courses: [{ id: "a", name: "分课A" }, { id: "b", name: "分课B" }] };
  const first = { id: "first", lessonName: "第一课", videoUrl: mediaUrl, mediaId, storagePlatform, watchHistoryTime: initialPosition };
  const second = { id: "second", lessonName: "第二课", videoUrl: loadSecond ? undefined : mediaUrl, mediaId: loadSecond ? "second-media" : undefined, watchHistoryTime: 4 };
  const states = { 2: course, 3: "a", 4: { ...first, _studyCourseId: "a" }, 8: mediaUrl };
  const refs = [], effects = [], writes = [], activities = [], sourceRequests = [];
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
    document, window: { ...surface("window"), scrollTo() { assert.fail("selecting a lesson must preserve scroll position"); } },
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
    request: async (route, query, method, data, options) => {
      if (/\/get_play_info(?:\/v2)?$/.test(route)) {
        sourceRequests.push({ route, query: structuredClone(query), method, options: structuredClone(options) });
        if (loadSource) return loadSource({ route, query, options });
        if (loadSecond) {
          assert.equal(query.mediaId, "second-media");
          return loadSecond();
        }
      }
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
    if (nextMedia !== media) {
      media.currentTime = 0;
      media.duration = NaN;
    }
    if (video) video.props.ref.current = nextMedia;
    else refs[1].current = null;
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
    writes, activities, listeners, sourceRequests,
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


test("lesson loading and failures stay in the reserved player area instead of the page top", async () => {
  let rejectLoad;
  const pending = new Promise((resolve, reject) => { rejectLoad = reject; });
  const view = player({ loadSecond: () => pending });
  const mediaArea = () => view.find(node => node.props.className === "cc-player-media");
  assert.ok(nodes(mediaArea()).some(node => node.type === "LearningVideo"));
  view.find(node => node.props?.["aria-label"] === "选择分课程").props.onChange({ target: { value: "b" } });
  view.render();
  view.find(node => node.type === "button" && node.props.className?.startsWith("computer-lesson ")).props.onClick();
  await settle();
  view.render();
  const loading = mediaArea();
  assert.ok(loading, "clearing the previous video keeps its reserved media container");
  assert.equal(loading.props["aria-busy"], true);
  assert.ok(nodes(loading).some(node => node.props?.role === "status" && node.props.className?.includes("cc-player-placeholder")));
  const page = view.find(node => node.props.className === "cc-courses");
  assert.equal(page.props.children.flat(Infinity).some(node => node?.type === "Status"), false, "lesson feedback is not inserted above the course");
  rejectLoad(new Error("播放地址读取失败"));
  await settle();
  view.render();
  assert.equal(mediaArea().props["aria-busy"], false);
  assert.ok(nodes(mediaArea()).some(node => node.props.className?.includes("cc-player-placeholder")), "failure preserves the same player space");
  const feedback = view.find(node => node.props.className === "cc-player-feedback");
  assert.equal(nodes(feedback).find(node => node.type === "Status").props.error, "视频加载失败：播放地址读取失败");
});


test("lessons with mediaId obtain the backend's cached playback URL before an old directory direct link", async () => {
  const cached = "https://media.example.test/cached.mp4";
  for (const storagePlatform of [undefined, "Tencent"]) {
    const view = player({ mediaId: "saved-media", storagePlatform, loadSource: () => ({ mediaList: [{ playURL: cached }] }) });
    view.find(node => node.type === "button" && node.props.className?.startsWith("computer-lesson ")).props.onClick();
    await settle();
    view.render(makeMedia());
    assert.equal(view.find(node => node.type === "LearningVideo").props.src, cached);
    assert.equal(view.sourceRequests.length, 1);
    assert.equal(view.sourceRequests[0].query.mediaId, "saved-media");
    assert.equal(view.sourceRequests[0].options, undefined, "normal selection reuses the backend cache");
    assert.equal(view.sourceRequests[0].route, storagePlatform === "Tencent" ? "/api/exam/wx/course/vod/get_play_info" : "/api/exam/wx/course/get_play_info/v2");
  }
});

test("an expired source refreshes once and resumes the same lesson position and playback intent", async () => {
  const refreshed = "https://media.example.test/refreshed.mp4";
  const view = player({ initialPosition: 50, mediaId: "saved-media", loadSource: () => ({ url: refreshed }) });
  view.fire("onPlaying");
  view.advance(8000);
  view.fire("onTimeUpdate", 58);
  view.fire("onSourceError");
  view.fire("onSourceError");
  await settle();
  const replacement = makeMedia();
  view.render(replacement);
  view.fire("onLoadedMetadata");
  await settle();
  assert.equal(view.sourceRequests.length, 1, "duplicate source errors share the one automatic refresh");
  assert.equal(view.sourceRequests[0].options.refresh, true);
  assert.equal(view.find(node => node.type === "LearningVideo").props.src, refreshed);
  assert.equal(replacement.currentTime, 58);
  assert.equal(replacement.playCalls, 1, "previously playing video resumes after its URL changes");
  view.fire("onPlaying");
  assert.equal(view.activities.length, 1, "URL renewal does not create a second watched-lesson activity");
  view.fire("onSourceError");
  view.render();
  assert.equal(view.sourceRequests.length, 1, "a refreshed source failure cannot trigger an infinite renewal loop");
  const status = nodes(view.find(node => node.props.className === "cc-player-feedback")).find(node => node.type === "Status");
  assert.match(status.props.error, /更新后仍无法播放/);
  assert.equal(typeof status.props.retry, "function");
});

test("URL refresh preserves a paused lesson without starting playback", async () => {
  const view = player({ initialPosition: 25, mediaId: "saved-media", loadSource: () => ({ url: mediaUrl }) });
  const previousKey = view.find(node => node.type === "LearningVideo").props.key;
  view.fire("onPause");
  view.fire("onSourceError");
  await settle();
  const replacement = makeMedia();
  view.render(replacement);
  view.fire("onLoadedMetadata");
  assert.equal(replacement.currentTime, 25);
  assert.equal(replacement.playCalls, 0);
  assert.notEqual(view.find(node => node.type === "LearningVideo").props.key, previousKey, "even a renewed identical URL remounts its failed source");
  view.pagehide();
  assert.ok(view.writes.every(row => row.watchHistoryTime === 25), "lifecycle listeners follow the renewed element instead of its cleared predecessor");
});

test("a failed URL renewal offers a manual retry without losing the resume position", async () => {
  let attempts = 0;
  const view = player({ initialPosition: 12, mediaId: "saved-media", loadSource: () => {
    if (++attempts === 1) throw new Error("source temporarily unavailable");
    return { url: "https://media.example.test/retry.mp4" };
  } });
  view.fire("onSourceError");
  await settle();
  view.render();
  const status = nodes(view.find(node => node.props.className === "cc-player-feedback")).find(node => node.type === "Status");
  assert.match(status.props.error, /视频地址更新失败/);
  assert.equal(typeof status.props.retry, "function");
  status.props.retry();
  await settle();
  const replacement = makeMedia();
  view.render(replacement);
  view.fire("onLoadedMetadata");
  assert.equal(view.sourceRequests.length, 2);
  assert.ok(view.sourceRequests.every(call => call.options.refresh));
  assert.equal(replacement.currentTime, 12);
  assert.equal(view.find(node => node.type === "LearningVideo").props.src, "https://media.example.test/retry.mp4");
});

test("a failing direct-only lesson reports its error without contacting YYB", () => {
  const view = player();
  view.fire("onSourceError");
  view.render();
  assert.equal(view.sourceRequests.length, 0);
  const status = nodes(view.find(node => node.props.className === "cc-player-feedback")).find(node => node.type === "Status");
  assert.match(status.props.error, /视频暂时无法加载/);
  assert.equal(status.props.retry, undefined);
});


test("source recovery preserves a deliberate seek back to the beginning", async () => {
  const view = player({ initialPosition: 50, mediaId: "saved-media", loadSource: () => ({ url: mediaUrl }) });
  view.fire("onSeeking", 0);
  view.fire("onSeeked");
  view.fire("onTimeUpdate");
  view.fire("onSourceError");
  await settle();
  const replacement = makeMedia();
  view.render(replacement);
  view.fire("onLoadedMetadata");
  assert.equal(replacement.currentTime, 0, "zero is a valid current resume point");
});

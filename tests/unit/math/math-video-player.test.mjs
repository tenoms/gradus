import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { mathVideoSource, mathVideoRequest } from "../../../src/features/math/media/math-video-source.mjs";
import { mathQuestionMedia } from "../../../src/features/math/questions/math-question-presentation.mjs";

const compiled = {};
for (const [name, file] of [["MathVideoPlayer", "media/MathVideoPlayer"], ["MathQuestionVideo", "questions/MathQuestionVideo"]]) {
  const source = await readFile(new URL(`../../../src/features/math/${file}.tsx`, import.meta.url), "utf8");
  compiled[name] = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, jsxFactory: "jsx" } }).outputText
    .replace(/import[\s\S]*?from ["'][^"']+["'];/g, "")
    .replace(/export default MathVideoPlayer;/, "")
    .replace(/export default /g, "");
}
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === "object" ? [node, ...nodes(node.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.children) : node == null || typeof node === "boolean" ? "" : String(node);
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const row = { ID: 9, QuestionID: 8, PolyvVID: "vid" };
const origin = { kind: "analysis", questionId: 8, itemId: 9 };
function controller(component = "MathVideoPlayer", props = { row, origin }, request = async () => ({ url: "https://media.example/saved.m3u8" })) {
  const values = [], refs = [], effects = [];
  let stateIndex, refIndex, effectIndex, pending, dirty = false, playerKey;
  const fixture = { props, calls: [], activities: [], forwarded: { current: null }, media: undefined, tree: undefined };
  const create = runInNewContext(`${compiled[component === "NativeQuestionVideo" ? "MathQuestionVideo" : component]}\n${component};`, {
    mathVideoSource, mathVideoRequest, Error,
    jsx: (type, props, ...children) => ({ type, props: props || {}, children }),
    forwardRef: fn => fn,
    LearningVideo: "LearningVideo", MathVideoPlayer: "MathVideoPlayer", MathVideoFeedback: "MathVideoFeedback", LoaderCircle: "LoaderCircle", Play: "Play",
    loadMathVideo: async (row, options) => { fixture.calls.push({ row, options }); return request(row, options); },
    recordStudy: activity => fixture.activities.push(activity),
    useRef(initial) { return refs[refIndex++] ||= { current: initial }; },
    useState(initial) {
      const index = stateIndex++;
      if (!(index in values)) values[index] = initial;
      return [values[index], next => { values[index] = typeof next === "function" ? next(values[index]) : next; dirty = true; }];
    },
    useEffect(fn, deps) {
      const index = effectIndex++;
      if (!effects[index] || deps.some((value, i) => value !== effects[index].deps[i])) pending.push({ index, fn, deps });
    },
    useImperativeHandle(ref, get) { fixture.getHandle = () => { if (ref) ref.current = get(); }; },
  });
  Object.assign(fixture, {
    render(changes = {}) {
      Object.assign(fixture.props, changes);
      do {
        dirty = false; stateIndex = refIndex = effectIndex = 0; pending = [];
        fixture.tree = create(fixture.props, fixture.forwarded);
        const player = nodes(fixture.tree).find(node => node.type === "LearningVideo");
        if (player) {
          if (playerKey !== player.props.key) {
            fixture.media = { currentTime: 0, duration: 100, paused: true, error: null, plays: 0, play() { this.plays++; this.paused = false; return Promise.resolve(); } };
            playerKey = player.props.key;
          }
          player.props.ref.current = fixture.media;
        }
        fixture.getHandle?.();
        for (const { index, fn, deps } of pending) { effects[index]?.cleanup?.(); effects[index] = { deps, cleanup: fn() }; }
      } while (dirty);
      return fixture.tree;
    },
    player() { return nodes(fixture.tree).find(node => node.type === "LearningVideo"); },
    fire(name, position) {
      const player = fixture.player(); assert.ok(player, "video is mounted");
      if (position !== undefined) fixture.media.currentTime = position;
      if (name === "onPlaying") fixture.media.paused = false;
      if (name === "onPause") fixture.media.paused = true;
      const event = { currentTarget: fixture.media };
      player.props[name]?.(event);
      return event;
    },
    click(label) { const button = nodes(fixture.tree).find(node => node.type === "button" && text(node) === label); assert.ok(button); button.props.onClick(); fixture.render(); },
    async flush() { await tick(); fixture.render(); },
    unmount() { effects.forEach(effect => effect.cleanup?.()); },
  });
  fixture.render(); return fixture;
}

test("math players consult the cache once across equivalent row renders and refresh a failed source once", async () => {
  const refresh = deferred(), events = [];
  const f = controller("MathVideoPlayer", { row, origin, controls: true, onLoadedMetadata: event => { events.push(event); event.currentTarget.currentTime = 5; } }, async (_row, options) => options.refresh ? refresh.promise : { url: "https://media.example/saved.m3u8" });
  await f.flush();
  f.fire("onLoadedMetadata"); assert.equal(f.media.currentTime, 5);
  f.render({ row: { ...row }, origin: { ...origin } });
  assert.equal(f.calls.length, 1);
  f.fire("onPlaying"); f.fire("onTimeUpdate", 37);
  const firstKey = f.player().props.key;
  f.fire("onSourceError"); f.fire("onSourceError");
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].options.refresh, true);
  refresh.resolve({ url: "https://media.example/saved.m3u8" }); await f.flush();
  assert.notEqual(f.player().props.key, firstKey, "a refreshed identical URL remounts the source");
  f.fire("onLoadedMetadata");
  assert.equal(events.length, 2);
  assert.equal(f.media.currentTime, 37, "refresh restoration runs after the business metadata callback");
  assert.equal(f.media.plays, 1);
  assert.equal(f.forwarded.current, f.media);
  f.fire("onSourceError"); f.render();
  assert.equal(f.calls.length, 2, "a refreshed but still failing address waits for manual retry");
  assert.match(text(f.tree), /重试播放/);
});

test("failed refreshes retain the interrupted position and playing intent for manual retry", async () => {
  let refreshes = 0;
  const f = controller("MathVideoPlayer", { row, origin }, async (_row, options) => {
    if (options.refresh && ++refreshes === 1) throw new Error("来源暂不可用");
    return { url: options.refresh ? "https://media.example/fresh.m3u8" : "https://media.example/saved.m3u8" };
  });
  await f.flush(); f.fire("onPlaying"); f.fire("onTimeUpdate", 42); f.fire("onSourceError"); await f.flush();
  assert.match(text(f.tree), /来源暂不可用/);
  f.media.currentTime = 0;
  f.click("重试播放"); await f.flush(); f.fire("onLoadedMetadata");
  assert.equal(f.calls.length, 3);
  assert.equal(f.calls[2].options.refresh, true);
  assert.equal(f.media.currentTime, 42);
  assert.equal(f.media.plays, 1);
});

test("paused math videos restore their current position without starting playback and retain standard events", async () => {
  const seen = [];
  const f = controller("MathVideoPlayer", { row, origin, onPause: event => seen.push(event), onError: event => seen.push(event) });
  await f.flush(); f.fire("onPlaying");
  const paused = f.fire("onPause", 28);
  f.fire("onSourceError"); await f.flush(); f.fire("onLoadedMetadata");
  assert.equal(f.media.currentTime, 28);
  assert.equal(f.media.plays, 0);
  const error = f.fire("onError");
  assert.deepEqual(seen, [paused, error]);
});

test("a play request that fails during buffering preserves its intent without reporting actual playback", async () => {
  const requested = [], playing = [];
  const f = controller("MathVideoPlayer", { row, origin, onPlay: event => requested.push(event), onPlaying: event => playing.push(event) });
  await f.flush();
  const event = f.fire("onPlay");
  f.fire("onSourceError"); await f.flush(); f.fire("onLoadedMetadata");
  assert.deepEqual(requested, [event], "the original play event is forwarded once");
  assert.equal(f.media.plays, 1, "recovered media resumes the requested playback");
  assert.equal(playing.length, 0, "a play request does not claim actual playing or study time");
});

test("an expired initial URL preserves the business resume point before any metadata was loaded", async () => {
  const f = controller("MathVideoPlayer", { row, origin, onLoadedMetadata: event => { event.currentTarget.currentTime = 12; } });
  await f.flush();
  f.fire("onTimeUpdate", 0);
  f.fire("onPlay");
  f.media.error = { code: 4 };
  f.fire("onSourceError"); await f.flush();
  f.fire("onLoadedMetadata");
  assert.equal(f.media.currentTime, 12, "an unknown initial zero cannot override the private course record");
  assert.equal(f.media.plays, 1);
});

test("native errors retain the observed position while an explicit seek to zero remains at the start", async () => {
  for (const seekZero of [false, true]) {
    const seekEvents = [];
    const f = controller("MathVideoPlayer", { row, origin, onSeeking: event => seekEvents.push(event), onSeeked: event => seekEvents.push(event) });
    await f.flush(); f.fire("onTimeUpdate", 46);
    if (seekZero) { f.fire("onSeeking", 0); f.fire("onSeeked"); }
    f.media.error = { code: 2 };
    f.fire("onTimeUpdate", 0);
    f.fire("onSourceError"); await f.flush(); f.fire("onLoadedMetadata");
    assert.equal(f.media.currentTime, seekZero ? 0 : 46, "an error reset cannot replace an observed resume point");
    assert.equal(seekEvents.length, seekZero ? 2 : 0, "standard seek events remain forwarded");
  }
});

test("late video loads cannot replace a newly selected video or write after unmount", async () => {
  const first = deferred();
  const f = controller("MathVideoPlayer", { row, origin }, async current => current.PolyvVID === "vid" ? first.promise : { url: "https://media.example/second.m3u8" });
  f.render({ row: { ...row, PolyvVID: "second" } }); await f.flush();
  first.resolve({ url: "https://media.example/stale.m3u8" }); await f.flush();
  assert.equal(f.player().props.src, "https://media.example/second.m3u8");
  const next = deferred();
  const closed = controller("MathVideoPlayer", { row, origin }, () => next.promise);
  closed.unmount(); next.resolve({ url: "https://media.example/late.m3u8" }); await closed.flush();
  assert.equal(closed.player(), undefined);
});

test("generic question video wrappers require explicit origins and retain lazy feedback behavior", () => {
  const derived = controller("MathQuestionVideo", { row });
  assert.equal(derived.tree.props.origin, undefined, "a generic row ID must never be treated as a question-file ID");
  const explicit = { kind: "special", specialId: 7, itemId: 9 };
  const overridden = controller("MathQuestionVideo", { row, origin: explicit });
  assert.equal(JSON.stringify(overridden.tree.props.origin), JSON.stringify(explicit));
  const lazy = controller("NativeQuestionVideo", { row, origin });
  assert.match(text(lazy.tree), /播放视频解析/);
  assert.equal(nodes(lazy.tree).some(node => node.type === "MathVideoPlayer"), false);
  lazy.click("播放视频解析");
  const player = nodes(lazy.tree).find(node => node.type === "MathVideoPlayer");
  assert.ok(player); assert.equal(player.props.origin, origin);
  player.props.onTimeUpdate({ currentTarget: { currentTime: 2 } });
  player.props.onTimeUpdate({ currentTarget: { currentTime: 3 } });
  assert.equal(lazy.activities.length, 1);
  assert.ok(nodes(lazy.tree).some(node => node.type === "MathVideoFeedback"));
});

test("the question reader supplies trusted question-file context to video analysis", async () => {
  const source = await readFile(new URL("../../../src/features/math/questions/MathQuestionReader.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("MathQuestionReader.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "MediaFile");
  const output = ts.transpileModule(component.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: "jsx" } }).outputText;
  const render = runInNewContext(`${output}\nMediaFile;`, { mathQuestionMedia, MathQuestionVideo: "MathQuestionVideo", jsx: (type, props, ...children) => ({ type, props: props || {}, children }) });
  const tree = render({ row: { ID: 9, QuestionID: 8, BusType: "视频解析", BusValue: "https://media.example/analysis.m3u8" } });
  const video = nodes(tree).find(node => node.type === "MathQuestionVideo");
  assert.ok(video);
  assert.equal(JSON.stringify(video.props.origin), JSON.stringify(origin));
});

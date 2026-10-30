import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../../../src/shared/media/LearningVideo.tsx", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText
  .replace(/import[\s\S]*?from ["'][^"']+["'];/g, "")
  .replace('import("hls.js")', "globalThis.__learningVideoFixture.loadHls()");
const prelude = `
const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
const forwardRef = fn => fn;
const MediaStudyContext = {};
const useContext = () => null;
const useRef = value => globalThis.__learningVideoFixture.useRef(value);
const useState = value => globalThis.__learningVideoFixture.useState(value);
const useEffect = (fn, deps) => globalThis.__learningVideoFixture.useEffect(fn, deps);
const useImperativeHandle = () => {};
const RefreshCw = () => null;
`;
const { default: LearningVideo } = await import(`data:text/javascript;base64,${Buffer.from(prelude + output).toString("base64")}`);

const nodes = node => node && typeof node === "object" ? [node, ...(node.children || []).flatMap(nodes)] : [];
function mount({ src = "https://media.example/lesson.m3u8", mse = true, native = "maybe", deferred = false, loadError, ...props } = {}) {
  const calls = [];
  const refs = [], states = [], effects = [];
  let refIndex, stateIndex, effectIndex, pending;
  const fixture = {
    calls,
    updates: [],
    props: { src, ...props },
    video: {
      canPlayType: () => native,
      removeAttribute: name => calls.push(["removeAttribute", name]),
      load: () => calls.push(["load"]),
    },
    resolve: undefined,
    loadHls: undefined,
    useRef(value) { return refs[refIndex++] ||= { current: value }; },
    useState(value) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof value === "function" ? value() : value;
      return [states[index], next => {
        states[index] = typeof next === "function" ? next(states[index]) : next;
        fixture.updates.push(states[index]);
      }];
    },
    useEffect(fn, deps) {
      const index = effectIndex++;
      if (!effects[index] || deps.some((value, i) => value !== effects[index].deps[i])) pending.push({ index, fn, deps });
    },
    render(props = {}) {
      Object.assign(fixture.props, props);
      globalThis.__learningVideoFixture = fixture;
      refIndex = stateIndex = effectIndex = 0;
      pending = [];
      fixture.tree = LearningVideo(fixture.props, null);
      fixture.videoProps = nodes(fixture.tree).find(node => node.type === "video").props;
      fixture.videoProps.ref.current = fixture.video;
      for (const { index, fn, deps } of pending) {
        effects[index]?.cleanup?.();
        effects[index] = { deps, cleanup: fn() };
      }
    },
    nativeError(code) {
      fixture.video.error = { code };
      const event = { currentTarget: fixture.video };
      fixture.videoProps.onError(event);
      return event;
    },
    retry() {
      fixture.render();
      nodes(fixture.tree).find(node => node.type === "button").props.onClick();
      fixture.render();
    },
    cleanup() { for (const effect of effects) effect.cleanup?.(); },
  };
  class Hls {
    static isSupported() { return mse; }
    static Events = { ERROR: "error" };
    static ErrorTypes = { NETWORK_ERROR: "networkError" };
    static ErrorDetails = { INTERNAL_ABORTED: "aborted" };
    on(event, callback) { calls.push(["on", event]); fixture.onHlsError = callback; }
    loadSource(url) { calls.push(["loadSource", url]); }
    attachMedia(video) { calls.push(["attachMedia", video]); }
    destroy() { calls.push(["destroy"]); }
  }
  fixture.loadHls = () => {
    calls.push(["importHls"]);
    if (loadError) return Promise.reject(loadError);
    if (deferred) return new Promise(resolve => { fixture.resolve = () => resolve({ default: Hls }); });
    return Promise.resolve({ default: Hls });
  };
  fixture.render();
  return fixture;
}

// Let the player's asynchronous HLS import and source attachment finish.
const attached = () => new Promise(resolve => setImmediate(resolve));

test("HLS uses MediaSource when supported even if a browser reports native maybe support", async () => {
  const fixture = mount();
  await attached();
  assert.deepEqual(fixture.calls.map(call => call[0]), ["importHls", "on", "loadSource", "attachMedia"]);
  assert.equal(fixture.video.src, undefined);
  fixture.cleanup();
  assert.deepEqual(fixture.calls.slice(-3).map(call => call[0]), ["destroy", "removeAttribute", "load"]);
});

test("HLS falls back to native playback when MediaSource is unavailable", async () => {
  const fixture = mount({ mse: false });
  await attached();
  assert.equal(fixture.video.src, "https://media.example/lesson.m3u8");
  assert.deepEqual(fixture.calls, [["importHls"]]);
  fixture.cleanup();
});

test("unsupported HLS reports an error and ordinary video links use the native element directly", async () => {
  const unsupported = mount({ mse: false, native: "" });
  await attached();
  assert.ok(unsupported.updates.includes("当前浏览器无法播放此视频，请换用其他浏览器。"));
  unsupported.cleanup();
  const mp4 = mount({ src: "https://media.example/lesson.mp4" });
  await attached();
  assert.equal(mp4.video.src, "https://media.example/lesson.mp4");
  assert.deepEqual(mp4.calls, []);
  mp4.cleanup();
});

test("disposing while HLS is loading prevents a late attachment, and fatal errors retain retry feedback", async () => {
  const disposed = mount({ deferred: true });
  disposed.cleanup();
  disposed.resolve();
  await attached();
  assert.equal(disposed.calls.some(call => call[0] === "attachMedia"), false);
  const failed = mount();
  await attached();
  failed.onHlsError("error", { fatal: true, details: "manifestLoadError" });
  assert.ok(failed.updates.includes("视频加载失败，请重试。"));
  assert.ok(failed.updates.includes("manifestLoadError"));
  failed.cleanup();
});

test("fatal HLS source failures notify once without fabricating HTML error events", async () => {
  for (const details of ["manifestLoadError", "manifestLoadTimeOut", "manifestParsingError", "levelLoadError", "fragLoadError", "keyLoadError"]) {
    let refreshed = 0;
    const htmlEvents = [];
    const fixture = mount({ onSourceError: () => { refreshed++; }, onError: event => htmlEvents.push(event) });
    await attached();
    assert.equal("onSourceError" in fixture.videoProps, false, "source callbacks never reach the video DOM props");
    fixture.onHlsError("error", { type: "networkError", fatal: false, details, response: { code: 403 } });
    assert.equal(refreshed, 0, "HLS retains its built-in retries for recoverable errors");
    fixture.onHlsError("error", { type: "networkError", fatal: true, details, response: { code: 403 } });
    fixture.onHlsError("error", { type: "networkError", fatal: true, details, response: { code: 403 } });
    assert.equal(refreshed, 1, details);
    assert.equal(htmlEvents.length, 0, "HLS errors are not passed as synthetic HTML errors");
    const realEvent = fixture.nativeError(2);
    assert.deepEqual(htmlEvents, [realEvent]);
    assert.equal(refreshed, 1, "the native follow-up event cannot refresh the same source twice");
    fixture.cleanup();
    fixture.onHlsError("error", { type: "networkError", fatal: true, details });
    assert.equal(refreshed, 1, "disposed sources cannot trigger another refresh");
  }
});

test("HLS aborts, codec failures and unavailable player components do not request another URL", async () => {
  let refreshed = 0;
  const onSourceError = () => { refreshed++; };
  const fixture = mount({ onSourceError });
  await attached();
  for (const data of [
    { type: "networkError", details: "aborted" },
    { type: "mediaError", details: "manifestIncompatibleCodecsError" },
    { type: "mediaError", details: "bufferAppendError" },
    { type: "otherError", details: "attachMediaError" },
  ]) fixture.onHlsError("error", { ...data, fatal: true });
  fixture.nativeError(4);
  fixture.cleanup();
  const unsupported = mount({ mse: false, native: "", onSourceError });
  await attached();
  unsupported.nativeError(4);
  assert.ok(unsupported.updates.includes("当前浏览器无法播放此视频，请换用其他浏览器。"));
  unsupported.cleanup();
  const unavailable = mount({ loadError: new Error("HLS component unavailable"), onSourceError });
  await attached();
  assert.ok(unavailable.updates.includes("视频播放器加载失败，请检查网络后重试。"));
  unavailable.cleanup();
  assert.equal(refreshed, 0);
});

test("native source failures notify once while abort and decoding errors retain ordinary HTML handling", async () => {
  for (const options of [{ src: "https://media.example/lesson.mp4" }, { mse: false }]) {
    let refreshed = 0;
    const htmlEvents = [];
    const fixture = mount({ ...options, onSourceError: () => { refreshed++; }, onError: event => htmlEvents.push(event) });
    await attached();
    fixture.nativeError(1);
    fixture.nativeError(3);
    assert.equal(refreshed, 0);
    fixture.nativeError(4);
    fixture.nativeError(2);
    assert.equal(refreshed, 1);
    assert.equal(htmlEvents.length, 4);
    fixture.cleanup();
    fixture.nativeError(2);
    assert.equal(refreshed, 1);
  }
});

test("new source and explicit retry each allow one notification and use the latest callback", async () => {
  let first = 0, latest = 0;
  const fixture = mount({ src: "https://media.example/lesson.mp4", onSourceError: () => { first++; } });
  fixture.nativeError(2);
  fixture.render({ onSourceError: () => { latest++; } });
  fixture.nativeError(2);
  assert.equal(first, 1);
  assert.equal(latest, 0, "callback changes do not restart or reset a failed source");
  fixture.retry();
  fixture.nativeError(2);
  fixture.nativeError(2);
  assert.equal(latest, 1);
  fixture.render({ src: "https://media.example/refreshed.mp4" });
  fixture.nativeError(2);
  fixture.nativeError(2);
  assert.equal(latest, 2);
  fixture.cleanup();
});

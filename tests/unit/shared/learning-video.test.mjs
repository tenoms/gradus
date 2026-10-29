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
const React = { createElement: () => null };
const forwardRef = fn => fn;
const MediaStudyContext = {};
const useContext = () => null;
const useRef = () => ({ current: globalThis.__learningVideoFixture.video });
const useState = value => [value, next => globalThis.__learningVideoFixture.updates.push(next)];
const useEffect = fn => { globalThis.__learningVideoFixture.effect = fn; };
const useImperativeHandle = () => {};
const RefreshCw = () => null;
`;
const { default: LearningVideo } = await import(`data:text/javascript;base64,${Buffer.from(prelude + output).toString("base64")}`);

function mount({ src = "https://media.example/lesson.m3u8", mse = true, native = "maybe", deferred = false } = {}) {
  const calls = [];
  const fixture = {
    calls,
    updates: [],
    video: {
      canPlayType: () => native,
      removeAttribute: name => calls.push(["removeAttribute", name]),
      load: () => calls.push(["load"]),
    },
    effect: undefined,
    resolve: undefined,
    loadHls: undefined,
  };
  class Hls {
    static isSupported() { return mse; }
    static Events = { ERROR: "error" };
    on(event, callback) { calls.push(["on", event]); fixture.onHlsError = callback; }
    loadSource(url) { calls.push(["loadSource", url]); }
    attachMedia(video) { calls.push(["attachMedia", video]); }
    destroy() { calls.push(["destroy"]); }
  }
  fixture.loadHls = () => {
    calls.push(["importHls"]);
    if (deferred) return new Promise(resolve => { fixture.resolve = () => resolve({ default: Hls }); });
    return Promise.resolve({ default: Hls });
  };
  globalThis.__learningVideoFixture = fixture;
  LearningVideo({ src }, null);
  fixture.cleanup = fixture.effect();
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
  assert.ok(unsupported.updates.some(value => typeof value === "string" && value.includes("不支持此视频格式")));
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
  assert.ok(failed.updates.includes("视频流加载失败，请重试。"));
  assert.ok(failed.updates.includes("manifestLoadError"));
  failed.cleanup();
});

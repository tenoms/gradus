import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { mathVideoDescription, mathVideoRequest, mathVideoSource } from "../../../src/features/math/media/math-video-source.mjs";

test("video descriptions omit provider metadata while preserving lesson explanations", () => {
  assert.equal(mathVideoDescription(JSON.stringify({ vid: "original-vid", hls: ["https://media.example/lesson.m3u8"], uploader: { email: "uploader@example.test" } })), "");
  assert.equal(mathVideoDescription("先利用行列式性质，再展开计算。"), "先利用行列式性质，再展开计算。");
  assert.equal(mathVideoDescription('{"答案":48}'), '{"答案":48}');
});

test("math playback prefers returned media links even when the record also has a provider VID", () => {
  assert.deepEqual(mathVideoSource({ PolyvVID: "provider-vid", VideoUrl: "https://media.example/stream?token=opaque" }), {
    url: "https://media.example/stream?token=opaque", vid: "provider-vid",
  });
  assert.deepEqual(mathVideoSource({ Vid: "provider-vid", Files: "https://media.example/handout.pdf;https://media.example/lesson.m3u8?signature=opaque" }), {
    url: "https://media.example/lesson.m3u8?signature=opaque", vid: "provider-vid",
  });
  assert.deepEqual(mathVideoSource({ PolyvVID: "https://media.example/lesson.mp4" }), {
    url: "https://media.example/lesson.mp4", vid: "",
  });
  assert.deepEqual(mathVideoSource({ BusType: "视频解析", BusValue: "original-vid", FileUrl: "https://media.example/cover.jpg" }), {
    url: "", vid: "original-vid",
  });
});

test("math playback forwards existing playback credentials without deriving them from unrelated fields", () => {
  assert.deepEqual(mathVideoRequest({ PlayVid: "original-vid", PlaySafe: "given-token", sign: "given-sign", ts: 123, appId: "given-app" }), {
    vid: "original-vid", playsafe: "given-token", sign: "given-sign", ts: 123, appId: "given-app",
  });
  assert.deepEqual(mathVideoRequest({ Vid: "original-vid", sign: "incomplete", ID: 4, BusValue: 50 }), { vid: "original-vid" });
  assert.equal(mathVideoSource({ BusType: 2, BusValue: 50 }).vid, "", "course progress is not a provider identifier");
});

const source = await readFile(new URL("../../../src/features/math/media/math-video.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/import \{[^}]+\} from ["'][^"']+["'];?/g, "");
globalThis.__mathVideoFixture = { api: () => { throw new Error("unexpected provider request"); }, mathVideoRequest, mathVideoSource };
const { loadMathVideo } = await import(`data:text/javascript;base64,${Buffer.from("const {mathVideoRequest,mathVideoSource}=globalThis.__mathVideoFixture; const api=(...args)=>globalThis.__mathVideoFixture.api(...args);" + output).toString("base64")}`);

test("direct math playback avoids the provider resolver and VID playback uses the session-scoped API", async () => {
  assert.deepEqual(await loadMathVideo({ PolyvVID: "vid", VideoUrl: "https://media.example/lesson.mp4" }), { url: "https://media.example/lesson.mp4" });
  const calls = [];
  globalThis.__mathVideoFixture.api = async (...args) => {
    calls.push(args);
    return { url: "https://media.example/resolved.mp4", poster: "https://media.example/poster.jpg", duration: 100 };
  };
  const result = await loadMathVideo({ BusType: "视频解析", BusValue: "vid", PlayToken: "given-token" });
  assert.equal(result.url, "https://media.example/resolved.mp4");
  assert.deepEqual(calls, [["/api/platform/math/video", { method: "POST", body: JSON.stringify({ vid: "vid", playsafe: "given-token" }) }]]);
  await assert.rejects(loadMathVideo({ FileUrl: "https://media.example/handout.pdf" }), /此视频暂时无法播放，请稍后重试。/);
  assert.equal(calls.length, 1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createHash } from "node:crypto";
import { decodeMathVideoMetadata, mathVideoSource, resolveMathVideo } from "../../../server/integrations/math-video.mjs";

const vid = "1234567890abcdef1234567890abcdef_1";
const metadata = { mp4: ["https://media.example.test/lesson.mp4"], first_image: "//media.example.test/poster.jpg", duration: "100" };
function encoded(value, id = vid) {
  const digest = createHash("md5").update(id).digest("hex");
  const cipher = createCipheriv("aes-128-cbc", Buffer.from(digest.slice(0, 16)), Buffer.from(digest.slice(16)));
  return { body: Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value)).toString("base64url")), cipher.final()]).toString("hex") };
}

test("math metadata follows the source Polyv AES and base64 transport", () => {
  assert.deepEqual(decodeMathVideoMetadata(encoded(metadata), vid), metadata);
  for (const response of [null, {}, { body: "bad ciphertext" }, encoded(metadata, "wrong-vid")])
    assert.throws(() => decodeMathVideoMetadata(response, vid), error => error.status === 502 && !error.message.includes("ciphertext"));
});

test("math videos use only returned media URLs and retain source metadata", () => {
  assert.deepEqual(mathVideoSource(metadata), { url: metadata.mp4[0], poster: "https://media.example.test/poster.jpg", duration: 100 });
  assert.equal(mathVideoSource({ ...metadata, keepsource: "1", play_source_url: "https://media.example.test/source.mp4" }).url, "https://media.example.test/source.mp4");
  assert.equal(mathVideoSource({ ...metadata, seed: 1, keepsource: "1", play_source_url: "https://media.example.test/source.mp4?source=original" }, { playsafe: "given-token", sign: "given-sign", ts: 123, appId: "given-app" }).url, "https://media.example.test/source.mp4?source=original", "the source SDK selects kept originals after applying authorization to HLS");
  for (const value of [{}, { mp4: ["javascript:alert(1)"] }, { ...metadata, outflow: "true" }, { ...metadata, timeoutflow: true }])
    assert.throws(() => mathVideoSource(value), error => error.status === 502);
});

test("HLS follows the source SDK without inventing authorization requirements or tokens", () => {
  const protectedVideo = { ...metadata, seed: 1, hls: ["https://media.example.test/lesson.m3u8?source=original"] };
  assert.equal(mathVideoSource(protectedVideo).url, protectedVideo.hls[0], "AES HLS may be available without an extra playback token; the CDN decides access");
  assert.equal(mathVideoSource(protectedVideo, { playsafe: "https://credentials.example.test/token" }).url, protectedVideo.hls[0], "arbitrary credential URLs are not fetched");
  const token = new URL(mathVideoSource(protectedVideo, { playsafe: "returned+token", appId: "returned-app" }).url);
  assert.equal(token.searchParams.get("token"), "returned+token");
  assert.equal(token.searchParams.get("appId"), "returned-app");
  assert.equal(token.searchParams.get("source"), "original");
  const signed = new URL(mathVideoSource(protectedVideo, { sign: "returned-sign", ts: 123 }).url);
  assert.equal(signed.searchParams.get("sign"), "returned-sign");
  assert.equal(signed.searchParams.get("ts"), "123");
});

test("math video resolver requests fixed source hosts with backup on malformed metadata", async () => {
  const calls = [];
  const result = await resolveMathVideo({ vid }, { requestJson: async url => {
    calls.push(url);
    return calls.length === 1 ? { body: "malformed" } : encoded(metadata);
  } });
  assert.deepEqual(calls, [`https://player.polyv.net/secure/${vid}.json`, `https://static.polyv.net/secure/${vid}.json`]);
  assert.equal(result.url, metadata.mp4[0]);
  for (const input of [null, {}, { vid: "../private" }, { vid: "https://private.test" }, { vid, sign: {} }])
    await assert.rejects(resolveMathVideo(input, { requestJson: () => assert.fail("invalid input must not contact a source") }), error => error.status === 400);
  await assert.rejects(resolveMathVideo({ vid }, { requestJson: async () => { throw new Error("private detail"); } }), error => error.status === 502 && !error.message.includes("private"));
});

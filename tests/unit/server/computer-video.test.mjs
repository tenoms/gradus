import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import {
  createUpstreamClient,
  decodeComputerVideoResponse,
} from "../../../server/integrations/upstream.mjs";
import { readPlatformDefaults } from "../../../server/integrations/platform-config.mjs";
const key = Buffer.from("1234567890abcdef"),
  iv = Buffer.from("fedcba0987654321");
function encrypted(text) {
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  return Buffer.concat([cipher.update(text, "utf8"), cipher.final()]).toString(
    "base64",
  );
}
const playable = "https://media.example.test/video.m3u8?signature=fixture";
test("authorized computer V2 video response decrypts signed URLs without losing metadata", () => {
  const source = {
    code: 200,
    data: {
      mediaList: [
        { playURL: encrypted(playable), definition: "HD" },
        { playURL: "https://media.example.test/clear.mp4" },
      ],
      duration: 50,
    },
  };
  const result = decodeComputerVideoResponse(source, { key, iv });
  assert.equal(result.data.mediaList[0].playURL, playable);
  assert.equal(result.data.mediaList[0].definition, "HD");
  assert.equal(result.data.duration, 50);
  assert.equal(source.data.mediaList[0].playURL.startsWith("https://"), false);
  assert.equal(
    result.data.mediaList[1].playURL,
    "https://media.example.test/clear.mp4",
  );
});
test("video permission failures stay unchanged and malformed ciphertext returns a bounded error", () => {
  const denied = { code: 403, data: null, msg: "没有播放权限" };
  assert.equal(decodeComputerVideoResponse(denied), denied);
  assert.throws(
    () =>
      decodeComputerVideoResponse(
        { data: { mediaList: [{ playURL: "malformed" }] } },
        { key, iv },
      ),
    (error) => error.status === 502 && !error.message.includes("malformed"),
  );
});
test("computer adapter decrypts only V2 media URLs and preserves the Tencent response", async () => {
  const config = readPlatformDefaults({ env: {}, configFile: false });
  config.computer.videoKey = key.toString();
  config.computer.videoIv = iv.toString();
  const client = createUpstreamClient(config, {
    requestJson: async () => ({ code: 200, data: { mediaList: [{ playURL: encrypted(playable) }] } }),
  });
  const result = await client.computerRequest("/api/exam/wx/course/get_play_info/v2", {}, { token: "fixture" });
  assert.equal(result.data.mediaList[0].playURL, playable);
  const tencent = await client.computerRequest("/api/exam/wx/course/vod/get_play_info", {}, { token: "fixture" });
  assert.notEqual(tencent.data.mediaList[0].playURL, playable);
});

import { createDecipheriv, createHash } from "node:crypto";
import { ApiError } from "../infrastructure/api-error.mjs";

/** Matches the source mini-program's Polyv metadata transport, without loading a player SDK. */
export function decodeMathVideoMetadata(response, vid) {
  try {
    if (typeof response?.body !== "string" || !/^(?:[a-f\d]{32})+$/i.test(response.body)) throw new Error("invalid metadata");
    const digest = createHash("md5").update(vid).digest("hex");
    const decipher = createDecipheriv("aes-128-cbc", Buffer.from(digest.slice(0, 16)), Buffer.from(digest.slice(16)));
    decipher.setAutoPadding(false);
    const encoded = Buffer.concat([decipher.update(response.body, "hex"), decipher.final()])
      .toString("utf8").replaceAll("-", "+").replaceAll("_", "/").replace(/[^A-Za-z\d+/]/g, "");
    const metadata = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("invalid metadata");
    return metadata;
  } catch {
    throw new ApiError("数学视频信息读取失败，请稍后重试", 502);
  }
}

function mediaUrl(value) {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function mathVideoSource(metadata, parameters = {}) {
  if ([metadata.outflow, metadata.timeoutflow].some(value => value === true || value === "true"))
    throw new ApiError("数学视频来源暂时不可用，请稍后重试", 502);
  const usesHls = Number(metadata.seed) === 1 && String(metadata.keepsource) !== "1";
  let sources = usesHls ? metadata.hls : metadata.mp4;
  if (String(metadata.keepsource) === "1") sources = metadata.play_source_url;
  const url = mediaUrl((Array.isArray(sources) ? sources : [sources]).find(value => mediaUrl(value)));
  if (!url) throw new ApiError("此视频尚未返回可播放地址", 502);
  const playable = new URL(url);
  if (usesHls) {
    if (parameters.playsafe && !/^https?:\/\//i.test(parameters.playsafe)) {
      playable.searchParams.set("token", parameters.playsafe);
    } else if (parameters.sign && parameters.ts) {
      playable.searchParams.set("sign", parameters.sign);
      playable.searchParams.set("ts", String(parameters.ts));
    }
    if (parameters.appId) playable.searchParams.set("appId", parameters.appId);
  }
  return {
    url: playable.href,
    poster: mediaUrl(metadata.first_image),
    duration: Number.isFinite(Number(metadata.duration)) ? Number(metadata.duration) : 0,
  };
}

export async function resolveMathVideo(input, { requestJson }) {
  if (!input || typeof input.vid !== "string" || !/^[A-Za-z\d_-]{1,128}$/.test(input.vid))
    throw new ApiError("数学视频标识格式不正确", 400);
  const parameters = { vid: input.vid };
  for (const field of ["playsafe", "sign", "ts", "appId"]) {
    const value = input[field];
    if (value === undefined || value === null || value === "") continue;
    if (!["string", "number"].includes(typeof value) || String(value).length > 4096)
      throw new ApiError("数学视频播放参数格式不正确", 400);
    parameters[field] = String(value);
  }
  let metadata;
  for (const host of ["player.polyv.net", "static.polyv.net"]) {
    try {
      const response = await requestJson(`https://${host}/secure/${parameters.vid}.json`);
      metadata = decodeMathVideoMetadata(response, parameters.vid);
      break;
    } catch {}
  }
  if (!metadata) throw new ApiError("数学视频信息读取失败，请稍后重试", 502);
  return mathVideoSource(metadata, parameters);
}

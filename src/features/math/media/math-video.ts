import { api } from "../../../shared/api/client";
import type { MathRow } from "../api/math";
import { mathVideoRequest, mathVideoSource } from "./math-video-source.mjs";

export type MathVideo = { url: string; poster?: string; duration?: number };

export async function loadMathVideo(row: MathRow): Promise<MathVideo> {
  const source = mathVideoSource(row);
  if (source.url) return { url: source.url };
  if (!source.vid) throw new Error("此视频尚未返回可播放的地址。");
  return api<MathVideo>("/api/platform/math/video", {
    method: "POST",
    body: JSON.stringify(mathVideoRequest(row)),
  });
}

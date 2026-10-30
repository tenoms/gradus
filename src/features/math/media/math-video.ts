import { api } from "../../../shared/api/client";
import type { MathRow } from "../api/math";
import { mathVideoRequest, mathVideoSource } from "./math-video-source.mjs";

export type MathVideo = { url: string; poster?: string; duration?: number };
type MathVideoId = string | number;
export type MathVideoOrigin =
  | { kind: "analysis"; questionId: MathVideoId; itemId?: MathVideoId }
  | { kind: "resolve"; questionId: MathVideoId; itemId?: MathVideoId }
  | { kind: "course"; calendarId: MathVideoId; productId: MathVideoId; itemId: MathVideoId }
  | { kind: "special"; specialId: MathVideoId; itemId: MathVideoId }
  | { kind: "product"; productId: MathVideoId };

export async function loadMathVideo(row: MathRow, options: { refresh?: boolean; origin?: MathVideoOrigin } = {}): Promise<MathVideo> {
  const source = mathVideoSource(row);
  if (!source.vid && !options.origin) {
    if (source.url) return { url: source.url };
    throw new Error("此视频暂时无法播放，请稍后重试。");
  }
  return api<MathVideo>("/api/platform/math/video", {
    method: "POST",
    body: JSON.stringify({
      ...mathVideoRequest(row),
      ...(source.url ? { url: source.url } : {}),
      ...(options.origin ? { origin: options.origin } : {}),
      ...(options.refresh ? { refresh: true } : {}),
    }),
  });
}

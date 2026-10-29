const sourceShield = [
  "王道",
  "天勤",
  "楼楼",
  "率辉",
  "风华哥",
  "文都",
  "启航",
  "海天",
  "海文",
  "新祥旭",
];
export function lessonDanmaku(lesson) {
  return (
    Array.isArray(lesson?.lessonBulletComments)
      ? lesson.lessonBulletComments
      : []
  )
    .map((row, index) => {
      const text = String(row?.bulletComments ?? ""),
        time = Number.parseInt(String(row?.releaseTime), 10);
      return {
        key: row?.id ? `server-${row.id}` : `source-${index}`,
        text,
        time,
        index,
      };
    })
    .filter(
      (row) => row.text.trim() && Number.isFinite(row.time) && row.time >= 0,
    )
    .sort((a, b) => a.time - b.time || a.index - b.index);
}
export function activeDanmaku(rows, current, windowSeconds = 6) {
  const time = Number(current);
  if (!Number.isFinite(time) || time < 0) return [];
  return rows
    .filter((row) => row.time <= time + 0.5 && time - row.time < windowSeconds)
    .slice(-8);
}
export function danmakuTime(value) {
  const time = Math.max(0, Math.floor(Number(value) || 0)),
    h = Math.floor(time / 3600),
    m = Math.floor((time % 3600) / 60),
    s = time % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
export function courseDanmakuPayload(lesson, message, position, hasPlayed) {
  const text = String(message || "").trim();
  if (!lesson?.id) throw new Error("请先选择一个可播放课时");
  if (!hasPlayed) throw new Error("视频尚未播放，请开始播放后发送");
  if (!text) throw new Error("请输入弹幕内容");
  if (text.length > 20) throw new Error("弹幕字数不能大于20");
  if (sourceShield.some((term) => text.includes(term)))
    throw new Error("请爱护芝士课程弹幕环境");
  const current = Number(position);
  if (!Number.isFinite(current) || current < 0)
    throw new Error("暂时无法读取播放位置，请稍后重试");
  return { lessonId: lesson.id, bulletComments: text, releaseTime: current };
}
export async function sendCourseDanmaku(request, payload) {
  const result = await request("computer", {
    path: "/api/exam/wx/bulletComment/add/",
    method: "POST",
    data: payload,
  });
  if (Number(result?.code) !== 200)
    throw new Error(
      result?.message || result?.msg || "弹幕未被平台接受，请爱护课程弹幕环境",
    );
  return result;
}

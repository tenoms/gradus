const httpUrl = value => {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value.trim())) return "";
  try { return new URL(value.trim()).href; } catch { return ""; }
};

/** Original video records can contain a playable URL, a provider VID, or both. */
export function mathVideoSource(row) {
  const ids = [row.PolyvVID, row.PlayVid, row.Vid, row.vid];
  const values = [
    row.VideoUrl, row.videoUrl, row.PlayUrl, row.playUrl, row.VLink,
    row.FileUrl, row.FilePath, row.Url, row.FilesUrl, row.Files,
    row.BusUrl, row.ContentUrl, row.BusValue, ...ids,
  ];
  const url = values.flatMap(value => typeof value === "string" ? value.split(/[;\n]/) : [])
    .map(httpUrl)
    .find(value => value && !/\.(?:pdf|docx?|pptx?|xlsx?|png|jpe?g|gif|webp|svg|mp3|wav)(?:[?#]|$)/i.test(value)) || "";
  const vid = [...ids, ...(/视频|录播/.test(`${row.BusType || ""} ${row.Type || ""}`) ? [row.BusValue] : [])]
    .find(value => typeof value === "string" && value.trim() && !httpUrl(value))?.trim() || "";
  return { url, vid };
}

export function mathVideoRequest(row) {
  const { vid } = mathVideoSource(row);
  const playsafe = row.playsafe || row.PlaySafe || row.playSafe || row.PlayToken;
  return {
    vid,
    ...(playsafe ? { playsafe: String(playsafe) } : {}),
    ...(row.sign && row.ts ? { sign: String(row.sign), ts: row.ts } : {}),
    ...(row.appId ? { appId: String(row.appId) } : {}),
  };
}

/** Video metadata in Content is transport data, not a lesson description. */
export function mathVideoDescription(content) {
  try {
    const metadata = JSON.parse(content);
    if (metadata && typeof metadata.vid === "string" && (metadata.mp4 || metadata.hls)) return "";
  } catch {}
  return content;
}

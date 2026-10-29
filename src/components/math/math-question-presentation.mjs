const httpUrl = value => typeof value === "string" && /^https?:\/\//i.test(value.trim()) ? value.trim() : "";

/** Empty editor HTML is not a question. Images and math inside a stem are content. */
export function hasMathQuestionContent(value) {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const source = String(value).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  if (/<(?:img|svg|math)\b/i.test(source) || /!\[[^\]]*\]\([^\n)]+\)/.test(source)) return true;
  return source.replace(/<[^>]*>/g, "").replace(/&(?:nbsp|#160|#x0*a0);/gi, " ").replace(/[\s\u200b\ufeff]/g, "").length > 0;
}

export function mathQuestionPrompt(question, stem = []) {
  const blocks = stem.map(row => row.Content).filter(hasMathQuestionContent);
  const image = httpUrl(question.QuestionImg);
  if (!blocks.length) {
    const content = [question.QuestionTxt, question.QuestionContent, question.Content].find(hasMathQuestionContent);
    if (content !== undefined) blocks.push(content);
    else if (!image && hasMathQuestionContent(question.Title)) blocks.push(question.Title);
  }
  return { content: blocks, image };
}

export function mathQuestionChoice(options, question = {}, { readOnly = false, lockAnalysis = false } = {}) {
  const answers = options.filter(option => Number(option.IsAnswer) === 1);
  const names = [question.Type, question.QuestionType, ...options.map(option => option.Name)].join(" ");
  const multiple = answers.length > 1 || /多选/.test(names);
  return { multiple, immediate: options.length > 0 && answers.length === 1 && !multiple && !readOnly && !lockAnalysis };
}

/** BusValue may contain a Polyv VID or a direct video URL in the original schema. */
export function mathQuestionMedia(row) {
  const video = /视频|录播/.test(`${row.BusType || ""} ${row.Type || ""}`) || !!(row.PolyvVID || row.PlayVid || row.Vid || row.vid);
  const url = [row.FileUrl, row.FilePath, row.Url, row.VideoUrl, row.VLink, ...(video ? [row.BusValue, row.PolyvVID, row.PlayVid, row.Vid, row.vid] : []), row.BusUrl, row.ContentUrl].map(httpUrl).find(Boolean) || "";
  if (url) return { kind: video || /\.(?:mp4|m3u8|webm|mov)(?:[?#]|$)/i.test(url) ? "video" : /\.(?:png|jpg|jpeg|gif|webp)(?:[?#]|$)/i.test(url) ? "image" : "file", url };
  if (video && (row.PolyvVID || row.PlayVid || row.Vid || row.vid || row.BusValue)) return { kind: "polyv", url: "" };
  return { kind: "none", url: "" };
}

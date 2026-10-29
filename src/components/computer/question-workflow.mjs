/** Practice saves one question at a time; paper answers remain editable drafts until hand-in. */
export function computerAnswerMode(launch = {}) {
  if (launch.readOnly) return "readonly";
  return launch.redo || launch.random || [3, 10, 18, 19].includes(Number(launch.examType))
    ? "practice"
    : "paper";
}

export function computerImmediateChoice(launch, exerciseType) {
  return computerAnswerMode(launch) === "practice" && !launch.voice && [1, 5].includes(Number(exerciseType));
}

export function computerChoiceAnswer(exerciseType, current, option) {
  const value = String(option);
  if (Number(exerciseType) !== 2) return value;
  const values = String(current || "").split(",").filter(Boolean);
  return (values.includes(value) ? values.filter(item => item !== value) : [...values, value]).sort().join(",");
}

/** Only known media paths are passed to a media element; a page link keeps its external destination. */
export function computerQuestionVideoSource(question = {}) {
  const value = question.videoUrl;
  if (typeof value !== "string" || !/^https?:\/\//i.test(value.trim())) return null;
  try {
    const url = new URL(value.trim());
    return { url: url.href, kind: /\.(mp4|m3u8|webm|ogg|ogv|m4v|mov)$/i.test(url.pathname) ? "media" : "page" };
  } catch { return null; }
}

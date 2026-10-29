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

const subjectPermissions = {
  "708024163360706560": "c",
  "701769479767592960": "data",
  "704332467330486272": "os",
  "707889875399086080": "network",
  "701769719702753280": "principle",
};
const termPermissions = { "707995511914893312": "rjgc", "709171523524628480": "sjk", "804349070033424384": "java" };
export function computerQuestionVideoPermission({ majorId, examCategory = 1, schoolPermission } = {}) {
  if (typeof schoolPermission === "string" && schoolPermission.trim()) return schoolPermission.trim();
  const category = Number(examCategory);
  const name = subjectPermissions[String(majorId)] || (category === 2 ? termPermissions[String(majorId)] : undefined);
  return name && [1, 2].includes(category) ? `wx_video_${category === 2 ? "term" : "ky"}_${name}` : "";
}

export function computerNextVideoCount(previous = 0) {
  const count = Math.max(0, Number(previous) || 0);
  return count < 4 ? count + 1 : count;
}
export function computerQuestionVideoAllowed(count, authorized) {
  return authorized === true || count < 3;
}

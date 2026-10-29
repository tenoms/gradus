import { answerProgress } from "../learning/answer-progress.mjs";

/** Drafts belong to both the Web learner and the selected upstream learner. */
export function computerDraftScope(session) {
  const yyb = session.user?.yyb;
  const upstream = session.platforms?.computer?.user?.userId;
  return JSON.stringify([session.user?.id || "guest", upstream || [yyb?.mode || "system", yyb?.baseUrl || "", session.account?.ref || "guest"]]);
}

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

/** A draft or an unsuccessful save never reveals the answer. Review and explicit skips may. */
export function computerAnalysisVisible(launch, submitted = false, finished = false, skipped = false) {
  const mode = computerAnswerMode(launch);
  return mode === "readonly" || (mode === "paper" ? finished : submitted || skipped);
}

export function computerOptionFeedback(option, expected, selected, revealed) {
  if (!revealed) return "";
  if (String(expected ?? "").split(",").includes(String(option))) return "correct";
  return selected ? "incorrect" : "";
}

export function computerQuestionProgress(launch, record, draft = false, finished = false, skipped = false) {
  const type = Number(record?.answerType),
    unanswered = record && Object.hasOwn(record, "answer") && !String(record.answer ?? "").trim() && !record.llmAnswer && type !== 1;
  return answerProgress({
    saved: !!record && !unanswered,
    draft,
    skipped: skipped || type === 4 || Number(record?.answerSource) === 15,
    correct: type === 1 ? true : type === 2 ? false : undefined,
    revealed: computerAnalysisVisible(launch, !!record, finished),
  });
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

export interface AnswerProgress {
  state: "correct" | "incorrect" | "saved" | "draft" | "skipped" | "unanswered";
  label: string;
}
export function answerProgress(input?: { saved?: boolean; draft?: boolean; skipped?: boolean; correct?: boolean; revealed?: boolean }): AnswerProgress;

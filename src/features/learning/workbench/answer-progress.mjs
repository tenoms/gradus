/** Saved describes persistence; correctness is shown only after grading is allowed. */
export function answerProgress({ saved = false, draft = false, skipped = false, correct, revealed = true } = {}) {
  if (skipped) return { state: "skipped", label: "已跳过" };
  if (saved) {
    if (revealed && correct === true) return { state: "correct", label: "已答对" };
    if (revealed && correct === false) return { state: "incorrect", label: "回答错误" };
    return { state: "saved", label: "已保存，待核对" };
  }
  return draft ? { state: "draft", label: "有草稿" } : { state: "unanswered", label: "未作答" };
}

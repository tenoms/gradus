/** Combine a question with optional detail without losing choices to sparse metadata. */
export function mergeExerciseDetail(exercise, detail) {
  const choices = detail?.questions ?? exercise.questions ?? exercise.questionList;
  return {
    ...exercise,
    ...(detail || {}),
    ...(Array.isArray(choices) ? { questions: choices, questionList: choices } : {}),
  };
}

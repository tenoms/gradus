export type MathGrade = {
  answer: string;
  correct: boolean | undefined;
  source: "options" | "answer-key" | "self-assessment";
};
export function mergeMathQuestion(
  original: Record<string, any> | undefined,
  fetched: Record<string, any> | undefined,
): Record<string, any> {
  const source = { ...original };
  // A learning wrapper's Answer is its mastery state; the nested question owns the answer key.
  if (original?._question_list) delete source.Answer;
  Object.assign(source, original?._question_list);
  return {
    ...source,
    ...fetched,
    TypeAnswer:
      fetched?.TypeAnswer ?? source.TypeAnswer ?? original?.TypeAnswer,
  };
}
export function gradeMathAnswer(
  question: Record<string, any>,
  options: Record<string, any>[],
  selected: string[],
  written: string,
): MathGrade {
  if (options.length) {
    const expected = options
      .filter((o) => Number(o.IsAnswer) === 1)
      .map((o) => String(o.ID));
    const mine = [...new Set(selected)];
    return {
      answer: mine.join(","),
      correct: expected.length
        ? mine.length === expected.length &&
          expected.every((id) => mine.includes(id))
        : undefined,
      source: expected.length ? "options" : "self-assessment",
    };
  }
  const expected = question.TypeAnswer ?? question.Answer;
  const answer = written.trim();
  return {
    answer,
    correct:
      expected != null && String(expected).trim() !== ""
        ? answer === String(expected).trim()
        : undefined,
    source:
      expected != null && String(expected).trim() !== ""
        ? "answer-key"
        : "self-assessment",
  };
}

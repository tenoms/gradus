export function schoolQuestionRecord(
  row: Record<string, any>,
  context: Record<string, any>,
  answer: string,
  correct: boolean,
  isChoice?: boolean,
): Record<string, any>;
export function schoolCompletionRecord(
  context: Record<string, any>,
): Record<string, any>;
export function schoolAllAnswered(rows: Record<string, any>[]): boolean;

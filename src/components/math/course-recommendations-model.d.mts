type R = Record<string, any>;
export function recommendationRecordComplete(row: R): boolean;
export function recommendationGroups(rows: R[], isSuper?: boolean): R[];
export function recommendationCanAddTopic(groups: R[]): {
  additional: number;
  remaining: number;
  allowed: boolean;
};
export function recommendationMetadata(
  groups: R[],
  specialInfo: any,
  originalQuestions?: R[],
  isSuper?: boolean,
): { groups: R[]; topics: R[] };
export function recommendationOptions(question: R): R[];
export function recommendationOptionCorrect(
  options: R[],
  answer: string,
): boolean;
export function buildRecommendationRecord(
  context: R,
  question: R,
  answer?: string,
  correct?: number,
): R;
export function recommendationCompletion(context: R): R;
export function recommendationAppend(
  context: R,
  meta: R,
  Links: string | number,
): R;
export function recommendationSavedRecord(payload: R, response: any): R;
export function recommendationUpdate(
  rows: R[],
  questionId: string | number,
  record: R,
): R[];
export function recommendationResolve(question: R, rows: R[]): R;
export function recommendationPrintUrl(context: R, group: R): string;
export function teacherRecommendationRows(
  rows: R[],
  originQuestionId: string | number,
): R[];
export function teacherRecommendationRecord(
  context: R,
  question: R,
  existing: R,
  correct: number,
): R;

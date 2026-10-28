export function courseRankingRequest(context: Record<string, any>): {
  command: string;
  params: Record<string, any>;
};
export function courseRankingVote(
  stuid: string,
  row: Record<string, any>,
): { path: string; data: Record<string, any> };
export function latestCourseExamParams(
  context: Record<string, any>,
  meta: Record<string, any>,
  withProduct?: boolean,
): Record<string, any>;
export function courseQuestionAccuracy(
  row: Record<string, any> | undefined,
  score: number,
): number | null;
export function latestCourseScore(row: any): number | null;
export function courseDistribution(
  row: Record<string, any> | undefined,
): { label: string; count: number }[];

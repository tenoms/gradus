export function reportTables(response: any): Record<string, any>[][];
export function reportRows(
  response: any,
  index?: number,
): Record<string, any>[];
export function reportFileLinks(
  ...sources: any[]
): { url: string; label: string }[];
export function scoreGroups(
  rows: Record<string, any>[],
  field?: string,
): {
  label: string;
  max: number;
  score: number;
  count: number;
  loss: number;
  percent: number | null;
}[];
export function classifyWeeklyDimension(row: Record<string, any>): string;
export function weeklyDimensionScores(
  rows: Record<string, any>[],
): { label: string; score: number; max: number; percent: number | null }[];
export function weeklyRhythm(
  rows: Record<string, any>[],
): { id: any; number: number; seconds: number | null; status: string }[];
export function weeklyTaskGroups(
  rows: Record<string, any>[],
  hours?: number,
): { rows: Record<string, any>[]; hours: number }[];

export function courseReportPrintLinks(
  context: Record<string, any>,
  meta: Record<string, any>,
  papers?: Record<string, any>[],
): { url: string; label: string }[];

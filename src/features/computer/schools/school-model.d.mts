export const schoolRegions: { label: string; provinces: string[][] }[];
export function schoolQuery(
  filters: Record<string, any>,
  page?: number,
): Record<string, any>;
export function schoolTags(row: Record<string, any>): string[];
export function schoolHasFeature(
  row: Record<string, any>,
  feature: string,
): boolean;
export function schoolRowKey(row: Record<string, any>): string;
export function schoolMetric(value: any): string;
export function targetSchoolIds(value: any): string[];
export function targetSchoolPayload(
  ids: string[],
  schools: Record<string, any>[],
): { schoolId: string };
export function matchingSchoolPlan(
  plans: Record<string, any>[],
  selected: Record<string, any>,
  year: string | number,
): Record<string, any> | undefined;

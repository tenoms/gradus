export const mathSubjects: string[];
export const mathStages: { name: string; description: string }[];
export function initialMathSubject(value: unknown): string;
export function weeklySubjectCode(subject: string): string;
export function weeklyStageCode(stage: string): string;
export function matchesMathSubject(row: Record<string, any>, subject: string): boolean;
export function albumStage(row: Record<string, any>): string;
export function groupMathAlbums(rows: Record<string, any>[]): { name: string; rows: Record<string, any>[] }[];
export function mathMenuTree(rows: Record<string, any>[]): Record<string, any>[];

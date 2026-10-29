import type { StudyData } from "./store";
export type StudyChange = ({ kind: "task.add"; task: StudyData["tasks"][number] } | { kind: "task.done"; taskId: string; done: boolean } | { kind: "task.delete"; taskId: string } | { kind: "activity.add"; activity: StudyData["activities"][number] } | { kind: "goal.set"; goalMinutes: number } | { kind: "math-plan.set"; mathPlan: NonNullable<StudyData["mathPlan"]> } | { kind: "replace"; data: StudyData }) & { id: string };
export interface SyncStatus { state: "loading" | "saving" | "synced" | "error" | "local"; pending: number; message?: string }
export interface StudyEnvelope { data: StudyData; revision: number }
export function emptyStudyData(): StudyData;
export function applyStudyChange(data: StudyData, change: StudyChange): StudyData;
export function createStudySync(options: {
  transport: { get(): Promise<StudyEnvelope>; put(value: StudyEnvelope): Promise<StudyEnvelope> };
  readCache(): { data: StudyData; pending: StudyChange[] } | null;
  writeCache(value: { data: StudyData; pending: StudyChange[] }): void;
  onChange(data: StudyData, status: SyncStatus): void;
}): { readonly data: StudyData; readonly status: SyncStatus; change(value: StudyChange): void; sync(refresh?: boolean): Promise<void>; stop(): void };

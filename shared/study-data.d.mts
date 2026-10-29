export type Platform = "math" | "computer";
export interface StudyTask {
  id: string;
  title: string;
  platform: Platform;
  date: string;
  done: boolean;
  createdAt: string;
}
export interface Activity {
  id: string;
  at: string;
  platform: Platform;
  type: string;
  title: string;
  correct?: number;
  total?: number;
  durationSeconds?: number;
  path?: string;
}
export interface StudyData {
  tasks: StudyTask[];
  activities: Activity[];
  goalMinutes: number;
  mathPlan?: { subject: string; stage: string };
}
export function validateStudyData(input: unknown): StudyData;

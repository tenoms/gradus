import type { Activity, Platform } from "../../../shared/study-data.mjs";
export function studyDate(value?: string | number | Date): string;
export function studySummary(activities: Activity[], options?: { date?: string; platform?: Platform }): {
  events: Activity[];
  durationSeconds: number;
  questions: number;
  correct: number;
  graded: number;
  days: number;
};
export function studyDurationValue(seconds: number): { value: number; unit: string };
export function formatStudyDuration(seconds: number): string;
export function studyWeek(activities: Activity[], now?: string | number | Date): { date: string; count: number }[];

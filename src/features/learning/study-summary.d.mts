import type { Activity, Platform } from "../../../shared/study-data.mjs";
export function studyDate(value?: string | number | Date): string;
export type StudyFilter = { date?: string; platform?: Platform; fromDate?: string; toDate?: string };
export function filterStudyActivities(activities: Activity[], options?: StudyFilter): Activity[];
export function studyPeriodRange(days: number | "all", now?: string | number | Date): { fromDate?: string; toDate: string };
export function studySummary(activities: Activity[], options?: StudyFilter): {
  events: Activity[];
  durationSeconds: number;
  questions: number;
  correct: number;
  graded: number;
  days: number;
};
export function studyTimeBreakdown(activities: Activity[], options?: StudyFilter): { key: "reading" | "media" | "unclassified"; label: string; durationSeconds: number }[];
export function studyTrend(activities: Activity[], options?: { days?: number; now?: string | number | Date; platform?: Platform; metric?: "duration" | "questions" | "activities" }): { date: string; count: number; durationSeconds: number; questions: number; activityCount: number }[];
export function studyDurationValue(seconds: number): { value: number; unit: string };
export function formatStudyDuration(seconds: number): string;
export function studyWeek(activities: Activity[], now?: string | number | Date): { date: string; count: number }[];

import type { Activity, Platform } from "../../../../shared/study-data.mjs";
export type StudyTimerDetails = { platform: Platform; title: string; path: string; mode?: "reading" | "media"; enabled?: boolean };
export type StudyTimerHandle = { setEnabled(value: boolean): void; stop(): void };
export function createStudyClock(options: { report(activity: Activity): void; now?: () => number; makeId?: () => string; idleMs?: number; flushMs?: number }): {
  register(details: StudyTimerDetails): StudyTimerHandle;
  interact(): void;
  setForeground(value: boolean): void;
  tick(): void;
  reset(): void;
};

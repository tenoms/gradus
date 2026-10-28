import { useSyncExternalStore } from "react";
import type { Platform } from "./api";
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
interface StudyData {
  tasks: StudyTask[];
  activities: Activity[];
  goalMinutes: number;
}
const defaultData: StudyData = { tasks: [], activities: [], goalMinutes: 60 };
let scope = "guest";
let current: StudyData = defaultData;
let currentRaw = "";
const listeners = new Set<() => void>();
function key() {
  return `study-space:v1:${scope}`;
}
function read() {
  try {
    const raw = localStorage.getItem(key()) || "";
    if (raw !== currentRaw) {
      currentRaw = raw;
      current = raw
        ? { ...defaultData, ...JSON.parse(raw) }
        : { ...defaultData, tasks: [], activities: [] };
    }
  } catch {
    current = { ...defaultData, tasks: [], activities: [] };
  }
  return current;
}
function emit() {
  listeners.forEach((l) => l());
}
function save(data: StudyData) {
  current = data;
  currentRaw = JSON.stringify(data);
  localStorage.setItem(key(), currentRaw);
  emit();
}
export function setUserScope(ref?: string) {
  scope = ref || "guest";
  currentRaw = "__reload";
  read();
  emit();
}
export function useStudyData() {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    read,
    () => defaultData,
  );
}
export function addTask(task: Omit<StudyTask, "id" | "done" | "createdAt">) {
  save({
    ...read(),
    tasks: [
      ...read().tasks,
      {
        ...task,
        id: crypto.randomUUID(),
        done: false,
        createdAt: new Date().toISOString(),
      },
    ],
  });
}
export function toggleTask(id: string) {
  save({
    ...read(),
    tasks: read().tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
  });
}
export function deleteTask(id: string) {
  save({ ...read(), tasks: read().tasks.filter((t) => t.id !== id) });
}
export function setGoal(goalMinutes: number) {
  save({ ...read(), goalMinutes });
}
export function recordActivity(activity: Omit<Activity, "id" | "at">) {
  save({
    ...read(),
    activities: [
      { ...activity, id: crypto.randomUUID(), at: new Date().toISOString() },
      ...read().activities,
    ].slice(0, 2000),
  });
}
export const recordStudy = recordActivity;
export function exportStudyData() {
  const blob = new Blob([JSON.stringify(read(), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `知序学习记录-${new Date().toLocaleDateString("sv-SE")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
export function importStudyData(value: unknown) {
  const d = value as StudyData;
  if (!d || !Array.isArray(d.tasks) || !Array.isArray(d.activities))
    throw new Error("文件格式不正确，请使用知序导出的学习记录");
  for (const t of d.tasks) {
    if (
      typeof t.id !== "string" ||
      typeof t.title !== "string" ||
      !["math", "computer"].includes(t.platform) ||
      typeof t.date !== "string"
    )
      throw new Error("学习计划内容无效");
  }
  for (const a of d.activities) {
    if (
      typeof a.id !== "string" ||
      typeof a.at !== "string" ||
      typeof a.title !== "string" ||
      !["math", "computer"].includes(a.platform)
    )
      throw new Error("学习记录内容无效");
  }
  save({
    tasks: d.tasks,
    activities: d.activities,
    goalMinutes: Math.max(5, Math.min(480, Number(d.goalMinutes) || 60)),
  });
}
window.addEventListener("storage", () => {
  currentRaw = "__reload";
  read();
  emit();
});

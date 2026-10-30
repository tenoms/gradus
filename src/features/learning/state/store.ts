import { useSyncExternalStore } from "react";
import { api } from "../../../shared/api/client";
import { createId } from "../../../shared/lib/id.mjs";
import { applyStudyChange, createStudySync, emptyStudyData } from "./study-sync.mjs";
import type { StudyChange, SyncStatus } from "./study-sync.mjs";
import { validateStudyData } from "../../../../shared/study-data.mjs";
import type { StudyTask, Activity, StudyData } from "../../../../shared/study-data.mjs";
import { createStudyClock } from "../time/study-clock.mjs";
import type { StudyTimerDetails } from "../time/study-clock.mjs";
export type { StudyTask, Activity, StudyData } from "../../../../shared/study-data.mjs";
const defaultData = emptyStudyData();
let scope = "guest";
let current: StudyData = defaultData;
let syncStatus: SyncStatus = { state: "local", pending: 0 };
let synchronizer: ReturnType<typeof createStudySync> | undefined;
const listeners = new Set<() => void>();
function emit() { listeners.forEach(listener => listener()); }
function key() { return `study-space:v2:${scope}`; }
type WithoutChangeId<T> = T extends { id: string } ? Omit<T, "id"> : never;
function change(value: WithoutChangeId<StudyChange>) {
  const operation = { ...value, id: createId() } as StudyChange;
  if (synchronizer) synchronizer.change(operation);
  else {
    current = applyStudyChange(current, operation);
    try { localStorage.setItem(key(), JSON.stringify({ data: current, pending: [] })); }
    catch { syncStatus = { state: "error", pending: 0, message: "学习记录暂时无法保存，请导出备份。" }; }
    emit();
  }
}
export const studyClock = createStudyClock({ report: activity => change({ kind: "activity.add", activity }) });
export function registerStudyTime(details: StudyTimerDetails) {
  return scope === "guest" ? undefined : studyClock.register(details);
}
export function setUserScope(userId?: string) {
  const nextScope = userId ? `user:${userId}` : "guest";
  if (scope === nextScope && (synchronizer || !userId)) return;
  studyClock.reset();
  synchronizer?.stop();
  synchronizer = undefined;
  scope = nextScope;
  current = emptyStudyData();
  syncStatus = { state: userId ? "loading" : "local", pending: 0 };
  if (userId) {
    const cacheKey = key();
    synchronizer = createStudySync({
      transport: {
        get: () => api("/api/study/data", { headers: { "X-Study-User": userId } }),
        put: value => api("/api/study/data", { method: "PUT", headers: { "X-Study-User": userId }, body: JSON.stringify(value) }),
      },
      readCache: () => JSON.parse(localStorage.getItem(cacheKey) || "null"),
      writeCache: value => localStorage.setItem(cacheKey, JSON.stringify(value)),
      onChange(data, status) { current = data; syncStatus = status; emit(); },
    });
    current = synchronizer.data;
    void synchronizer.sync();
  }
  emit();
}
const subscribe = (callback: () => void) => { listeners.add(callback); return () => { listeners.delete(callback); }; };
export function useStudyData() { return useSyncExternalStore(subscribe, () => current, () => defaultData); }
export function useStudySync() { return useSyncExternalStore(subscribe, () => syncStatus, () => syncStatus); }
export function retryStudySync() { return synchronizer?.sync(true); }
export function addTask(task: Omit<StudyTask, "id" | "done" | "createdAt">) {
  change({ kind: "task.add", task: { ...task, id: createId(), done: false, createdAt: new Date().toISOString() } });
}
export function toggleTask(id: string) {
  const task = current.tasks.find(task => task.id === id);
  if (task) change({ kind: "task.done", taskId: id, done: !task.done });
}
export function deleteTask(id: string) { change({ kind: "task.delete", taskId: id }); }
export function setGoal(goalMinutes: number) { change({ kind: "goal.set", goalMinutes }); }
export function setMathPlan(mathPlan: NonNullable<StudyData["mathPlan"]>) { change({ kind: "math-plan.set", mathPlan }); }
export function recordActivity(activity: Omit<Activity, "id" | "at">) {
  change({ kind: "activity.add", activity: { ...activity, id: createId(), at: new Date().toISOString() } });
}
export const recordStudy = recordActivity;
export function exportStudyData() {
  const blob = new Blob([JSON.stringify(current, null, 2)], {
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
  const data = validateStudyData(value);
  change({ kind: "replace", data });
}
window.addEventListener("online", () => { void retryStudySync(); });
window.addEventListener("focus", () => { void retryStudySync(); });

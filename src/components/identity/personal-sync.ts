export const personalScopes = {
  bookshelf: "书架",
  favorites: "收藏",
  mistakes: "错题",
  notes: "笔记",
  answers: "作答历史",
  reports: "练习报告",
  progress: "学习进度",
} as const;

export type PersonalScope = keyof typeof personalScopes;
export type LearningPlatform = "math" | "computer";
export const platformNames: Record<LearningPlatform, string> = { math: "考研数学", computer: "计算机 408" };
export interface LinkedPlatform { status: "ready" | "unavailable" | "needs_verification"; subjectId?: string; error?: string }
export interface PersonalSyncStatus {
  connection: { baseUrl: string; apiKeyConfigured: boolean };
  binding: null | { id: string; openid: string; nickname?: string; ref: string; platforms: Partial<Record<LearningPlatform, LinkedPlatform>> };
  settings: { enabled: boolean; scopes: PersonalScope[] };
  summary: { total: number; byScope: Partial<Record<PersonalScope, number>>; lastSyncedAt?: string | null; lastError?: string | null };
}
export interface PersonalSourceAccount { ref: string; nickname?: string; status?: string; openid?: string }
export interface ImportedRecord {
  id?: string;
  platform?: LearningPlatform;
  scope?: PersonalScope;
  data: Record<string, any>;
  importedAt?: string;
  sourceUpdatedAt?: string;
  [key: string]: any;
}
export interface ImportPage {
  records: ImportedRecord[];
  samples?: ImportedRecord[];
  status: "ready" | "unsupported" | "needs_context";
  message?: string;
  count: number;
  hasMore?: boolean;
  nextPage?: number | null;
  requiredContext?: string[];
}
export interface RefreshResult extends ImportPage { added?: number; updated?: number; unchanged?: number }
export const personalSyncPath = "/api/learning/personal-sync";
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : "操作未完成，请稍后重试";
export function maskedIdentity(value: string) { return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value; }
export function syncDate(value?: string | null) {
  if (!value) return "尚未更新";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

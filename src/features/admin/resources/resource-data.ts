export type ResourceScope = "public" | "account" | "volatile";
export interface ResourceItem {
  sourceId: string; platform: "math" | "computer"; key: string; scope: ResourceScope; kind: string;
  path: string; command?: string; title?: string; revision: number; syncedAt: string; changedAt?: string;
  expiresAt?: string | null; expired?: boolean; mediaCount: number; entityCount: number;
}
export interface ResourceSource {
  id: string; platform: string; accountRef: string; scope?: ResourceScope; createdAt?: string; lastSeenAt?: string; count?: number;
}
export interface ResourceDetail extends ResourceItem {
  request: unknown; response: unknown; context?: Record<string, unknown>; source?: ResourceSource;
  entities?: { kind: string; count: number }[]; media?: { url: string; observedAt: string }[];
}
export interface PageInfo { page: number; pageSize: number; total: number; totalPages: number }
export interface ResourcePage {
  resources: ResourceItem[]; pagination: PageInfo;
  summary: { total: number; fresh: number; expired: number; mediaReferences: number };
  facets: { kinds: { value: string; count: number }[]; sources: ResourceSource[] };
}
export const scopeNames: Record<ResourceScope, string> = { public: "公共资源", account: "账号资源", volatile: "短效资源" };
export const platformName = (value: string) => value === "math" ? "考研数学" : "计算机 408";
export const message = (error: unknown) => error instanceof Error ? error.message : "操作失败，请重试";
export const displayName = (resource: ResourceItem) => resource.title || resource.command || resource.path?.split("/").filter(Boolean).at(-1) || resource.kind || "资源";
export const resourceId = (resource: ResourceItem) => `${resource.platform}/${resource.sourceId}/${resource.key}`;
export const resourceSelector = ({ platform, sourceId, key, revision }: ResourceItem) => ({ platform, sourceId, key, revision });
export const resourcePath = (resource: ResourceItem) => `/api/admin/resources/${encodeURIComponent(resource.platform)}/${encodeURIComponent(resource.sourceId)}/${encodeURIComponent(resource.key)}`;
export const sourceName = (source?: ResourceSource) => source ? source.accountRef ? `账号 ${source.accountRef} · ${source.id.slice(0, 8)}` : `公共资源域 · ${source.id.slice(0, 8)}` : "—";
export const dateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
};
export const expired = (resource: ResourceItem) => resource.expired === true || !resource.expiresAt || Date.parse(resource.expiresAt) <= Date.now();
export const validityName = (resource: ResourceItem) => resource.scope !== "public" ? "实时读取" : expired(resource) ? "访问时更新" : "有效缓存";
export const pretty = (value: unknown) => JSON.stringify(value, null, 2) ?? "null";
export function parseResource(value: string) {
  let response: unknown;
  try { response = JSON.parse(value); } catch { throw new Error("资源内容不是有效的 JSON，请修正后保存。"); }
  if (!response || typeof response !== "object") throw new Error("资源内容需要为 JSON 对象或数组。");
  return response;
}
export function downloadResources(resources: ResourceDetail[]) {
  const content = { exportedAt: new Date().toISOString(), count: resources.length, resources };
  const url = URL.createObjectURL(new Blob([pretty(content)], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `study-resources-${new Date().toISOString().slice(0, 10)}-${resources.length}.json`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

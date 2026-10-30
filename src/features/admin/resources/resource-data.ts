export type ResourceScope = "public" | "account" | "volatile";
export interface ResourceItem {
  sourceId: string; platform: "math" | "computer"; key: string; scope: ResourceScope; kind: string;
  path: string; command?: string; title?: string; typeLabel?: string; subtitle?: string; revision: number; syncedAt: string; changedAt?: string;
  expiresAt?: string | null; expired?: boolean; mediaCount: number; entityCount: number;
}
export interface ResourceSource {
  id: string; platform: string; accountRef: string; label?: string; scope?: ResourceScope; createdAt?: string; lastSeenAt?: string; count?: number;
}
export interface ResourceDetail extends ResourceItem {
  request: unknown; response: unknown; context?: Record<string, unknown>; source?: ResourceSource;
  entities?: { kind: string; count: number }[]; media?: { url: string; observedAt: string }[];
}
export interface PageInfo { page: number; pageSize: number; total: number; totalPages: number }
export interface ResourcePage {
  resources: ResourceItem[]; pagination: PageInfo;
  summary: { total: number; fresh: number; expired: number; mediaReferences: number };
  facets: { kinds: { value: string; label?: string; count: number }[]; sources: ResourceSource[] };
}
export const scopeNames: Record<ResourceScope, string> = { public: "公共资源", account: "账号资源", volatile: "实时资源" };
export const platformName = (value: string) => value === "math" ? "考研数学" : "计算机 408";
export const message = (error: unknown) => error instanceof Error ? error.message : "操作失败，请重试";
const resourceKindNames: Record<string, string> = {
  "math.books": "教辅书籍", "math.catalog": "教辅章节", "math.albums": "专题课程", "math.packets": "课程资料包", "math.questions": "题目", "math.question": "题目", "math.papers": "练习试卷",
  "computer.chapters": "章节目录", "computer.question": "题目", "computer.chapter_questions": "章节题目", "computer.media": "课程视频", "computer.exams": "练习试卷",
};
export const typeName = (kind: string, label?: string) => label || resourceKindNames[kind] || "学习资源";
export const displayName = (resource: ResourceItem) => {
  const title = resource.title?.trim();
  return title && title !== resource.path && title !== resource.command && title !== resource.kind && !/^\/?api\//i.test(title) && !/^[a-f0-9]{32,}$/i.test(title)
    ? title : typeName(resource.kind, resource.typeLabel);
};
export const entityName = (kind: string) => ({ question: "题目", analysis: "题目解析", file: "附件", book: "书籍", catalog: "章节", course: "课程", lesson: "课时", chapter: "章节", paper: "试卷", examination: "练习", exam: "练习", album: "专题", packet: "资料包", school: "院校", major: "专业", group: "题组", video: "视频", material: "学习资料" }[kind] || "其他内容");
export const resourceId = (resource: ResourceItem) => `${resource.platform}/${resource.sourceId}/${resource.key}`;
export const resourceSelector = ({ platform, sourceId, key, revision }: ResourceItem) => ({ platform, sourceId, key, revision });
export const resourcePath = (resource: ResourceItem) => `/api/admin/resources/${encodeURIComponent(resource.platform)}/${encodeURIComponent(resource.sourceId)}/${encodeURIComponent(resource.key)}`;
export const sourceName = (source?: ResourceSource) => source?.label || (source ? `${platformName(source.platform)}${source.accountRef ? "账号资源" : "公共资源"}` : "来源待确认");
export const dateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
};
export const expired = (resource: ResourceItem) => resource.expired === true || !resource.expiresAt || Date.parse(resource.expiresAt) <= Date.now();
export const validityName = (resource: ResourceItem) => resource.scope !== "public" ? "实时更新" : expired(resource) ? "待复核" : "暂不需复核";
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

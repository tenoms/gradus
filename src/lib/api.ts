export type ApiSpace = "admin" | "learning";
let apiSpace: ApiSpace = "learning";
export function configureApiSpace(space: ApiSpace) { apiSpace = space; }
export function resolveApiPath(path: string): string {
  if (path.startsWith("/api/auth/")) return `/api/${apiSpace}${path.slice(4)}`;
  if (/^\/api\/(platform|study)(?:\/|$)/.test(path) || /^\/api\/announcements(?:\/|$)/.test(path)) return `/api/learning${path.slice(4)}`;
  return path;
}

export type Platform = "math" | "computer";
export interface PlatformState {
  connected: boolean;
  user?: Record<string, any>;
  error?: string;
}
export interface YybConnection {
  mode: "system" | "custom";
  baseUrl: string;
  apiKeyConfigured: boolean;
  ref: string;
}
export interface Session {
  authenticated: boolean;
  space?: ApiSpace;
  user?: {
    id: string;
    username: string;
    displayName: string;
    role: "admin" | "learner";
    status: "active" | "disabled";
    yyb?: YybConnection;
  };
  account?: { ref: string; nickname?: string; name?: string; avatar?: string };
  platforms: Record<Platform, PlatformState>;
}
export const emptySession: Session = {
  authenticated: false,
  platforms: { math: { connected: false }, computer: { connected: false } },
};
let identity: string | undefined;
export function setApiIdentity(userId?: string) { identity = userId; }
export function studyIdentityHeaders(): Record<string, string> {
  return identity ? { "X-Study-User": identity } : {};
}
export async function studyFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const startedAs = identity;
  const headers = new Headers(options.headers);
  for (const [key, value] of Object.entries(studyIdentityHeaders())) if (!headers.has(key)) headers.set(key, value);
  const response = await fetch(resolveApiPath(path), { ...options, credentials: "same-origin", headers });
  if (startedAs !== identity) throw new Error("账号已切换，请在当前空间重新操作。");
  if (response.status === 401) window.dispatchEvent(new Event("study-session-expired"));
  if (response.status === 403) {
    const failure = await response.clone().json().catch(() => ({}));
    if (startedAs !== identity) throw new Error("账号已切换，请在当前空间重新操作。");
    if (failure.code === "USER_SCOPE_CHANGED") window.dispatchEvent(new Event("study-identity-changed"));
  }
  return response;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const startedAs = identity;
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await studyFetch(path, {
    ...options,
    headers,
  });
  const data = await response
    .json()
    .catch(() => ({ error: "服务器返回了无法读取的响应" }));
  if (startedAs !== identity) throw new Error("账号已切换，请在当前空间重新操作。");
  if (!response.ok)
    throw new ApiError(
      data.message ||
        (typeof data.error === "string" ? data.error : data.error?.message) ||
        `请求失败 (${response.status})`,
      response.status,
      data,
    );
  return data;
}
export interface PlatformRequest {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  data?: any;
  query?: Record<string, any>;
  encrypted?: boolean;
}
export function platformRequest<T = any>(
  platform: Platform,
  request: PlatformRequest,
): Promise<T> {
  return api<T>(`/api/platform/${platform}`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}
export function getSession(): Promise<Session> {
  return api("/api/auth/session");
}

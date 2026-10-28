export type Platform = "math" | "computer";
export interface PlatformState {
  connected: boolean;
  user?: Record<string, any>;
  error?: string;
}
export interface Session {
  authenticated: boolean;
  account?: { ref: string; nickname?: string; name?: string; avatar?: string };
  platforms: Record<Platform, PlatformState>;
}
export const emptySession: Session = {
  authenticated: false,
  platforms: { math: { connected: false }, computer: { connected: false } },
};
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
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response
    .json()
    .catch(() => ({ error: "服务器返回了无法读取的响应" }));
  if (response.status === 401)
    window.dispatchEvent(new Event("study-session-expired"));
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

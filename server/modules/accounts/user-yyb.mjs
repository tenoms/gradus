import { ApiError } from "../../infrastructure/api-error.mjs";

export const defaultYybSettings = () => ({ mode: "system", baseUrl: "", apiKey: "", ref: "", revision: 0 });

export function publicYybSettings(settings, assignedRef = "") {
  return { mode: settings.mode, baseUrl: settings.baseUrl, apiKeyConfigured: !!settings.apiKey, ref: settings.mode === "custom" ? settings.ref : assignedRef || "" };
}

export function userYybOverride(settings) {
  return settings.mode === "custom" ? { baseUrl: settings.baseUrl, apiKey: settings.apiKey } : undefined;
}

export function updateYybSettings(current, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError("YYB 配置格式不正确", 400);
  const mode = input.mode ?? current.mode;
  if (!["system", "custom"].includes(mode)) throw new ApiError("请选择系统分配或自有 YYB", 400);
  let baseUrl = input.baseUrl === undefined ? current.baseUrl : input.baseUrl;
  if (typeof baseUrl !== "string" || baseUrl.length > 2000) throw new ApiError("YYB 服务地址格式不正确", 400);
  baseUrl = baseUrl.trim().replace(/\/+$/, "");
  if (baseUrl || mode === "custom") {
    let url;
    try { url = new URL(baseUrl); } catch { throw new ApiError("YYB 服务地址必须为完整 HTTP 或 HTTPS 地址", 400); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new ApiError("YYB 服务地址只允许 HTTP 或 HTTPS，不能包含凭据、查询或片段", 400);
    baseUrl = url.href.replace(/\/+$/, "");
  }
  if (input.apiKey !== undefined && (typeof input.apiKey !== "string" || input.apiKey.length > 4096)) throw new ApiError("YYB API Key 格式不正确", 400);
  if (input.clearApiKey !== undefined && typeof input.clearApiKey !== "boolean") throw new ApiError("清除密钥选项格式不正确", 400);
  if (input.clearApiKey && input.apiKey) throw new ApiError("不能同时填写和清除 YYB API Key", 400);
  if (input.ref !== undefined && (typeof input.ref !== "string" || input.ref.length > 160)) throw new ApiError("资源来源账号格式不正确",400);
  const changedEndpoint = baseUrl !== current.baseUrl;
  const apiKey = input.clearApiKey ? "" : input.apiKey || (changedEndpoint ? "" : current.apiKey);
  return { mode, baseUrl, apiKey, ref: input.ref === undefined ? (changedEndpoint ? "" : current.ref) : input.ref.trim(), revision: current.revision + 1 };
}

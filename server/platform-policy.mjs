import { readFileSync } from "node:fs";
import { ApiError } from "./upstream.mjs";
const registries = Object.fromEntries(
  ["math", "computer"].map((name) => [
    name,
    JSON.parse(
      readFileSync(
        new URL(`./${name}-allowlist.json`, import.meta.url),
        "utf8",
      ),
    ),
  ]),
);
const excluded =
  /(?:pay|payment|purchase|refund|recharge|redpacket|helpdesk|customer|\/live(?:\/|$)|\/msc\/|\/v1\/(?:room|ws)|\/auth\/|\/OAuth2\/|\/api\/wx\/|\/master\/exec|\/base\/(?:En)?SendMsg|SendTemplate|Xcx_Msg|\/helper\/|\/address\/|\/pull_new|\/sys_users_tuan|\/scrm_users)/i;
const excludedCommand =
  /(?:pay|payment|purchase|refund|recharge|redpacket|live|helpdesk|customer|GetUserService)/i;
const safeKeys = {
  math: [
    "ID",
    "StuID",
    "UserNick",
    "NickName",
    "Name",
    "HeadImg",
    "SubjectType",
    "ChoiceType",
    "SchoolName",
    "TargetSchool",
    "VipEndTime",
    "EBookIDs",
    "PaperIDs",
    "AlbumIDs",
    "IsBindTel",
    "IsAct",
    "IsOldUser",
    "IsCourseUser",
  ],
  computer: [
    "userId",
    "nickName",
    "name",
    "previewUrl",
    "avatarUrl",
    "modelInfo",
    "showWxCourseList",
  ],
};
export function publicUser(name, user) {
  return Object.fromEntries(
    safeKeys[name]
      .filter((k) => user?.[k] !== undefined)
      .map((k) => [k, user[k]]),
  );
}
export function publicSession(session) {
  if (!session) return { authenticated: false, account: null, platforms: {} };
  return {
    authenticated: true,
    ...(session.user ? { user: session.user } : {}),
    account: session.account,
    platforms: Object.fromEntries(
      ["math", "computer"].map((name) => {
        const p = session.platforms[name] || {};
        return [
          name,
          {
            connected: !!p.connected,
            ...(p.user ? { user: publicUser(name, p.user) } : {}),
            ...(p.error ? { error: p.error } : {}),
          },
        ];
      }),
    ),
  };
}
export function cleanAccount(a) {
  return {
    ref: String(a.id ?? a.ref),
    nickname: a.nickname || a.alias || "微信学习账号",
    status: a.status || "unknown",
    avatar: `/api/learning/auth/avatar/${encodeURIComponent(String(a.id ?? a.ref))}`,
  };
}
const responseCredentialFields = new Set([
  "pwd",
  "password",
  "access_token",
  "refresh_token",
  "session_key",
  "sessionkey",
  "refreshtoken",
  "token",
  "authorization",
]);
export function publicPlatformResponse(value) {
  if (Array.isArray(value)) return value.map(publicPlatformResponse);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !responseCredentialFields.has(key.toLowerCase()))
      .map(([key, item]) => [key, publicPlatformResponse(item)]),
  );
}
export function validatePlatformRequest(name, input) {
  const registry = registries[name];
  if (!registry) throw new ApiError("未知学习平台", 404);
  const requestPath = input?.path;
  if (
    typeof requestPath !== "string" ||
    !requestPath.startsWith("/api/") ||
    /[?#\\]|\.\.|\/\//.test(requestPath) ||
    excluded.test(requestPath)
  )
    throw new ApiError("此接口不属于已启用的学习能力", 403);
  if (
    !registry.paths.some((p) =>
      p.endsWith("/") ? requestPath.startsWith(p) : requestPath === p,
    )
  )
    throw new ApiError("接口未在学习能力清单中", 403);
  const method = String(input.method || "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "DELETE"].includes(method))
    throw new ApiError("不支持的请求方法", 400);
  const data = input.data ?? {};
  const query = input.query ?? {};
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    !query ||
    typeof query !== "object" ||
    Array.isArray(query)
  )
    throw new ApiError("请求参数格式不正确", 400);
  if (
    name === "math" &&
    /^\/api\/Master\/(AutoModel|Model)$/.test(requestPath)
  ) {
    if (
      !data.command ||
      !registry.commands.includes(data.command) ||
      excludedCommand.test(data.command)
    )
      throw new ApiError("未启用此数学操作", 403);
  }
  return { path: requestPath, method, data, query };
}
export function injectMathUser(input, platform, stationId = 1) {
  // This source API uses StuID as the recipient (comment author), not the actor.
  if (input.path === "/api/sys_comment/give")
    return { ...input, data: { ...input.data }, query: { ...input.query } };
  const userId = platform.stuId || platform.user?.StuID;
  if (!userId) return input;
  const data = { ...input.data };
  const query = { ...input.query };
  const assignActor = (obj) => {
    for (const k of ["StuID", "stuid", "StuId"])
      if (Object.hasOwn(obj, k)) obj[k] = userId;
    return obj;
  };
  if (data.command) {
    let params;
    try {
      params =
        typeof data.data === "string" ? JSON.parse(data.data) : data.data || {};
    } catch {
      throw new ApiError("数学查询参数不是有效的 JSON", 400);
    }
    if (params && typeof params === "object" && !Array.isArray(params))
      params = {
        StuID: userId,
        System_Station_ID: stationId,
        ...assignActor({ ...params }),
      };
    data.data = typeof data.data === "string" ? JSON.stringify(params) : params;
  } else assignActor(data);
  assignActor(query);
  return { ...input, data, query };
}

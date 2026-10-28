import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
let localYyb = "";
try {
  localYyb =
    readFileSync(new URL("../yyb.txt", import.meta.url), "utf8")
      .match(/https?:\/\/[^\s]+/)?.[0]
      ?.replace(/\/$/, "") || "";
} catch {}

export const DEFAULTS = {
  yyb: (process.env.YYB_BASE_URL || localYyb).replace(/\/$/, ""),
  math: process.env.MATH_BASE_URL || "https://api.math-upstream.invalid",
  computer: process.env.COMPUTER_BASE_URL || "https://teach.computer-upstream.invalid",
};
export const APP_IDS = {
  math: "<math-app-id>",
  computer: "<computer-app-id>",
};
const iv = Buffer.from("59b87344b54f3197");
const key = (seed) => Buffer.from(createHash("md5").update(seed).digest("hex"));
export function encryptMath(value) {
  const cipher = createCipheriv("aes-256-cbc", key("D"), iv);
  return Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]).toString("base64");
}
export function encryptMathMaster(value) {
  const cipher = createCipheriv("aes-256-cbc", key("1D"), iv);
  return Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]).toString("base64");
}
export function decodeMath(body) {
  if (!body || !body.DES || !(body.data || body.Data)) return body;
  const field = body.data ? "data" : "Data";
  const decipher = createDecipheriv(
    "aes-256-cbc",
    key(`${body.RequestId || ""}D`),
    iv,
  );
  const text = Buffer.concat([
    decipher.update(String(body[field]), "base64"),
    decipher.final(),
  ])
    .toString("utf8")
    .replace(/\0+$/g, "");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    value = text;
  }
  return { ...body, [field]: value };
}
export class ApiError extends Error {
  constructor(message, status = 502, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: options.signal || AbortSignal.timeout(25000),
    });
  } catch (error) {
    throw new ApiError(
      error.name === "TimeoutError"
        ? "上游请求超时，请稍后重试"
        : "无法连接上游学习服务",
      502,
    );
  }
  const raw = await response.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new ApiError(
      `上游返回非 JSON 响应（HTTP ${response.status}）`,
      [400, 401, 403, 404, 409, 413, 429].includes(response.status)
        ? response.status
        : 502,
    );
  }
  if (!response.ok)
    throw new ApiError(
      body.Message ||
        body.message ||
        body.msg ||
        `上游请求失败（HTTP ${response.status}）`,
      [400, 401, 403, 404, 409, 413, 429].includes(response.status)
        ? response.status
        : 502,
    );
  return body;
}
export async function yybRequest(path, data, options = {}) {
  if (!DEFAULTS.yyb) throw new ApiError("请在服务端配置 YYB_BASE_URL", 503);
  const result = await requestJson(`${DEFAULTS.yyb}${path}`, {
    ...options,
    method: data ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      ...(process.env.YYB_API_KEY
        ? { Authorization: `Bearer ${process.env.YYB_API_KEY}` }
        : {}),
      ...options.headers,
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  if (result.code !== 0) throw new ApiError(result.msg || "YYB 请求失败", 502);
  return result.data;
}
function addQuery(url, values = {}) {
  for (const [k, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value])
      url.searchParams.append(k, String(item));
  }
}
export function bearer(token) {
  return /^Bearer\s/i.test(token) ? token : `Bearer ${token}`;
}
export async function mathRequest(
  path,
  { method = "GET", data = {}, query = {} } = {},
  platform,
) {
  const url = new URL(path, DEFAULTS.math);
  let payload = { ...data };
  const headers = { Accept: "application/json", DesEncryptModel: "PKCS7" };
  if (platform?.token) headers.Authorization = bearer(platform.token);
  addQuery(url, query);
  if (method.toUpperCase() === "GET") {
    addQuery(url, payload);
    headers["content-type"] = "application/json";
  } else {
    headers["content-type"] = "application/x-www-form-urlencoded;charset=utf-8";
    if (payload.command) {
      // The source wrapper stringifies the parameter string once more before AES.
      const params =
        typeof payload.data === "string"
          ? payload.data
          : JSON.stringify(payload.data ?? {});
      payload.data = encryptMath(JSON.stringify(params));
    }
  }
  const body = await requestJson(url, {
    method,
    headers,
    ...(!["GET", "HEAD"].includes(method.toUpperCase())
      ? {
          body: new URLSearchParams(
            Object.entries(payload).map(([k, v]) => [
              k,
              typeof v === "object" ? JSON.stringify(v) : String(v ?? ""),
            ]),
          ),
        }
      : {}),
  });
  return decodeMath(body);
}
function computerVideoConfig() {
  let keyText = process.env.COMPUTER_VIDEO_KEY;
  let ivText = process.env.COMPUTER_VIDEO_IV;
  if (!keyText || !ivText) {
    try {
      const source = readFileSync(
        new URL(
          "../wx*-computer/common/vendor.js",
          import.meta.url,
        ),
        "utf8",
      );
      const module = source.slice(source.indexOf("  y6zN: function"));
      const decrypt = module.slice(
        module.indexOf("t.e = function(e)"),
        module.indexOf('var a = n("Av7u")'),
      );
      const values = [
        ...decrypt.matchAll(/enc\.Utf8\.parse\(["']([^"']+)["']\)/g),
      ].map((match) => match[1]);
      keyText ||= values[0];
      ivText ||= values[1];
    } catch {}
  }
  if (!keyText || !ivText)
    throw new ApiError(
      "计算机录播解密配置缺失，请在服务端配置 COMPUTER_VIDEO_KEY 和 COMPUTER_VIDEO_IV",
      503,
    );
  return { key: Buffer.from(keyText, "utf8"), iv: Buffer.from(ivText, "utf8") };
}
export function decodeComputerVideoResponse(body, config) {
  const mediaList = body?.data?.mediaList;
  if (
    !Array.isArray(mediaList) ||
    !mediaList.some(
      (item) =>
        typeof item?.playURL === "string" &&
        !/^https?:\/\//i.test(item.playURL),
    )
  )
    return body;
  const credentials = config || computerVideoConfig();
  if (credentials.key.length !== 16 || credentials.iv.length !== 16)
    throw new ApiError("计算机录播解密配置格式不正确", 503);
  try {
    return {
      ...body,
      data: {
        ...body.data,
        mediaList: mediaList.map((item) => {
          if (
            typeof item?.playURL !== "string" ||
            /^https?:\/\//i.test(item.playURL)
          )
            return item;
          const decipher = createDecipheriv(
            "aes-128-cbc",
            credentials.key,
            credentials.iv,
          );
          const url = Buffer.concat([
            decipher.update(item.playURL, "base64"),
            decipher.final(),
          ]).toString("utf8");
          if (!/^https?:\/\//i.test(url))
            throw new Error("invalid playback url");
          return { ...item, playURL: url };
        }),
      },
    };
  } catch {
    throw new ApiError(
      "计算机录播地址解密失败，请检查服务端配置或稍后重试",
      502,
    );
  }
}
export async function computerRequest(
  path,
  { method = "GET", data = {}, query = {} } = {},
  platform,
) {
  const url = new URL(path, DEFAULTS.computer);
  const headers = {
    Accept: "application/json",
    "Tenant-Code": "1",
    "content-type": "application/json",
  };
  if (platform?.token) headers.Authorization = bearer(platform.token);
  addQuery(url, query);
  if (method.toUpperCase() === "GET") addQuery(url, data);
  const result = await requestJson(url, {
    method,
    headers,
    ...(!["GET", "HEAD"].includes(method.toUpperCase())
      ? { body: JSON.stringify(data) }
      : {}),
  });
  return path === "/api/exam/wx/course/get_play_info/v2"
    ? decodeComputerVideoResponse(result)
    : result;
}
function findCode(result) {
  const nested = result?.result;
  let raw = typeof nested === "string" ? JSON.parse(nested) : nested;
  if (raw?.data && typeof raw.data === "string") {
    try {
      raw.data = JSON.parse(raw.data);
    } catch {}
  }
  return raw?.code || raw?.data?.code || result?.code || raw?.js_code;
}
export async function loginPlatform(name, account) {
  const result = await yybRequest("/wxapp/getCode", {
    ref: String(account.ref || account.id),
    app_id: APP_IDS[name],
  });
  const code = findCode(result);
  if (!code) throw new ApiError("YYB 未返回可用的小程序登录 code", 502);
  if (name === "computer") {
    const client = Buffer.from(
      "web_app:<computer-oauth-secret>",
    ).toString("base64");
    const body = await requestJson(
      `${DEFAULTS.computer}/api/auth/wx/token?grant_type=wx&scope=read&code=${encodeURIComponent(code)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Basic ${client}`,
          "Tenant-Code": "1",
        },
        body: JSON.stringify({
          name: account.nickname || "学习者",
          previewUrl: /^https?:\/\//.test(account.avatar || "")
            ? account.avatar
            : "https://static.computer-upstream.invalid/images/wechat/avatar/logo.png",
        }),
      },
    );
    const token = body.access_token || body.data?.access_token;
    if (!token)
      throw new ApiError(
        body.msg || body.message || "计算机小程序登录失败",
        502,
      );
    const platform = {
      token,
      refreshToken: body.refresh_token || body.data?.refresh_token,
      connected: true,
    };
    try {
      const detail = await computerRequest(
        "/api/user/wx/user/detail",
        {},
        platform,
      );
      platform.user = detail.data || detail;
    } catch {
      platform.user = { name: account.nickname || "学习者" };
    }
    return platform;
  }
  let info = {};
  try {
    const config = await mathRequest("/api/wx_xcx_info/GetListByAll", {
      query: { System_Station_ID: 1 },
    });
    info = config.data?.[0] || {};
  } catch {}
  const check = await mathRequest(
    `/api/wx/${String(info.Parm3) === "1" ? "CheckCodeVT2" : "CheckCodeV3"}`,
    { query: { Id: 2, code, Source: "微信小程序", SourceStuID: "" } },
  );
  const user = check.data?.SysUserInfo;
  if (!user?.StuID)
    throw new ApiError(check.msg || check.Message || "数学小程序登录失败", 502);
  const tokenBody = await mathRequest("/api/OAuth2/Login", {
    method: "POST",
    data: {
      scope: "wxxcxA",
      username: encryptMath(user.StuID),
      password: encryptMath(JSON.stringify(1001)),
    },
  });
  const tokenData = tokenBody.Data || tokenBody.data;
  const token = tokenData?.access_token;
  if (!token)
    throw new ApiError(
      tokenBody.Message || tokenBody.msg || "数学登录令牌获取失败",
      502,
    );
  return {
    connected: true,
    token,
    user: tokenData.User || user,
    stuId: user.StuID,
    wxOpenId: check.data?.WxUserInfo?.OpenID,
    sessionKey: check.data?.resule?.session_key,
    appInfo: info,
  };
}

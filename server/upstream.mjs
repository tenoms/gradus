import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
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
async function yybRequestWith(config, request, path, data, options = {}) {
  if (!config.yyb.baseUrl) throw new ApiError("请在管理端配置 YYB 服务地址", 503);
  const result = await request(`${config.yyb.baseUrl}${path}`, {
    ...options,
    method: data ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      ...(config.yyb.apiKey
        ? { Authorization: `Bearer ${config.yyb.apiKey}` }
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
async function mathRequestWith(
  config, request, path,
  { method = "GET", data = {}, query = {} } = {},
  platform,
) {
  if (!config.math.enabled) throw new ApiError("数学学习平台已停用，请联系管理员", 503);
  const url = new URL(path, config.math.baseUrl);
  let payload = { ...data };
  const requestQuery = { ...query };
  for (const values of [payload, requestQuery])
    if (Object.hasOwn(values, "System_Station_ID")) values.System_Station_ID = config.math.stationId;
  if (payload.command && payload.data) {
    const encoded = typeof payload.data === "string";
    let parameters;
    try { parameters = encoded ? JSON.parse(payload.data) : payload.data; } catch {}
    if (parameters && typeof parameters === "object" && !Array.isArray(parameters) && Object.hasOwn(parameters, "System_Station_ID")) {
      parameters = { ...parameters, System_Station_ID: config.math.stationId };
      payload.data = encoded ? JSON.stringify(parameters) : parameters;
    }
  }
  const headers = { Accept: "application/json", DesEncryptModel: "PKCS7" };
  if (platform?.token) headers.Authorization = bearer(platform.token);
  addQuery(url, requestQuery);
  if (method.toUpperCase() === "GET") {
    addQuery(url, payload);
    // The source mini-program adds a fresh timestamp to every GET, including readback after writes.
    url.searchParams.set("t", String(Date.now()));
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
  const body = await request(url, {
    method,
    headers,
    ...(!["GET", "HEAD"].includes(method.toUpperCase())
      ? {
          body: new URLSearchParams(
            Object.entries(payload).map(([k, v]) => [
              k,
              v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v),
            ]),
          ),
        }
      : {}),
  });
  return decodeMath(body);
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
  const credentials = config;
  if (credentials?.key?.length !== 16 || credentials?.iv?.length !== 16)
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
async function computerRequestWith(
  config, request, path,
  { method = "GET", data = {}, query = {} } = {},
  platform,
) {
  if (!config.computer.enabled) throw new ApiError("计算机学习平台已停用，请联系管理员", 503);
  const url = new URL(path, config.computer.baseUrl);
  const headers = {
    Accept: "application/json",
    "Tenant-Code": config.computer.tenantCode,
    "content-type": "application/json",
  };
  if (platform?.token) headers.Authorization = bearer(platform.token);
  addQuery(url, query);
  if (method.toUpperCase() === "GET") addQuery(url, data);
  const result = await request(url, {
    method,
    headers,
    ...(!["GET", "HEAD"].includes(method.toUpperCase())
      ? { body: JSON.stringify(data) }
      : {}),
  });
  return path === "/api/exam/wx/course/get_play_info/v2"
    ? decodeComputerVideoResponse(result, { key: Buffer.from(config.computer.videoKey, "utf8"), iv: Buffer.from(config.computer.videoIv, "utf8") })
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
async function loginPlatformWith(config, request, name, account) {
  if (!["math", "computer"].includes(name)) throw new ApiError("未知学习平台", 404);
  if (!config[name].enabled) throw new ApiError(`${name === "math" ? "数学" : "计算机"}学习平台已停用，请联系管理员`, 503);
  const result = await yybRequestWith(config, request,"/wxapp/getCode", {
    ref: String(account.ref || account.id),
    app_id: config[name].appId,
  });
  const code = findCode(result);
  if (!code) throw new ApiError("YYB 未返回可用的小程序登录 code", 502);
  if (name === "computer") {
    const client = Buffer.from(
      `${config.computer.oauthClientId}:${config.computer.oauthClientSecret}`,
    ).toString("base64");
    const body = await request(
      `${config.computer.baseUrl}/api/auth/wx/token?grant_type=wx&scope=read&code=${encodeURIComponent(code)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Basic ${client}`,
          "Tenant-Code": config.computer.tenantCode,
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
      const detail = await computerRequestWith(config, request,
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
    const appInfo = await mathRequestWith(config, request, "/api/wx_xcx_info/GetListByAll", {
      query: { System_Station_ID: config.math.stationId },
    });
    info = appInfo.data?.[0] || {};
  } catch {}
  const check = await mathRequestWith(config, request,
    `/api/wx/${String(info.Parm3) === "1" ? "CheckCodeVT2" : "CheckCodeV3"}`,
    { query: { Id: config.math.loginId, code, Source: "微信小程序", SourceStuID: "" } },
  );
  const user = check.data?.SysUserInfo;
  if (!user?.StuID)
    throw new ApiError(check.msg || check.Message || "数学小程序登录失败", 502);
  const tokenBody = await mathRequestWith(config, request,"/api/OAuth2/Login", {
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

function successful(body) {
  if (body?.SuccessResponse === false || body?.success === false ||
      (body?.code !== undefined && !["0", "200"].includes(String(body.code))))
    throw new ApiError("上游未返回成功业务结果", 502);
  return body;
}

/** Each call reads current settings; a login keeps one snapshot for its complete handshake. */
export function createUpstreamClient(configuration, { requestJson: transport = requestJson } = {}) {
  const getConfig = () => structuredClone(typeof configuration === "function" ? configuration() : configuration);
  return {
    getConfig,
    requestJson: transport,
    yybRequest: (path, data, options) => yybRequestWith(getConfig(), transport, path, data, options),
    mathRequest: (path, input, platform) => mathRequestWith(getConfig(), transport, path, input, platform),
    computerRequest: (path, input, platform) => computerRequestWith(getConfig(), transport, path, input, platform),
    loginPlatform: (name, account) => loginPlatformWith(getConfig(), transport, name, account),
    async probe({ target = "all", ref } = {}) {
      if (!["all", "yyb", "math", "computer"].includes(target)) throw new ApiError("未知检测目标", 400);
      if (ref !== undefined && (typeof ref !== "string" || !ref || ref.length > 160)) throw new ApiError("检测账号格式不正确", 400);
      const config = getConfig();
      const checks = [];
      let accounts;
      const check = async (name, operation) => {
        const start = Date.now();
        try {
          const message = await operation();
          checks.push({ name, ok: true, message, durationMs: Date.now() - start });
        } catch (error) {
          const status = Number(error.status) || 502;
          const description = status === 503 ? "配置未完成或平台已停用" : [401, 403].includes(status) ? "上游拒绝了身份认证" : status === 404 ? "配置的服务未提供此接口" : "上游连接或业务验证未成功";
          checks.push({ name, ok: false, message: `${description}（${status}）`, durationMs: Date.now() - start });
        }
      };
      if (["yyb", "all"].includes(target)) {
        await check("YYB 服务健康", async () => {
          await yybRequestWith(config, transport, "/health");
          return "YYB 健康接口返回成功";
        });
        await check("YYB 学习账号目录", async () => {
          accounts = await yybRequestWith(config, transport, "/accounts");
          if (!Array.isArray(accounts)) throw new ApiError("账号目录格式不正确", 502);
          return `成功读取 ${accounts.length} 个学习账号`;
        });
      }
      for (const name of ["math", "computer"].filter(name => target === "all" || target === name)) {
        const label = name === "math" ? "数学" : "计算机";
        await check(`${label}服务连接`, async () => {
          if (!config[name].enabled) throw new ApiError("平台已停用", 503);
          if (name === "math") {
            successful(await mathRequestWith(config, transport, "/api/wx_xcx_info/GetListByAll", { query: { System_Station_ID: config.math.stationId } }));
            return "数学小程序配置接口返回成功";
          }
          try {
            await computerRequestWith(config, transport, "/api/user/wx/user/detail");
          } catch (error) {
            if (![401, 403].includes(error.status)) throw error;
          }
          return "计算机服务可达；选择学习账号后可进一步检测本人身份";
        });
        if (ref) await check(`${label}小程序登录与本人资料`, async () => {
          accounts ||= await yybRequestWith(config, transport, "/accounts");
          if (!Array.isArray(accounts)) throw new ApiError("账号目录格式不正确", 502);
          const account = accounts.find(account => String(account.id ?? account.ref) === ref);
          if (!account) throw new ApiError("未找到检测账号", 404);
          const platform = await loginPlatformWith(config, transport, name, { ...account, ref });
          if (name === "computer") {
            const result = successful(await computerRequestWith(config, transport, "/api/user/wx/user/detail", {}, platform));
            const profile = result?.data || result;
            if (!profile || !(profile.userId || profile.id)) throw new ApiError("本人资料缺少身份", 502);
          } else {
            const result = successful(await mathRequestWith(config, transport, "/api/Master/AutoModel", {
              method: "POST", data: { command: "GetUserInfoByStuID", data: JSON.stringify({ StuID: platform.stuId, System_Station_ID: config.math.stationId }) },
            }, platform));
            const data = result?.data ?? result?.Data;
            const row = Array.isArray(data?.[0]) ? data[0][0] : data?.[0];
            if (String(row?.StuID || "") !== String(platform.stuId)) throw new ApiError("本人资料与登录身份不符", 502);
          }
          return "小程序登录成功，本人资料已验证";
        });
      }
      return { target, ok: checks.every(check => check.ok), checkedAt: new Date().toISOString(), checks };
    },
  };
}

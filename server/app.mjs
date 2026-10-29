import express from "express";
import cookieParser from "cookie-parser";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { firstScorePayload } from "./first-score.mjs";
import { encryptMathMaster } from "./upstream.mjs";
import {
  ApiError,
  yybRequest,
  loginPlatform,
  mathRequest,
  computerRequest,
  DEFAULTS,
  bearer,
  requestJson,
} from "./upstream.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
const cookieName = "study_session";
const sessionLifetime = 24 * 60 * 60 * 1000;
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
function publicUser(name, user) {
  return Object.fromEntries(
    safeKeys[name]
      .filter((k) => user?.[k] !== undefined)
      .map((k) => [k, user[k]]),
  );
}
function publicSession(session) {
  if (!session) return { authenticated: false, account: null, platforms: {} };
  return {
    authenticated: true,
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
function cleanAccount(a) {
  return {
    ref: String(a.id ?? a.ref),
    nickname: a.nickname || a.alias || "微信学习账号",
    status: a.status || "unknown",
    avatar: `/api/auth/avatar/${encodeURIComponent(String(a.id ?? a.ref))}`,
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
    throw new ApiError("此接口不属于已迁移的学习能力", 403);
  if (
    !registry.paths.some((p) =>
      p.endsWith("/") ? requestPath.startsWith(p) : requestPath === p,
    )
  )
    throw new ApiError("接口未在原小程序学习能力清单中", 403);
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
      throw new ApiError("未迁移此数学操作", 403);
  }
  return { path: requestPath, method, data, query };
}
export function injectMathUser(input, platform) {
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
        System_Station_ID: 1,
        ...assignActor({ ...params }),
      };
    data.data = typeof data.data === "string" ? JSON.stringify(params) : params;
  } else assignActor(data);
  assignActor(query);
  return { ...input, data, query };
}
export function createApp(overrides = {}) {
  const service = {
    yybRequest,
    loginPlatform,
    mathRequest,
    computerRequest,
    requestJson,
    ...overrides,
  };
  const sessions = new Map();
  const cached = new Map();
  const app = express();
  app.disable("x-powered-by");
  app.use(cookieParser());
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      res.set("Cache-Control", "no-store");
      const origin = req.get("origin");
      if (origin && new URL(origin).host !== req.get("host"))
        return res.status(403).json({ error: "请从当前学习系统发起请求" });
    }
    next();
  });
  app.use(express.json({ limit: "3mb" }));
  const sessionFor = (req) => {
    const sid = req.cookies[cookieName];
    const s = sessions.get(sid);
    if (s && s.expires > Date.now()) return s;
    if (sid) sessions.delete(sid);
    return null;
  };
  const authenticated = (req, res, next) => {
    req.studySession = sessionFor(req);
    if (!req.studySession)
      return res.status(401).json({ error: "请先连接 YYB 学习账号" });
    next();
  };
  const saveSession = (req, res, session) => {
    const previous = req.cookies[cookieName];
    if (previous) sessions.delete(previous);
    const sid = randomBytes(32).toString("base64url");
    session.expires = Date.now() + sessionLifetime;
    sessions.set(sid, session);
    res.cookie(cookieName, sid, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "1" || req.secure,
      maxAge: sessionLifetime,
      path: "/",
    });
    return session;
  };
  app.get("/api/health", (req, res) =>
    res.json({
      ok: true,
      service: "study-web",
      platforms: ["math", "computer"],
    }),
  );
  app.get("/api/auth/accounts", async (req, res) => {
    const accounts = await service.yybRequest("/accounts");
    res.json({
      accounts: (Array.isArray(accounts) ? accounts : []).map(cleanAccount),
    });
  });
  app.get("/api/auth/avatar/:ref", async (req, res) => {
    const accounts = await service.yybRequest("/accounts");
    if (!accounts.some((a) => String(a.id) === req.params.ref))
      throw new ApiError("未找到该 YYB 账号", 404);
    let response;
    try {
      response = await fetch(
        `${DEFAULTS.yyb}/accounts/avatar?ref=${encodeURIComponent(req.params.ref)}`,
        {
          headers: process.env.YYB_API_KEY
            ? { Authorization: `Bearer ${process.env.YYB_API_KEY}` }
            : {},
          signal: AbortSignal.timeout(15000),
        },
      );
    } catch {
      throw new ApiError("头像暂不可用", 502);
    }
    if (
      !response.ok ||
      !response.headers.get("content-type")?.startsWith("image/")
    )
      throw new ApiError("头像暂不可用", 404);
    res
      .type(response.headers.get("content-type"))
      .send(Buffer.from(await response.arrayBuffer()));
  });
  app.get("/api/auth/session", (req, res) =>
    res.json(publicSession(sessionFor(req))),
  );
  app.post("/api/auth/connect", async (req, res) => {
    const accounts = await service.yybRequest("/accounts");
    const ref = String(req.body?.ref || "");
    const source = accounts.find(
      (a) => String(a.id) === ref || a.openid === ref || String(a.uin) === ref,
    );
    if (!source) throw new ApiError("未找到该 YYB 账号，请刷新账号列表", 404);
    const account = cleanAccount(source);
    const remembered = cached.get(account.ref);
    const session = {
      account,
      platforms:
        remembered?.expires > Date.now() ? { ...remembered.platforms } : {},
    };
    await Promise.all(
      ["math", "computer"].map(async (name) => {
        if (session.platforms[name]?.connected) return;
        try {
          session.platforms[name] = await service.loginPlatform(name, {
            ...source,
            ref: account.ref,
          });
        } catch (error) {
          session.platforms[name] = { connected: false, error: error.message };
        }
      }),
    );
    if (!Object.values(session.platforms).some((p) => p.connected))
      throw new ApiError(
        "两个学习平台均连接失败，请稍后重试",
        502,
        publicSession(session).platforms,
      );
    saveSession(req, res, session);
    cached.set(account.ref, session);
    res.json(publicSession(session));
  });
  app.post("/api/auth/logout", (req, res) => {
    sessions.delete(req.cookies[cookieName]);
    res.clearCookie(cookieName, { path: "/" });
    res.json({ ok: true });
  });
  app.post(
    "/api/platform/math/first-score",
    authenticated,
    async (req, res) => {
      const platform = req.studySession.platforms.math;
      if (!platform?.connected) throw new ApiError("数学平台尚未连接", 401);
      const stuId = platform.stuId || platform.user?.StuID;
      if (!stuId) throw new ApiError("当前账号缺少数学身份，请重新连接", 401);
      const lookup = await service.mathRequest(
        "/api/Master/AutoModel",
        {
          method: "POST",
          data: {
            command: "GetUserFristScores_cscj",
            data: JSON.stringify({ StuID: stuId }),
          },
        },
        platform,
      );
      if (
        lookup?.SuccessResponse === false ||
        (lookup?.code !== undefined &&
          !["0", "200"].includes(String(lookup.code)))
      )
        throw new ApiError("无法核实当前账号的成绩记录，请稍后重试", 502);
      const rows = lookup?.data ?? lookup?.Data ?? [];
      const existing = (Array.isArray(rows?.[0]) ? rows[0][0] : rows[0]) || {};
      const score = req.body?.score;
      if (!score || typeof score !== "object" || Array.isArray(score))
        throw new ApiError("成绩数据格式不正确", 400);
      const selection = Object.fromEntries(
        [
          "SchoolCode",
          "XueYuanName",
          "MajorCode",
          "DirectionName",
          "IsQuanRiZ",
        ].map((field) => [field, score[field] ?? existing[field] ?? ""]),
      );
      const subjects = await service.mathRequest(
        "/api/Master/AutoModel",
        {
          method: "POST",
          data: {
            command: "GetMajorSubjectList_cscj",
            data: JSON.stringify(selection),
          },
        },
        platform,
      );
      if (subjects?.SuccessResponse === false)
        throw new ApiError("无法核实当前专业的考试科目，请稍后重试", 502);
      const subjectData = subjects?.data ?? subjects?.Data ?? [];
      const subjectRows = Array.isArray(subjectData?.[0])
        ? subjectData[0]
        : Array.isArray(subjectData)
          ? subjectData
          : [];
      const payload = firstScorePayload(score, existing, stuId, subjectRows);
      res.json(
        publicPlatformResponse(
          await service.mathRequest(
            "/api/master/exec",
            {
              method: "POST",
              data: { data: encryptMathMaster(JSON.stringify(payload)) },
            },
            platform,
          ),
        ),
      );
    },
  );
  app.post(
    "/api/platform/math/photo",
    authenticated,
    express.raw({ type: "multipart/form-data", limit: "20mb" }),
    async (req, res) => {
      if (!req.studySession.platforms.math?.connected)
        throw new ApiError("数学平台尚未连接", 401);
      if (!Buffer.isBuffer(req.body) || !req.body.length)
        throw new ApiError("请选择要搜索的题目图片", 400);
      let username = process.env.MATH_OCR_USERNAME;
      let password = process.env.MATH_OCR_PASSWORD;
      if (!username || !password) {
        // Reuse the locally provided source configuration without copying its secret into the Web codebase.
        const source = path.join(
          root,
          "wx*-math/topic/pages/camerasearch/camerasearch.js",
        );
        if (existsSync(source)) {
          const text = readFileSync(source, "utf8");
          username ||= text.match(/username:\s*["']([^"']+)["']/)?.[1];
          password ||= text.match(/password:\s*["']([^"']+)["']/)?.[1];
        }
      }
      if (!username || !password)
        throw new ApiError(
          "数学图片识别服务尚未配置，请配置 MATH_OCR_USERNAME 和 MATH_OCR_PASSWORD",
          503,
        );
      let form;
      try {
        form = await new Request("http://localhost", {
          method: "POST",
          headers: { "content-type": req.get("content-type") },
          body: req.body,
        }).formData();
      } catch {
        throw new ApiError("图片上传格式不正确", 400);
      }
      const image = form.get("image") || form.get("file");
      if (!image || typeof image === "string")
        throw new ApiError("请选择要搜索的题目图片", 400);
      const payload = new FormData();
      payload.set("image", image);
      payload.set("username", username);
      payload.set("password", password);
      res.json(
        publicPlatformResponse(
          await service.requestJson(
            `${process.env.MATH_OCR_URL || "https://photo.math-upstream.invalid/predict"}`,
            { method: "POST", body: payload },
          ),
        ),
      );
    },
  );
  app.post(
    "/api/platform/:platform/upload",
    authenticated,
    express.raw({ type: "multipart/form-data", limit: "20mb" }),
    async (req, res) => {
      const name = req.params.platform;
      const allowed = {
        computer: [
          "/api/user/v1/attachment/upload/",
          "/api/exam/wx/searchExercise/photo",
          "/api/exam/wx/searchExercise/text/similarity",
        ],
        math: [
          "/api/sys_attachment/SearchUploadImg",
          "/api/sys_attachment/LayuiUpImg",
          "/api/sys_attachment/UpFile",
        ],
      };
      const requestPath = req.query.path;
      if (!allowed[name]?.includes(requestPath))
        throw new ApiError("未迁移此上传操作", 403);
      const p = req.studySession.platforms[name];
      if (!p?.connected) throw new ApiError("学习平台尚未连接", 401);
      if (!Buffer.isBuffer(req.body) || !req.body.length)
        throw new ApiError("请选择要上传的图片或文件", 400);
      const query = new URLSearchParams();
      for (const [k, v] of Object.entries(req.query))
        if (k !== "path")
          for (const item of Array.isArray(v) ? v : [v])
            query.append(k, String(item));
      const result = await service.requestJson(
        `${DEFAULTS[name]}${requestPath}${query.size ? `?${query}` : ""}`,
        {
          method: "POST",
          headers: {
            Authorization: bearer(p.token),
            ...(name === "computer"
              ? { "Tenant-Code": requestPath === "/api/exam/wx/searchExercise/text/similarity" ? "2" : "1" }
              : { DesEncryptModel: "PKCS7" }),
            "content-type": req.get("content-type"),
          },
          body: req.body,
        },
      );
      res.json(publicPlatformResponse(result));
    },
  );
  const updateMathSession = async (input, result, platform) => {
    if (
      result?.SuccessResponse === false ||
      (result?.code !== undefined &&
        !["0", "200"].includes(String(result.code)))
    )
      return;
    const own = platform.stuId || platform.user?.StuID;
    const fields =
      input.path === "/api/sys_users/UpdateUserNickName"
        ? ["UserNick", "HeadImg"]
        : input.path === "/api/sys_users/Inner_sys_users"
          ? ["UserNick", "HeadImg", "SubjectType", "ChoiceType"]
          : [];
    if (
      fields.length &&
      (String(input.data.StuID || "") === String(own) ||
        String(input.data.ID || "") === String(platform.user?.ID))
    ) {
      const columns = input.data.UpdateColumns?.split(",");
      for (const field of fields)
        if (
          input.data[field] !== undefined &&
          (!columns || columns.includes(field))
        )
          platform.user[field] = input.data[field];
    }
    const rights = [
      "/api/sys_integral_log/consume",
      "/api/sys_users/ExperienceVip",
      "/api/ks_paper/ExperiencePaper",
      "/api/sys_users_isact/ActCode",
      "/api/couponcard_study/ActivationCode",
      "/api/couponcard_study/ActivationCodeStudy",
      "/api/couponcard_study/Inner_couponcard_study",
    ];
    if (!rights.includes(input.path)) return;
    // The original own-profile query refreshes rights after an explicit entitlement action.
    try {
      const fresh = await service.mathRequest(
        "/api/Master/AutoModel",
        {
          method: "POST",
          data: {
            command: "GetUserInfoByStuID",
            data: JSON.stringify({ StuID: own, System_Station_ID: 1, t: Date.now() }),
          },
        },
        platform,
      );
      const data = fresh?.data ?? fresh?.Data;
      const row = Array.isArray(data?.[0]) ? data[0][0] : data?.[0];
      if (
        fresh?.SuccessResponse !== false &&
        String(row?.StuID) === String(own)
      )
        platform.user = { ...platform.user, ...publicUser("math", row) };
    } catch {
      /* The completed action stays successful; a later platform read can retry. */
    }
  };
  app.post("/api/platform/:platform", authenticated, async (req, res) => {
    const name = req.params.platform;
    let input = validatePlatformRequest(name, req.body);
    let platform = req.studySession.platforms[name];
    if (!platform?.connected)
      throw new ApiError(platform?.error || "该学习平台尚未连接", 401);
    if (name === "math") input = injectMathUser(input, platform);
    const invoke = () =>
      service[name === "math" ? "mathRequest" : "computerRequest"](
        input.path,
        input,
        platform,
      );
    const respond = async () => {
      const result = await invoke();
      if (name === "math") await updateMathSession(input, result, platform);
      if (name === "computer" && input.path === "/api/user/wx/user/updateUserInfo" && [0, 200, "0", "200"].includes(result?.code)) {
        if (input.data.name !== undefined) platform.user.nickName = input.data.name;
        if (input.data.previewUrl !== undefined) platform.user.previewUrl = input.data.previewUrl;
      }
      res.json(publicPlatformResponse(result));
    };
    try {
      await respond();
    } catch (error) {
      if (error.status !== 401) throw error;
      try {
        platform = await service.loginPlatform(name, req.studySession.account);
        req.studySession.platforms[name] = platform;
        if (name === "math") input = injectMathUser(input, platform);
        await respond();
      } catch (retryError) {
        req.studySession.platforms[name] = {
          connected: false,
          error: "平台登录已过期，请重新连接账号",
        };
        throw new ApiError("平台登录已过期，请重新连接账号", 401);
      }
    }
  });
  app.use("/api", (req, res) => res.status(404).json({ error: "接口不存在" }));
  const dist = path.join(root, "dist");
  if (existsSync(path.join(dist, "index.html"))) {
    app.use(express.static(dist));
    app.get("/{*path}", (req, res) =>
      res.sendFile(path.join(dist, "index.html")),
    );
  }
  app.use((error, req, res, next) => {
    const status =
      Number.isInteger(error.status) &&
      error.status >= 400 &&
      error.status <= 599
        ? error.status
        : 500;
    res.status(status).json({
      error: status === 500 ? "服务处理失败，请稍后重试" : error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  });
  app.locals.sessions = sessions;
  return app;
}

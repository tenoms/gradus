import express from "express";
import { ApiError, bearer, encryptMathMaster } from "../upstream.mjs";
import { firstScorePayload } from "../first-score.mjs";
import { publicPlatformResponse, validatePlatformRequest, injectMathUser, cleanAccount, publicSession } from "../platform-policy.mjs";

export function createLearningRouter({ service, identities, connections, auth }) {
  const router = express.Router();
  const authenticated = auth.require;
  router.use("/auth", auth.router);
  router.get("/study/data", authenticated, (req, res) => res.json(identities.studyData(req.studySession.user.id)));
  router.put("/study/data", authenticated, (req, res) => res.json(identities.saveStudyData(req.studySession.user.id, req.body?.data, req.body?.revision)));
  router.get("/announcements", authenticated, (req, res) => res.json({ announcements: identities.listAnnouncements() }));
  router.get("/auth/accounts", authenticated, async (req, res) => {
    const ref = req.studySession.user.yybRef;
    if (!ref) return res.json({ accounts: [] });
    const accounts = await service.yybRequest("/accounts");
    res.json({ accounts: accounts.map(cleanAccount).filter(account => account.ref === ref) });
  });
  router.get("/auth/avatar/:ref", async (req, res) => {
    const session = auth.read(req);
    if (!session) throw new ApiError("请先登录学习空间", 401);
    if (session.user.yybRef !== req.params.ref) throw new ApiError("此学习账号未分配给当前用户", 403);
    const config = service.getConfig().yyb;
    const response = await fetch(`${config.baseUrl}/accounts/avatar?ref=${encodeURIComponent(req.params.ref)}`, {
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new ApiError("头像暂不可用", 404);
    res.type(response.headers.get("content-type")).send(Buffer.from(await response.arrayBuffer()));
  });
  router.post("/auth/connect", authenticated, async (req, res) => {
    const user = req.studySession.user;
    const ref = String(req.body?.ref || user.yybRef || "");
    if (!user.yybRef || ref !== user.yybRef) throw new ApiError("请先由管理员分配学习账号", 403);
    const accounts = await service.yybRequest("/accounts");
    const source = accounts.find(account => String(account.id ?? account.ref) === ref);
    if (!source) throw new ApiError("分配的学习账号在 YYB 中不可用，请联系管理员", 404);
    const account = cleanAccount(source);
    const remembered = connections.get(user.id);
    const session = { user, account, platforms: remembered?.expires > Date.now() && remembered.account.ref === ref ? { ...remembered.platforms } : {} };
    await Promise.all(["math", "computer"].map(async name => {
      if (!service.getConfig()[name].enabled) { session.platforms[name] = { connected: false, error: "管理员已停用此学习平台" }; return; }
      if (session.platforms[name]?.connected) return;
      try { session.platforms[name] = await service.loginPlatform(name, { ...source, ref }); }
      catch (error) { session.platforms[name] = { connected: false, error: error.message }; }
    }));
    session.expires = Date.now() + 24 * 60 * 60 * 1000;
    connections.set(user.id, session);
    identities.audit(user, "platform.connected", user, "连接个人学习平台");
    if (!Object.values(session.platforms).some(platform => platform.connected)) throw new ApiError("学习平台连接失败，请检查平台状态与账号分配", 502, publicSession(session).platforms);
    res.json(publicSession(session));
  });
  router.post(
    "/platform/math/first-score",
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
  router.post(
    "/platform/math/photo",
    authenticated,
    express.raw({ type: "multipart/form-data", limit: "20mb" }),
    async (req, res) => {
      if (!req.studySession.platforms.math?.connected)
        throw new ApiError("数学平台尚未连接", 401);
      if (!Buffer.isBuffer(req.body) || !req.body.length)
        throw new ApiError("请选择要搜索的题目图片", 400);
      const config = service.getConfig().math;
      const username = config.ocrUsername;
      const password = config.ocrPassword;
      if (!config.ocrUrl || !username || !password) throw new ApiError("请在管理空间配置数学 OCR 地址和凭据", 503);
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
            config.ocrUrl,
            { method: "POST", body: payload },
          ),
        ),
      );
    },
  );
  router.post(
    "/platform/:platform/upload",
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
        throw new ApiError("未启用此上传操作", 403);
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
        `${service.getConfig()[name].baseUrl}${requestPath}${query.size ? `?${query}` : ""}`,
        {
          method: "POST",
          headers: {
            Authorization: bearer(p.token),
            ...(name === "computer"
              ? { "Tenant-Code": requestPath === "/api/exam/wx/searchExercise/text/similarity" ? "2" : String(service.getConfig().computer.tenantCode) }
              : { DesEncryptModel: "PKCS7" }),
            "content-type": req.get("content-type"),
          },
          body: req.body,
        },
      );
      res.json(publicPlatformResponse(result));
    },
  );
  const updateMathProfile = (input, result, platform) => {
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
  };
  router.post("/platform/:platform", authenticated, async (req, res) => {
    const name = req.params.platform;
    let input = validatePlatformRequest(name, req.body);
    let platform = req.studySession.platforms[name];
    if (!platform?.connected)
      throw new ApiError(platform?.error || "该学习平台尚未连接", 401);
    if (name === "math") input = injectMathUser(input, platform, service.getConfig().math.stationId);
    const invoke = () =>
      service[name === "math" ? "mathRequest" : "computerRequest"](
        input.path,
        input,
        platform,
      );
    const respond = async () => {
      const result = await invoke();
      if (name === "math") updateMathProfile(input, result, platform);
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
        if (name === "math") input = injectMathUser(input, platform, service.getConfig().math.stationId);
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
  return router;
}

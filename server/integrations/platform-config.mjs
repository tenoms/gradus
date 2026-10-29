const secretPaths = ["yyb.apiKey", "math.ocrUsername", "math.ocrPassword", "computer.oauthClientSecret", "computer.videoKey", "computer.videoIv"];
const environmentNames = {
  yyb: { baseUrl: "YYB_BASE_URL", apiKey: "YYB_API_KEY" },
  math: { enabled: "MATH_ENABLED", baseUrl: "MATH_BASE_URL", appId: "MATH_APP_ID", stationId: "MATH_STATION_ID", loginId: "MATH_LOGIN_ID", ocrUrl: "MATH_OCR_URL", ocrUsername: "MATH_OCR_USERNAME", ocrPassword: "MATH_OCR_PASSWORD" },
  computer: { enabled: "COMPUTER_ENABLED", baseUrl: "COMPUTER_BASE_URL", appId: "COMPUTER_APP_ID", tenantCode: "COMPUTER_TENANT_CODE", oauthClientId: "COMPUTER_OAUTH_CLIENT_ID", oauthClientSecret: "COMPUTER_OAUTH_CLIENT_SECRET", videoKey: "COMPUTER_VIDEO_KEY", videoIv: "COMPUTER_VIDEO_IV" },
};
const failure = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const clone = (value) => structuredClone(value);
const isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);

/** A new installation has no provider identity, endpoint or credential. */
export function initialPlatformConfig() {
  return {
    yyb: { baseUrl: "", apiKey: "" },
    math: { enabled: false, baseUrl: "", appId: "", stationId: 1, loginId: 1, ocrUrl: "", ocrUsername: "", ocrPassword: "" },
    computer: { enabled: false, baseUrl: "", appId: "", tenantCode: "1", oauthClientId: "", oauthClientSecret: "", videoKey: "", videoIv: "" },
  };
}

function validField(section, name, value) {
  const field = `${section}.${name}`;
  if (name === "enabled") {
    if (typeof value !== "boolean") failure("平台启用状态必须为布尔值");
    return value;
  }
  if (["stationId", "loginId"].includes(name)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) failure("数学站点及登录编号必须为正整数");
    return value;
  }
  if (typeof value !== "string" || value.length > (secretPaths.includes(field) ? 4096 : 2000)) failure("配置字段格式不正确");
  if (secretPaths.includes(field)) {
    if (["videoKey", "videoIv"].includes(name) && value && Buffer.byteLength(value, "utf8") !== 16)
      failure("计算机录播密钥及 IV 必须为16字节UTF-8文本");
    return value;
  }
  const clean = value.trim();
  if (["baseUrl", "ocrUrl"].includes(name)) {
    if (!clean) return "";
    let url;
    try { url = new URL(clean); } catch { failure("服务地址必须为完整 HTTP 或 HTTPS 地址"); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      failure("服务地址只允许 HTTP 或 HTTPS，不能包含凭据、查询或片段");
    return clean.replace(/\/+$/, "");
  }
  if (name === "appId" && clean && !/^wx[a-fA-F0-9]{16}$/.test(clean)) failure("小程序 App ID 格式不正确");
  if (["tenantCode", "oauthClientId"].includes(name) && clean.length > 160) failure("租户编号及 OAuth 客户端编号最多160字符");
  return clean;
}

/** Read explicit environment values; completeness is checked after merging managed values. */
export function readEnvironmentPlatformConfig(env = process.env) {
  const config = initialPlatformConfig(), environmentFields = [];
  for (const [section, names] of Object.entries(environmentNames)) {
    for (const [name, variable] of Object.entries(names)) {
      if (!Object.hasOwn(env, variable) || env[variable] === undefined) continue;
      let value = env[variable];
      try {
        if (name === "enabled") {
          const text = String(value).trim().toLowerCase();
          if (!["0", "1", "false", "true"].includes(text)) failure("必须为 0、1、false 或 true");
          value = text === "1" || text === "true";
        } else if (["stationId", "loginId"].includes(name)) value = Number(value);
        config[section][name] = validField(section, name, value);
      } catch (error) { failure(`环境变量 ${variable}：${error.message}`); }
      environmentFields.push(`${section}.${name}`);
    }
  }
  return { config, environmentFields };
}

function managedConfiguration(input) {
  if (!isObject(input)) failure("平台配置格式不正确");
  const result = initialPlatformConfig();
  for (const [section, values] of Object.entries(input)) {
    if (!environmentNames[section] || !isObject(values)) failure("未知的平台配置分组");
    for (const [name, value] of Object.entries(values)) {
      if (!Object.hasOwn(environmentNames[section], name)) failure("未知的平台配置字段");
      result[section][name] = validField(section, name, value);
    }
  }
  return result;
}
function effectiveConfiguration(managed, environment) {
  const result = clone(managed);
  for (const field of environment.environmentFields) {
    const [section, name] = field.split(".");
    result[section][name] = environment.config[section][name];
  }
  for (const name of ["math", "computer"]) {
    const config = result[name];
    if (config.enabled && (!config.baseUrl || !config.appId)) failure(`启用${name === "math" ? "数学" : "计算机"}平台前请配置服务地址和小程序 App ID`);
    if (name === "computer" && config.enabled && (!config.tenantCode || !config.oauthClientId)) failure("启用计算机平台前请配置租户编号和 OAuth 客户端编号");
  }
  return result;
}

/** Persist management values only; explicit process environment overrides them until restart. */
export async function createPlatformConfigStore({ database: db, defaults, env = process.env } = {}) {
  if (!db) throw new Error("平台配置需要 PostgreSQL 数据库连接");
  const environment = readEnvironmentPlatformConfig(env);
  const table = db.web('platform_configuration');
  await db.query(`CREATE TABLE IF NOT EXISTS ${table} (id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,config JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL)`);
  const existing = (await db.query(`SELECT id FROM ${table} WHERE id=1`)).rows[0];
  if (!existing) {
    const initial = managedConfiguration(defaults || initialPlatformConfig());
    await db.query(`INSERT INTO ${table}(id,revision,config,updated_at) VALUES(1,0,$1,$2) ON CONFLICT(id) DO NOTHING`, [JSON.stringify(initial), new Date().toISOString()]);
  }
  let revision, config, updatedAt;
  const snapshot = () => effectiveConfiguration(config, environment);
  async function refresh() {
    const existing = (await db.query(`SELECT revision,config,updated_at FROM ${table} WHERE id=1`)).rows[0];
    revision = existing.revision; config = managedConfiguration(existing.config); updatedAt = new Date(existing.updated_at).toISOString();
    return publicConfig();
  }
  function publicConfig() {
    const safe = snapshot(), secretStatus = {};
    for (const field of secretPaths) {
      const [section, name] = field.split(".");
      secretStatus[field] = !!safe[section][name];
      delete safe[section][name];
    }
    return { revision, config: safe, secretStatus, environmentFields: [...environment.environmentFields], updatedAt };
  }
  await refresh();
  return {
    snapshot,
    publicConfig,
    refresh,
    async update(input) {
      if (!isObject(input) || !Number.isInteger(input.revision) || input.revision < 0 || !isObject(input.config)) failure("配置及版本格式不正确");
      await refresh();
      if (input.revision !== revision) failure("配置已在其他窗口更新，请重新读取后保存", 409);
      const clearing = input.clearSecrets || [];
      if (!Array.isArray(clearing) || clearing.some(field => !secretPaths.includes(field))) failure("清空凭据字段不正确");
      for (const field of clearing) if (environment.environmentFields.includes(field)) failure(`配置 ${field} 由环境变量控制，不能在管理端清空`);
      const previous = snapshot(), next = clone(config);
      for (const [section, values] of Object.entries(input.config)) {
        if (!environmentNames[section] || !isObject(values)) failure("未知的平台配置分组");
        for (const [name, value] of Object.entries(values)) {
          if (!Object.hasOwn(environmentNames[section], name)) failure("未知的平台配置字段");
          const field = `${section}.${name}`;
          if (environment.environmentFields.includes(field)) {
            if (validField(section, name, value) !== previous[section][name]) failure(`配置 ${field} 由环境变量控制，不能在管理端修改`);
            continue;
          }
          if (secretPaths.includes(field) && value === "") continue;
          if (clearing.includes(field) && value) failure("同一凭据不能同时替换并清空");
          next[section][name] = validField(section, name, value);
        }
      }
      for (const field of clearing) { const [section, name] = field.split("."); next[section][name] = ""; }
      const effective = effectiveConfiguration(next, environment);
      const yybChanged = JSON.stringify(effective.yyb) !== JSON.stringify(previous.yyb);
      const affectedPlatforms = ["math", "computer"].filter(name => yybChanged || JSON.stringify(effective[name]) !== JSON.stringify(previous[name]));
      if (JSON.stringify(next) === JSON.stringify(config)) return { ...publicConfig(), affectedPlatforms };
      const nextAt = new Date().toISOString();
      const result = await db.query(`UPDATE ${table} SET revision=revision+1,config=$1,updated_at=$2 WHERE id=1 AND revision=$3`, [JSON.stringify(next), nextAt, revision]);
      if (result.rowCount !== 1) { await refresh(); failure("配置已被更新，请重新打开配置页面", 409); }
      config = next; revision++; updatedAt = nextAt;
      return { ...publicConfig(), affectedPlatforms };
    },
    close: async () => {},
  };
}

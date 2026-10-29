import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync, chmodSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secretPaths = ["yyb.apiKey", "math.ocrUsername", "math.ocrPassword", "computer.oauthClientSecret", "computer.videoKey", "computer.videoIv"];
const fields = {
  yyb: ["baseUrl", "apiKey"],
  math: ["enabled", "baseUrl", "appId", "stationId", "loginId", "ocrUrl", "ocrUsername", "ocrPassword"],
  computer: ["enabled", "baseUrl", "appId", "tenantCode", "oauthClientId", "oauthClientSecret", "videoKey", "videoIv"],
};
const failure = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const clone = (value) => structuredClone(value);
const isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const optionalRead = (filename) => { try { return readFileSync(filename, "utf8"); } catch { return ""; } };

/** Bootstrap inputs are read once by the store. Saved settings are the runtime authority. */
export function readPlatformDefaults({ env = process.env, readLocal = true, root = projectRoot } = {}) {
  const yybText = readLocal ? optionalRead(path.join(root, "yyb.txt")) : "";
  const ocrSource = readLocal ? optionalRead(path.join(root, "wx*-math/topic/pages/camerasearch/camerasearch.js")) : "";
  let videoValues = [];
  if (readLocal && (!env.COMPUTER_VIDEO_KEY || !env.COMPUTER_VIDEO_IV)) {
    const source = optionalRead(path.join(root, "wx*-computer/common/vendor.js"));
    const module = source.slice(source.indexOf("  y6zN: function"));
    const decrypt = module.slice(module.indexOf("t.e = function(e)"), module.indexOf('var a = n("Av7u")'));
    videoValues = [...decrypt.matchAll(/enc\.Utf8\.parse\(["']([^"']+)["']\)/g)].map((match) => match[1]);
  }
  const baseUrl = (value) => String(value || "").replace(/\/+$/, "");
  return {
    yyb: { baseUrl: baseUrl(env.YYB_BASE_URL || yybText.match(/https?:\/\/[^\s]+/)?.[0]), apiKey: env.YYB_API_KEY || "" },
    math: {
      enabled: env.MATH_ENABLED !== "0", baseUrl: baseUrl(env.MATH_BASE_URL || "https://api.math-upstream.invalid"),
      appId: env.MATH_APP_ID || "<math-app-id>", stationId: Number(env.MATH_STATION_ID || 1), loginId: Number(env.MATH_LOGIN_ID || 2),
      ocrUrl: baseUrl(env.MATH_OCR_URL || "https://photo.math-upstream.invalid/predict"),
      ocrUsername: env.MATH_OCR_USERNAME || ocrSource.match(/username:\s*["']([^"']+)["']/)?.[1] || "",
      ocrPassword: env.MATH_OCR_PASSWORD || ocrSource.match(/password:\s*["']([^"']+)["']/)?.[1] || "",
    },
    computer: {
      enabled: env.COMPUTER_ENABLED !== "0", baseUrl: baseUrl(env.COMPUTER_BASE_URL || "https://teach.computer-upstream.invalid"),
      appId: env.COMPUTER_APP_ID || "<computer-app-id>", tenantCode: env.COMPUTER_TENANT_CODE || "1",
      oauthClientId: env.COMPUTER_OAUTH_CLIENT_ID || "web_app", oauthClientSecret: env.COMPUTER_OAUTH_CLIENT_SECRET || "<computer-oauth-secret>",
      videoKey: env.COMPUTER_VIDEO_KEY || videoValues[0] || "", videoIv: env.COMPUTER_VIDEO_IV || videoValues[1] || "",
    },
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
    if (!clean && (section === "yyb" || name === "ocrUrl")) return "";
    let url;
    try { url = new URL(clean); } catch { failure("服务地址必须为完整 HTTP 或 HTTPS 地址"); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      failure("服务地址只允许 HTTP 或 HTTPS，不能包含凭据、查询或片段");
    return clean.replace(/\/+$/, "");
  }
  if (name === "appId" && !/^wx[a-fA-F0-9]{16}$/.test(clean)) failure("小程序 App ID 格式不正确");
  if (["tenantCode", "oauthClientId"].includes(name) && (!clean || clean.length > 160)) failure("租户编号及 OAuth 客户端编号不能为空且最多160字符");
  return clean;
}

/** Stores one versioned server configuration; the public interface never returns credentials. */
export function createPlatformConfigStore({ filename, defaults, env, readLocal } = {}) {
  if (!filename) filename = path.join(projectRoot, ".data/platform-config.sqlite");
  if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS platform_configuration (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, config TEXT NOT NULL, updated_at TEXT NOT NULL)");
  const initial = defaults || readPlatformDefaults({ ...(env ? { env } : {}), ...(readLocal === undefined ? {} : { readLocal }) });
  const existing = db.prepare("SELECT revision,config,updated_at FROM platform_configuration WHERE id=1").get();
  let revision = existing?.revision || 0;
  let config = existing ? JSON.parse(existing.config) : clone(initial);
  let updatedAt = existing?.updated_at || new Date().toISOString();
  if (!existing) db.prepare("INSERT INTO platform_configuration(id,revision,config,updated_at) VALUES(1,0,?,?)").run(JSON.stringify(config), updatedAt);
  const secureFiles = () => {
    if (filename === ":memory:") return;
    for (const file of [filename, `${filename}-wal`, `${filename}-shm`]) if (existsSync(file)) chmodSync(file, 0o600);
  };
  secureFiles();
  function publicConfig() {
    const safe = clone(config);
    const secretStatus = {};
    for (const field of secretPaths) {
      const [section, name] = field.split(".");
      secretStatus[field] = !!safe[section][name];
      delete safe[section][name];
    }
    return { revision, config: safe, secretStatus, updatedAt };
  }
  return {
    snapshot: () => clone(config),
    publicConfig,
    update(input) {
      if (!isObject(input) || !Number.isInteger(input.revision) || input.revision < 0 || !isObject(input.config)) failure("配置及版本格式不正确");
      if (input.revision !== revision) failure("配置已在其他窗口更新，请重新读取后保存", 409);
      const clearing = input.clearSecrets || [];
      if (!Array.isArray(clearing) || clearing.some(field => !secretPaths.includes(field))) failure("清空凭据字段不正确");
      const next = clone(config);
      for (const [section, values] of Object.entries(input.config)) {
        if (!fields[section] || !isObject(values)) failure("未知的平台配置分组");
        for (const [name, value] of Object.entries(values)) {
          if (!fields[section].includes(name)) failure("未知的平台配置字段");
          const field = `${section}.${name}`;
          if (secretPaths.includes(field) && value === "") continue;
          if (clearing.includes(field) && value) failure("同一凭据不能同时替换并清空");
          next[section][name] = validField(section, name, value);
        }
      }
      for (const field of clearing) { const [section, name] = field.split("."); next[section][name] = ""; }
      const yybChanged = JSON.stringify(next.yyb) !== JSON.stringify(config.yyb);
      const affectedPlatforms = ["math", "computer"].filter(name => yybChanged || JSON.stringify(next[name]) !== JSON.stringify(config[name]));
      if (!affectedPlatforms.length) return { ...publicConfig(), affectedPlatforms };
      const nextAt = new Date().toISOString();
      const result = db.prepare("UPDATE platform_configuration SET revision=revision+1,config=?,updated_at=? WHERE id=1 AND revision=?").run(JSON.stringify(next), nextAt, revision);
      if (result.changes !== 1) failure("配置已被更新，请重新打开配置页面", 409);
      config = next; revision++; updatedAt = nextAt;
      secureFiles();
      return { ...publicConfig(), affectedPlatforms };
    },
    close() { db.close(); },
  };
}

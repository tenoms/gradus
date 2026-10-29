import express from "express";
import cookieParser from "cookie-parser";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createIdentityStore } from "./identity-store.mjs";
import { createPlatformConfigStore } from "./platform-config.mjs";
import { createUpstreamClient } from "./upstream.mjs";
import { createSessionSpace } from "./session-space.mjs";
import { createAdminRouter } from "./routes/admin.mjs";
import { createLearningRouter } from "./routes/learning.mjs";
import { createRuntimeInsights } from "./runtime-insights.mjs";
export { injectMathUser, validatePlatformRequest, publicPlatformResponse } from "./platform-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function createApp(overrides = {}) {
  const databasePath = overrides.databasePath || process.env.STUDY_DATABASE_PATH || path.join(root, ".data/identity.sqlite");
  const identities = overrides.identityStore || createIdentityStore(databasePath);
  const configuration = overrides.configuration || createPlatformConfigStore({ filename: overrides.configDatabasePath || process.env.STUDY_CONFIG_DATABASE_PATH || (databasePath === ":memory:" ? ":memory:" : path.join(path.dirname(databasePath), "integrations.sqlite")) });
  const service = { ...createUpstreamClient(() => configuration.snapshot(), overrides.requestJson ? { requestJson: overrides.requestJson } : {}), ...overrides };
  const connections = new Map();
  const operations = createRuntimeInsights();
  const adminAuth = createSessionSpace({ space: "admin", identities, connections });
  const learningAuth = createSessionSpace({ space: "learning", identities, connections });
  const app = express();
  app.disable("x-powered-by");
  app.use(cookieParser());
  app.use(operations.middleware);
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      res.set("Cache-Control", "no-store");
      const origin = req.get("origin");
      if (origin) {
        try { if (new URL(origin).host !== req.get("host")) return res.status(403).json({ error: "请从当前系统发起请求" }); }
        catch { return res.status(403).json({ error: "请求来源格式不正确" }); }
      }
    }
    next();
  });
  app.use(express.json({ limit: "3mb" }));
  app.get("/api/health", (req, res) => res.json({ ok: true, service: "study-web", spaces: ["admin", "learning"] }));
  app.get("/api/system/setup", (req, res) => res.json({ setupRequired: identities.setupRequired() }));
  app.post("/api/system/setup", (req, res) => {
    const user = identities.setup(req.body);
    res.status(201).json(adminAuth.save(req, res, user));
  });
  app.use("/api/admin", createAdminRouter({ service, identities, connections, configuration, operations, auth: adminAuth }));
  app.use("/api/learning", createLearningRouter({ service, identities, connections, auth: learningAuth }));
  app.use("/api", (req, res) => res.status(404).json({ error: "接口不存在" }));
  const dist = path.join(root, "dist");
  if (existsSync(path.join(dist, "index.html"))) {
    app.use(express.static(dist, { index: false }));
    app.get("/", (req, res) => res.redirect("/learn/"));
    app.get(["/admin", "/admin/{*path}"], (req, res) => res.sendFile(path.join(dist, "admin.html")));
    app.get(["/learn", "/learn/{*path}"], (req, res) => res.sendFile(path.join(dist, "learn.html")));
    app.get("/{*path}", (req, res) => res.status(404).sendFile(path.join(dist, "index.html")));
  }
  app.use((error, req, res, next) => {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
    res.status(status).json({ error: status === 500 ? "服务处理失败，请稍后重试" : error.message, requestId: res.locals.requestId, ...(error.details ? { details: error.details } : {}) });
  });
  app.locals.identityStore = identities;
  app.locals.configuration = configuration;
  app.locals.connections = connections;
  app.locals.close = () => { identities.close(); configuration.close(); };
  return app;
}

import express from "express";
import cookieParser from "cookie-parser";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./database.mjs";
import { createAccountPool } from "./account-pool.mjs";
import { createPrivatePlatformStore } from "./private-platform.mjs";
import { createPersonalSync } from "./personal-sync.mjs";
import { createPersonalSyncRouter } from "./routes/personal-sync.mjs";
import { createResourceStore } from "./resource-store.mjs";
import { createResourceSync } from "./resource-sync.mjs";
import { createResourceRouter } from "./routes/resources.mjs";
import { createIdentityStore } from "./identity-store.mjs";
import { createPlatformConfigStore } from "./platform-config.mjs";
import { createUpstreamClient } from "./upstream.mjs";
import { createTokenLifecycle } from "./token-lifecycle.mjs";
import { createRegistrationStore } from "./registration.mjs";
import { createRegistrationRouter } from "./routes/registration.mjs";
import { createSessionSpace } from "./session-space.mjs";
import { createAdminRouter } from "./routes/admin.mjs";
import { createLearningRouter } from "./routes/learning.mjs";
import { createRuntimeInsights } from "./runtime-insights.mjs";
export { injectMathUser, validatePlatformRequest, publicPlatformResponse } from "./platform-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function createApp(overrides = {}) {
  const database = overrides.database || await createDatabase({ schemaPrefix: process.env.STUDY_SCHEMA_PREFIX || "study" });
  const identities = overrides.identityStore || await createIdentityStore(database);
  const configuration = await (overrides.configuration || createPlatformConfigStore({ database, ...(overrides.configurationDefaults ? { defaults: overrides.configurationDefaults } : {}) }));
  const service = { ...createUpstreamClient(() => configuration.snapshot(), overrides.requestJson ? { requestJson: overrides.requestJson } : {}), ...overrides };
  const tokenLifecycle = createTokenLifecycle({ service });
  const connections = new Map();
  const operations = createRuntimeInsights();
  const accountPool = await createAccountPool({ database, service, connections, identities, tokenLifecycle });
  const resourceStore = await createResourceStore(database);
  const resourceSync = createResourceSync({ store: resourceStore, service, connections, configuration, accountPool });
  const personalSync = await createPersonalSync({ database, service, identities, tokenLifecycle });
  const privatePlatform = await createPrivatePlatformStore({ database, resourceStore, personalSync });
  const adminAuth = createSessionSpace({ space: "admin", identities, connections });
  const learningAuth = createSessionSpace({ space: "learning", identities, connections, learningProfile: (user,name) => privatePlatform.profile(user.id,name,name === "math" ? { ID:user.id,StuID:user.id } : { userId:user.id },user.displayName) });
  const registration = await createRegistrationStore({ database, identities });
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
  app.get("/api/system/setup", async (req, res) => res.json({ setupRequired: await identities.setupRequired() }));
  app.post("/api/system/setup", async (req, res) => {
    const user = await identities.setup(req.body);
    res.status(201).json(await adminAuth.save(req, res, user));
  });
  app.use("/api/admin", createResourceRouter({ resourceStore, resourceSync, identities, service, connections, auth: adminAuth }));
  app.use("/api/admin", createAdminRouter({ service, identities, connections, configuration, operations, accountPool, resourceSync, auth: adminAuth }));
  app.use(createRegistrationRouter({ registration, adminAuth, learningAuth }));
  app.use("/api/learning/personal-sync", createPersonalSyncRouter({ auth: learningAuth, personalSync }));
  app.use("/api/learning", createLearningRouter({ service, identities, connections, accountPool, privatePlatform, resourceSync, personalSync, auth: learningAuth }));
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
  app.locals.database = database;
  app.locals.accountPool = accountPool;
  app.locals.resourceStore = resourceStore;
  app.locals.resourceSync = resourceSync;
  app.locals.personalSync = personalSync;
  app.locals.registration = registration;
  app.locals.tokenLifecycle = tokenLifecycle;
  app.locals.privatePlatform = privatePlatform;
  app.locals.identityStore = identities;
  app.locals.configuration = configuration;
  app.locals.connections = connections;
  app.locals.close = async () => { await identities.close(); await configuration.close(); await database.close(); };
  return app;
}

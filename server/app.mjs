import express from "express";
import cookieParser from "cookie-parser";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./infrastructure/database.mjs";
import { createAccountPool } from "./modules/accounts/pool.mjs";
import { createPrivatePlatformStore } from "./modules/learning/private-platform.mjs";
import { createPersonalSync } from "./modules/personal-sync/sync.mjs";
import { createPersonalSyncRouter } from "./modules/personal-sync/routes.mjs";
import { createResourceStore } from "./modules/resources/store.mjs";
import { createResourceSync } from "./modules/resources/sync.mjs";
import { createResourceRouter } from "./modules/resources/routes.mjs";
import { createIdentityStore } from "./modules/identity/store.mjs";
import { createPlatformConfigStore } from "./integrations/platform-config.mjs";
import { createUpstreamClient } from "./integrations/upstream.mjs";
import { createTokenLifecycle } from "./integrations/token-lifecycle.mjs";
import { createRegistrationStore } from "./modules/identity/registration.mjs";
import { createRegistrationRouter } from "./modules/identity/routes.mjs";
import { createSessionSpace } from "./modules/identity/session-space.mjs";
import { createAdminRouter } from "./modules/admin/routes.mjs";
import { createLearningRouter } from "./modules/learning/routes.mjs";
import { createMathProfileStore } from "./modules/learning/math-profile.mjs";
import { createRuntimeInsights } from "./infrastructure/runtime-insights.mjs";
import { readRuntimeConfig } from "./infrastructure/runtime-config.mjs";
export { injectMathUser, validatePlatformRequest, publicPlatformResponse } from "./integrations/platform-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function createApp(overrides = {}) {
  const runtimeConfig = overrides.runtimeConfig || readRuntimeConfig();
  const database = overrides.database || await createDatabase({ connectionString: runtimeConfig.database.url || undefined, schemaPrefix: runtimeConfig.database.schemaPrefix, max: runtimeConfig.database.maxConnections, connectionTimeoutMillis: runtimeConfig.database.connectionTimeoutMs });
  const identities = overrides.identityStore || await createIdentityStore(database);
  const configuration = await (overrides.configuration || createPlatformConfigStore({ database, env: overrides.configurationEnv ?? process.env, ...(overrides.configurationDefaults ? { defaults: overrides.configurationDefaults } : {}) }));
  const service = { ...createUpstreamClient(() => configuration.snapshot(), { requestTimeoutMs: runtimeConfig.upstream.requestTimeoutMs, ...(overrides.requestJson ? { requestJson: overrides.requestJson } : {}) }), ...overrides };
  const tokenLifecycle = createTokenLifecycle({ service });
  const connections = new Map();
  const operations = createRuntimeInsights(runtimeConfig.diagnostics);
  const accountPool = await createAccountPool({ database, service, connections, identities, tokenLifecycle, environmentFields: configuration.publicConfig().environmentFields, timings: runtimeConfig.accounts });
  const resourceStore = await createResourceStore(database, runtimeConfig.resources);
  const resourceSync = createResourceSync({ store: resourceStore, service, connections, configuration, accountPool });
  const personalSync = await createPersonalSync({ database, service, identities, tokenLifecycle });
  const privatePlatform = await createPrivatePlatformStore({ database, resourceStore, personalSync });
  const mathProfile = createMathProfileStore({ database, identities, privatePlatform });
  const adminAuth = createSessionSpace({ space: "admin", identities, connections, settings: runtimeConfig.session });
  const learningAuth = createSessionSpace({ space: "learning", identities, connections, settings: runtimeConfig.session, learningProfile: (user,name) => privatePlatform.profile(user.id,name,name === "math" ? { ID:user.id,StuID:user.id } : { userId:user.id },user.displayName) });
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
  app.use(express.json({ limit: runtimeConfig.http.jsonBodyLimit }));
  app.get("/api/health", (req, res) => res.json({ ok: true, service: "study-web", spaces: ["admin", "learning"] }));
  app.get("/api/system/setup", async (req, res) => res.json({ setupRequired: await identities.setupRequired() }));
  app.post("/api/system/setup", async (req, res) => {
    const user = await identities.setup(req.body);
    res.status(201).json(await adminAuth.save(req, res, user));
  });
  app.use("/api/admin", createResourceRouter({ resourceStore, resourceSync, identities, service, connections, auth: adminAuth }));
  app.use("/api/admin", createAdminRouter({ service, identities, connections, configuration, operations, accountPool, resourceSync, mathProfile, auth: adminAuth }));
  app.use(createRegistrationRouter({ registration, adminAuth, learningAuth }));
  app.use("/api/learning/personal-sync", createPersonalSyncRouter({ auth: learningAuth, personalSync }));
  app.use("/api/learning", createLearningRouter({ service, identities, connections, accountPool, privatePlatform, mathProfile, resourceSync, personalSync, runtimeConfig, auth: learningAuth }));
  app.use("/api", (req, res) => res.status(404).json({ error: "接口不存在" }));
  const dist = path.join(root, "dist");
  if (existsSync(path.join(dist, "index.html"))) {
    // Vite includes a content hash in asset names, so returning learners can reuse them.
    app.use("/assets", express.static(path.join(dist, "assets"), { index: false, immutable: true, maxAge: runtimeConfig.http.assetMaxAgeMs }));
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
  app.locals.mathProfile = mathProfile;
  app.locals.identityStore = identities;
  app.locals.configuration = configuration;
  app.locals.connections = connections;
  app.locals.close = async () => { await identities.close(); await configuration.close(); await database.close(); };
  return app;
}

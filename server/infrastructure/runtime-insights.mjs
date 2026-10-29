import { randomUUID } from "node:crypto";

/** Bounded operational metadata; request bodies, query strings and credentials are never collected. */
export function createRuntimeInsights() {
  const startedAt = new Date().toISOString();
  let requests = 0, failures = 0;
  const recent = [];
  return {
    middleware(req, res, next) {
      if (!req.path.startsWith("/api/")) return next();
      const id = randomUUID();
      const started = performance.now();
      res.locals.requestId = id;
      res.set("X-Request-ID", id);
      res.once("finish", () => {
        requests++;
        if (res.statusCode >= 500) failures++;
        const space = req.originalUrl.startsWith("/api/admin/") ? "admin" : req.originalUrl.startsWith("/api/learning/") ? "learning" : "system";
        const matched = typeof req.route?.path === "string" ? req.route.path : "";
        const prefix = space === "system" ? "" : `/api/${space}${req.originalUrl.startsWith(`/api/${space}/auth/`) && !matched.startsWith("/auth/") ? "/auth" : ""}`;
        const route = matched ? (matched.startsWith("/api/") ? matched : `${prefix}${matched}`) : "未匹配接口";
        recent.unshift({ id, at: new Date().toISOString(), space, method: req.method, route, status: res.statusCode, durationMs: Math.round(performance.now() - started), ...(["math", "computer"].includes(req.params?.platform) ? { platform: req.params.platform } : {}) });
        recent.length = Math.min(recent.length, 100);
      });
      next();
    },
    snapshot() { return { startedAt, uptimeSeconds: Math.floor((Date.now() - Date.parse(startedAt)) / 1000), requests, failures, recentRequests: recent.map(entry => ({ ...entry })) }; },
  };
}

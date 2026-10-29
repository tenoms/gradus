import express from "express";
import { ApiError } from "./upstream.mjs";
import { publicSession } from "./platform-policy.mjs";

const lifetime = 24 * 60 * 60 * 1000;

/** A session is issued to one application space; neither cookie nor token crosses spaces. */
export function createSessionSpace({ space, identities, connections }) {
  const cookieName = `study_${space}_session`;
  const cookiePath = `/api/${space}`;
  function stateFor(user) {
    if (!user || (space === "admin" && user.role !== "admin")) return null;
    if (space === "admin") return { user };
    const remembered = connections.get(user.id);
    const yyb = identities.yybSettings(user.id);
    const ref = yyb.mode === "custom" ? yyb.ref : user.yybRef;
    if (remembered && (remembered.expires <= Date.now() || remembered.account.ref !== ref ||
        (remembered.yybMode || "system") !== yyb.mode || (remembered.yybRevision || 0) !== yyb.revision)) connections.delete(user.id);
    const connection = connections.get(user.id);
    return { user, account: connection?.account || null, platforms: connection?.platforms || {} };
  }
  function read(req) { return stateFor(identities.sessionUser(req.cookies[cookieName], space)); }
  function publicValue(session) {
    return space === "admin"
      ? { authenticated: !!session, space, ...(session ? { user: session.user } : {}) }
      : { ...publicSession(session), space };
  }
  function save(req, res, user) {
    identities.revokeSession(req.cookies[cookieName]);
    const token = identities.issueSession(user.id, lifetime, space);
    res.cookie(cookieName, token, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "1" || req.secure, maxAge: lifetime, path: cookiePath });
    return publicValue(stateFor(user));
  }
  function requireSession(req, res, next) {
    req.studySession = read(req);
    if (!req.studySession) return res.status(401).json({ error: space === "admin" ? "请先登录管理空间" : "请先登录学习空间" });
    if (req.get("X-Study-User") !== req.studySession.user.id)
      return res.status(403).json({ error: "当前空间的登录账号已切换，请重新加载", code: "USER_SCOPE_CHANGED" });
    next();
  }
  const router = express.Router();
  router.get("/session", (req, res) => res.json(publicValue(read(req))));
  router.post("/login", (req, res) => {
    const user = identities.login(req.body?.username, req.body?.password, space);
    res.json(save(req, res, user));
  });
  router.post("/logout", requireSession, (req, res) => {
    identities.revokeSession(req.cookies[cookieName]);
    identities.audit(req.studySession.user, "auth.logout", req.studySession.user, space);
    res.clearCookie(cookieName, { path: cookiePath });
    res.json({ ok: true });
  });
  router.post("/password", requireSession, (req, res) => {
    identities.changePassword(req.studySession.user.id, req.body?.currentPassword, req.body?.password, req.cookies[cookieName]);
    res.json({ ok: true, otherSessionsRevoked: true });
  });
  return { read, save, require: requireSession, router, publicValue };
}

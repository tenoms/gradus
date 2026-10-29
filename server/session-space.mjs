import express from "express";
import { publicSession } from "./platform-policy.mjs";

const lifetime = 24 * 60 * 60 * 1000;

/** A session is issued to one application space; neither cookie nor token crosses spaces. */
export function createSessionSpace({ space, identities, connections, learningProfile }) {
  const cookieName = `study_${space}_session`;
  const cookiePath = `/api/${space}`;
  async function stateFor(user) {
    if (!user || (space === "admin" && user.role !== "admin")) return null;
    if (space === "admin") return { user };
    const yyb=await identities.yybSettings(user.id);
    const platforms={};
    for(const name of ['math','computer']) {
      const base=name==='math'?{ID:user.id,StuID:user.id,UserNick:user.displayName}:{userId:user.id,nickName:user.displayName};
      platforms[name]={available:true,connected:false,identityMode:'web',stuId:user.id,user:learningProfile?await learningProfile(user,name):base};
    }
    return {user,account:yyb.ref?{ref:yyb.ref}:null,platforms,identityMode:'web',webOwned:true,yybMode:yyb.mode,yybRevision:yyb.revision,yybBaseUrl:yyb.mode==='custom'?yyb.baseUrl:''};
  }
  async function read(req) { return stateFor(await identities.sessionUser(req.cookies[cookieName], space)); }
  function publicValue(session) {
    return space === "admin"
      ? { authenticated: !!session, space, ...(session ? { user: session.user } : {}) }
      : { ...publicSession(session), space };
  }
  async function save(req, res, user) {
    await identities.revokeSession(req.cookies[cookieName]);
    const token = await identities.issueSession(user.id, lifetime, space);
    res.cookie(cookieName, token, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "1" || req.secure, maxAge: lifetime, path: cookiePath });
    return publicValue(await stateFor(user));
  }
  async function requireSession(req, res, next) {
    req.studySession = await read(req);
    if (!req.studySession) return res.status(401).json({ error: space === "admin" ? "请先登录管理空间" : "请先登录学习空间" });
    if (req.get("X-Study-User") !== req.studySession.user.id)
      return res.status(403).json({ error: "当前空间的登录账号已切换，请重新加载", code: "USER_SCOPE_CHANGED" });
    next();
  }
  const router = express.Router();
  router.get("/session", async (req, res) => res.json(publicValue(await read(req))));
  router.post("/login", async (req, res) => {
    const user = await identities.login(req.body?.username, req.body?.password, space);
    res.json(await save(req, res, user));
  });
  router.post("/logout", requireSession, async (req, res) => {
    await identities.revokeSession(req.cookies[cookieName]);
    await identities.audit(req.studySession.user, "auth.logout", req.studySession.user, space);
    res.clearCookie(cookieName, { path: cookiePath });
    res.json({ ok: true });
  });
  router.post("/password", requireSession, async (req, res) => {
    await identities.changePassword(req.studySession.user.id, req.body?.currentPassword, req.body?.password, req.cookies[cookieName]);
    res.json({ ok: true, otherSessionsRevoked: true });
  });
  return { read, save, require: requireSession, router, publicValue };
}

import express from "express";
import { cleanAccount } from "../platform-policy.mjs";

export function createAdminRouter({ service, identities, connections, configuration, operations, auth }) {
  const router = express.Router();
  router.use("/auth", auth.router);
  router.use(auth.require);
  router.get("/overview", (req, res) => res.json(identities.overview(connections)));
  router.get("/operations", (req, res) => res.json({ ...operations.snapshot(), configurationRevision: configuration.publicConfig().revision }));
  router.get("/users", (req, res) => res.json({ users: identities.users() }));
  router.post("/users", (req, res) => res.status(201).json({ user: identities.createUser(req.body, req.studySession.user) }));
  router.patch("/users/:id", (req, res) => {
    const user = identities.updateUser(req.params.id, req.body, req.studySession.user);
    const connection = connections.get(user.id);
    if (user.status !== "active" || (connection && connection.account.ref !== user.yybRef)) connections.delete(user.id);
    res.json({ user });
  });
  router.post("/users/:id/password", (req, res) => {
    identities.resetPassword(req.params.id, req.body?.password, req.studySession.user);
    connections.delete(req.params.id);
    res.json({ ok: true });
  });
  router.get("/accounts", async (req, res) => res.json({ accounts: (await service.yybRequest("/accounts")).map(cleanAccount) }));
  router.get("/audit", (req, res) => res.json({ entries: identities.auditEntries() }));
  router.get("/announcements", (req, res) => res.json({ announcements: identities.listAnnouncements() }));
  router.post("/announcements", (req, res) => res.status(201).json({ announcement: identities.announce(req.body, req.studySession.user) }));
  router.delete("/announcements/:id", (req, res) => { identities.deleteAnnouncement(req.params.id, req.studySession.user); res.json({ ok: true }); });
  router.get("/configuration", (req, res) => res.json(configuration.publicConfig()));
  router.put("/configuration", (req, res) => {
    const result = configuration.update(req.body);
    for (const connection of connections.values()) for (const name of result.affectedPlatforms)
      connection.platforms[name] = { connected: false, error: "平台配置已更新，请重新连接" };
    identities.audit(req.studySession.user, "configuration.updated", "平台集成", `版本 ${result.revision}；重新连接：${result.affectedPlatforms.join("、") || "无"}`);
    res.json(result);
  });
  router.post("/configuration/probe", async (req, res) => {
    const result = await service.probe({ target: req.body?.target, ref: req.body?.ref });
    identities.audit(req.studySession.user, "configuration.probed", "平台集成", `${result.target}：${result.ok ? "通过" : "失败"}`);
    res.json(result);
  });
  return router;
}

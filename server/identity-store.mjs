import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ApiError } from "./upstream.mjs";
import { validateStudyData } from "../shared/study-data.mjs";
export { validateStudyData } from "../shared/study-data.mjs";

const emptyStudy = () => ({ tasks: [], activities: [], goalMinutes: 60 });
const now = () => new Date().toISOString();
const fail = (message, status = 400) => { throw new ApiError(message, status); };
const text = (value, max, label, optional = false) => {
  if (typeof value !== "string" || value.length > max || (!optional && !value.trim()))
    fail(`${label}格式不正确`);
  return value.trim();
};
const accountBinding = (value) => value === undefined || value === null || value === "" ? null : text(value, 160, "学习账号");
function passwordHash(password) {
  if (typeof password !== "string" || password.length < 10 || password.length > 256)
    fail("密码需要 10–256 个字符");
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
function passwordMatches(password, encoded) {
  if (typeof password !== "string" || password.length > 256) return false;
  const [salt, hash] = encoded.split(":");
  return timingSafeEqual(Buffer.from(hash, "hex"), scryptSync(password, salt, 64));
}
const tokenHash = (token) => createHash("sha256").update(token).digest("hex");
function publicIdentity(row) {
  if (!row) return null;
  return {
    id: row.id, username: row.username, displayName: row.display_name,
    role: row.role, status: row.status, yybRef: row.yyb_ref || "",
    createdAt: row.created_at, lastLoginAt: row.last_login_at,
  };
}

/** Durable identity, ownership and management operations share one SQLite transaction seam. */
export function createIdentityStore(filename) {
  if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','learner')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
      yyb_ref TEXT UNIQUE, created_at TEXT NOT NULL, last_login_at TEXT
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), space TEXT NOT NULL CHECK(space IN ('admin','learning')), expires INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id);
    CREATE TABLE IF NOT EXISTS study_data (
      user_id TEXT PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL,
      actor_name TEXT NOT NULL, action TEXT NOT NULL, target_name TEXT NOT NULL, detail TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  function transaction(work) {
    db.exec("BEGIN IMMEDIATE");
    try { const result = work(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  const rowFor = (id) => db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  const count = () => Number(db.prepare("SELECT COUNT(*) AS n FROM users").get().n);
  function audit(actor, action, target, detail = "") {
    db.prepare("INSERT INTO audit (at, actor_name, action, target_name, detail) VALUES (?, ?, ?, ?, ?)")
      .run(now(), actor?.displayName || actor?.username || "系统", action,
        target?.displayName || target?.username || target || "", detail);
  }
  function auditEntries(limit = 100) {
    return db.prepare("SELECT id, at, actor_name AS actorName, action, target_name AS targetName, detail FROM audit ORDER BY id DESC LIMIT ?")
      .all(limit).map((entry) => ({ ...entry, id: String(entry.id) }));
  }
  function createUser(input, actor, setup = false) {
    const username = text(input?.username, 40, "用户名");
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,39}$/.test(username))
      fail("用户名需要 3–40 位，使用字母、数字、点、下划线或短横线");
    const displayName = text(input.displayName || username, 80, "显示名称");
    const role = setup ? "admin" : input.role || "learner";
    if (!["admin", "learner"].includes(role)) fail("用户角色不正确");
    const yybRef = accountBinding(input.yybRef);
    const hash = passwordHash(input.password);
    return transaction(() => {
      if (setup && count()) fail("系统已经初始化，请使用管理员账号登录", 409);
      if (db.prepare("SELECT id FROM users WHERE username = ?").get(username)) fail("用户名已存在", 409);
      if (yybRef && db.prepare("SELECT id FROM users WHERE yyb_ref = ?").get(yybRef)) fail("该学习账号已分配给其他用户", 409);
      const id = randomUUID();
      db.prepare("INSERT INTO users (id,username,display_name,password_hash,role,yyb_ref,created_at) VALUES (?,?,?,?,?,?,?)")
        .run(id, username, displayName, hash, role, yybRef, now());
      const user = publicIdentity(rowFor(id));
      audit(actor || user, setup ? "system.setup" : "user.created", user);
      return user;
    });
  }
  function updateUser(id, input, actor) {
    return transaction(() => {
      const row = rowFor(id);
      if (!row) fail("未找到该用户", 404);
      const displayName = input.displayName === undefined ? row.display_name : text(input.displayName, 80, "显示名称");
      const role = input.role ?? row.role;
      const status = input.status ?? row.status;
      const yybRef = input.yybRef === undefined ? row.yyb_ref : accountBinding(input.yybRef);
      if (!["admin", "learner"].includes(role) || !["active", "disabled"].includes(status)) fail("角色或账号状态不正确");
      if (row.role === "admin" && row.status === "active" && (role !== "admin" || status !== "active") &&
          Number(db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND status='active'").get().n) <= 1)
        fail("至少需要保留一名启用的管理员", 409);
      if (yybRef && db.prepare("SELECT id FROM users WHERE yyb_ref = ? AND id != ?").get(yybRef, id))
        fail("该学习账号已分配给其他用户", 409);
      db.prepare("UPDATE users SET display_name=?,role=?,status=?,yyb_ref=? WHERE id=?")
        .run(displayName, role, status, yybRef, id);
      if (status === "disabled") db.prepare("DELETE FROM auth_sessions WHERE user_id=?").run(id);
      const user = publicIdentity(rowFor(id));
      audit(actor, "user.updated", user, [role !== row.role ? `角色：${role}` : "", status !== row.status ? `状态：${status}` : "", yybRef !== row.yyb_ref ? "更新学习账号分配" : ""].filter(Boolean).join("；"));
      return user;
    });
  }
  function login(username, password, space = "learning") {
    const row = typeof username === "string" && username.length <= 40
      ? db.prepare("SELECT * FROM users WHERE username=?").get(username.trim()) : null;
    // A fixed dummy derivation keeps nonexistent usernames on the same password verification path.
    const hash = row?.password_hash || `${"0".repeat(32)}:${"0".repeat(128)}`;
    if (!passwordMatches(password, hash) || !row || row.status !== "active") fail("用户名或密码不正确，或账号已停用", 401);
    if (space === "admin" && row.role !== "admin") fail("此账号没有管理空间权限", 403);
    db.prepare("UPDATE users SET last_login_at=? WHERE id=?").run(now(), row.id);
    const user = publicIdentity(rowFor(row.id));
    audit(user, "auth.login", user, space);
    return user;
  }
  function issueSession(userId, lifetime, space = "learning") {
    db.prepare("DELETE FROM auth_sessions WHERE expires <= ?").run(Date.now());
    const token = randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO auth_sessions (token_hash,user_id,space,expires) VALUES (?,?,?,?)").run(tokenHash(token), userId, space, Date.now() + lifetime);
    return token;
  }
  function sessionUser(token, space = "learning") {
    if (typeof token !== "string" || token.length > 256) return null;
    return publicIdentity(db.prepare("SELECT users.* FROM auth_sessions JOIN users ON users.id=auth_sessions.user_id WHERE token_hash=? AND expires>? AND space=? AND users.status='active'")
      .get(tokenHash(token), Date.now(), space));
  }
  function revokeSession(token) {
    if (typeof token === "string") db.prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(tokenHash(token));
  }
  function studyData(userId) {
    const row = db.prepare("SELECT data,revision FROM study_data WHERE user_id=?").get(userId);
    return row ? { data: JSON.parse(row.data), revision: row.revision } : { data: emptyStudy(), revision: 0 };
  }
  function saveStudyData(userId, input, revision) {
    const data = validateStudyData(input);
    if (!Number.isInteger(revision) || revision < 0) fail("学习记录版本不正确");
    return transaction(() => {
      const current = studyData(userId);
      if (current.revision !== revision) throw new ApiError("学习记录已在其他窗口更新，请同步后重试", 409, current);
      db.prepare("INSERT INTO study_data (user_id,data,revision) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,revision=excluded.revision")
        .run(userId, JSON.stringify(data), revision + 1);
      return { data, revision: revision + 1 };
    });
  }
  const listAnnouncements = () => db.prepare("SELECT id,title,body,created_at AS createdAt FROM announcements ORDER BY created_at DESC, id DESC").all();
  return {
    setupRequired: () => count() === 0,
    setup: (input) => createUser(input, null, true),
    createUser, updateUser, login, issueSession, sessionUser, revokeSession,
    user: (id) => publicIdentity(rowFor(id)),
    users: () => db.prepare("SELECT * FROM users ORDER BY created_at,id").all().map(publicIdentity),
    resetPassword(id, password, actor) {
      const hash = passwordHash(password);
      const user = publicIdentity(rowFor(id));
      if (!user) fail("未找到该用户", 404);
      transaction(() => {
        db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hash, id);
        db.prepare("DELETE FROM auth_sessions WHERE user_id=?").run(id);
        audit(actor, "user.password_reset", user);
      });
    },
    changePassword(userId, currentPassword, password, currentToken) {
      const row = rowFor(userId);
      if (!row || !passwordMatches(currentPassword, row.password_hash)) fail("当前密码不正确", 400);
      const hash = passwordHash(password);
      transaction(() => {
        db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hash, userId);
        db.prepare("DELETE FROM auth_sessions WHERE user_id=? AND token_hash!=?").run(userId, tokenHash(currentToken));
        const user = publicIdentity(row);
        audit(user, "auth.password_changed", user, "当前会话保留，其他登录会话已退出");
      });
    },
    studyData, saveStudyData, audit, auditEntries, listAnnouncements,
    announce(input, actor) {
      const announcement = { id: randomUUID(), title: text(input?.title, 160, "公告标题"), body: text(input?.body, 5000, "公告内容"), createdAt: now() };
      transaction(() => {
        db.prepare("INSERT INTO announcements(id,title,body,created_at) VALUES (?,?,?,?)").run(announcement.id, announcement.title, announcement.body, announcement.createdAt);
        audit(actor, "announcement.created", announcement.title);
      });
      return announcement;
    },
    deleteAnnouncement(id, actor) {
      const entry = db.prepare("SELECT title FROM announcements WHERE id=?").get(id);
      if (!entry) fail("未找到该公告", 404);
      transaction(() => {
        db.prepare("DELETE FROM announcements WHERE id=?").run(id);
        audit(actor, "announcement.deleted", entry.title);
      });
    },
    overview(connections) {
      const users = this.users();
      const active = users.filter((user) => user.status === "active");
      const linked = active.map((user) => connections.get(user.id)).filter((connection) => connection?.expires > Date.now());
      const learning = db.prepare("SELECT data FROM study_data").all().map((row) => JSON.parse(row.data));
      return {
        stats: { users: users.length, activeUsers: active.length, connectedUsers: linked.filter((item) => Object.values(item.platforms).some((platform) => platform.connected)).length,
          tasks: learning.reduce((sum, data) => sum + data.tasks.length, 0), activities: learning.reduce((sum, data) => sum + data.activities.length, 0) },
        platforms: ["math", "computer"].map((id) => ({ id, label: id === "math" ? "考研数学" : "计算机 408", connectedUsers: linked.filter((item) => item.platforms[id]?.connected).length })),
        recentAudit: auditEntries(8),
      };
    },
    close: () => db.close(),
  };
}

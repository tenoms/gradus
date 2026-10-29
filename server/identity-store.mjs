import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { ApiError } from "./upstream.mjs";
import { validateStudyData } from "../shared/study-data.mjs";
import { adminActions } from "../shared/admin-actions.mjs";
import { defaultYybSettings, publicYybSettings, updateYybSettings } from "./user-yyb.mjs";
export { validateStudyData } from "../shared/study-data.mjs";

const emptyStudy = () => ({ tasks: [], activities: [], goalMinutes: 60 });
const now = () => new Date().toISOString();
const fail = (message, status = 400) => { throw new ApiError(message, status); };
const text = (value, max, label, optional = false) => {
  if (typeof value !== "string" || value.length > max || (!optional && !value.trim()))
    fail(`${label}格式不正确`);
  return value.trim();
};
const accountBinding = (value) => value === undefined || value === null || value === "" ? null : text(value, 512, "学习账号");
function listQuery(input = {}) {
  const integer = (value, fallback, label, max = Number.MAX_SAFE_INTEGER) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max)
      fail(`${label}应为有效正整数`);
    return Number(value);
  };
  const q = input.q === undefined ? "" : text(input.q, 160, "搜索内容", true);
  return { page: integer(input.page, 1, "页码"), pageSize: integer(input.pageSize, 20, "每页条数", 100), q };
}
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
    createdAt: new Date(row.created_at).toISOString(), lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
  };
}

/** Web-owned identities and learning data never use an upstream account as their owner. */
export async function createIdentityStore(db) {
  const table = db.web;
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${table('users')} (
      id TEXT PRIMARY KEY, username TEXT NOT NULL, display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','learner')), status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
      yyb_ref TEXT, created_at TIMESTAMPTZ NOT NULL, last_login_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_username ON ${table('users')}(lower(username));
    CREATE INDEX IF NOT EXISTS users_yyb_ref ON ${table('users')}(yyb_ref);
    CREATE TABLE IF NOT EXISTS ${table('auth_sessions')} (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES ${table('users')}(id) ON DELETE CASCADE,
      space TEXT NOT NULL CHECK(space IN ('admin','learning')), expires BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_user ON ${table('auth_sessions')}(user_id);
    CREATE TABLE IF NOT EXISTS ${table('study_data')} (
      user_id TEXT PRIMARY KEY REFERENCES ${table('users')}(id) ON DELETE CASCADE, data JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS ${table('user_yyb')} (
      user_id TEXT PRIMARY KEY REFERENCES ${table('users')}(id) ON DELETE CASCADE,
      mode TEXT NOT NULL CHECK(mode IN ('system','custom')), base_url TEXT NOT NULL DEFAULT '', api_key TEXT NOT NULL DEFAULT '',
      account_ref TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS ${table('audit')} (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, at TIMESTAMPTZ NOT NULL,
      actor_name TEXT NOT NULL, action TEXT NOT NULL, target_name TEXT NOT NULL, detail TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ${table('announcements')} (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL
    );
  `);
  const one = async (sql, args) => (await db.query(sql, args)).rows[0];
  const rowFor = (id, lock = false) => one(`SELECT * FROM ${table('users')} WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id]);
  async function yybSettings(userId) {
    const row = await one(`SELECT * FROM ${table('user_yyb')} WHERE user_id=$1`, [userId]);
    return row ? { mode: row.mode, baseUrl: row.base_url, apiKey: row.api_key, ref: row.account_ref, revision: row.revision } : defaultYybSettings();
  }
  async function userValue(row) {
    const user = publicIdentity(row);
    return user ? { ...user, yyb: publicYybSettings(await yybSettings(user.id), user.yybRef) } : null;
  }
  const count = async () => Number((await one(`SELECT count(*) AS n FROM ${table('users')}`)).n);
  async function audit(actor, action, target, detail = "") {
    await db.query(`INSERT INTO ${table('audit')}(at,actor_name,action,target_name,detail) VALUES($1,$2,$3,$4,$5)`,
      [now(), actor?.displayName || actor?.username || "系统", action, target?.displayName || target?.username || target || "", detail]);
  }
  async function writeYybSettings(userId, value) {
    await db.query(`INSERT INTO ${table('user_yyb')}(user_id,mode,base_url,api_key,account_ref,revision) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(user_id) DO UPDATE SET mode=excluded.mode,base_url=excluded.base_url,api_key=excluded.api_key,account_ref=excluded.account_ref,revision=excluded.revision`,
      [userId, value.mode, value.baseUrl, value.apiKey, value.ref, value.revision]);
  }
  async function saveYybSettings(userId, input) {
    return db.transaction(async () => {
      const user = await userValue(await rowFor(userId, true));
      if (!user) fail("未找到该用户", 404);
      const value = updateYybSettings(await yybSettings(userId), input);
      await writeYybSettings(userId, value);
      await audit(user, "yyb.updated", user, value.mode === "custom" ? "使用自有 YYB 服务" : "使用系统共享学习账号");
      return publicYybSettings(value, user.yybRef);
    });
  }
  async function selectYybAccount(userId, ref) {
    return db.transaction(async () => {
      if (!await rowFor(userId, true)) fail("未找到该用户", 404);
      const value = await yybSettings(userId);
      if (value.mode !== "custom") return value;
      const selected = text(ref, 160, "学习账号");
      if (value.ref === selected) return value;
      const next = { ...value, ref: selected, revision: value.revision + 1 };
      await writeYybSettings(userId, next);
      return next;
    });
  }
  const auditSelect = 'id,at,actor_name AS "actorName",action,target_name AS "targetName",detail';
  const normalizeAt = (entry) => ({ ...entry, ...(entry.at ? { at: new Date(entry.at).toISOString() } : {}), ...(entry.createdAt ? { createdAt: new Date(entry.createdAt).toISOString() } : {}) });
  async function auditEntries(limit = 100) {
    return (await db.query(`SELECT ${auditSelect} FROM ${table('audit')} ORDER BY id DESC LIMIT $1`, [limit])).rows.map(entry => normalizeAt({ ...entry, id: String(entry.id) }));
  }
  async function pageResult(name, where, args, query, select, order) {
    const total = Number((await one(`SELECT count(*) AS n FROM ${table(name)}${where}`, args)).n);
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize)), page = Math.min(query.page, totalPages);
    const rows = (await db.query(`SELECT ${select} FROM ${table(name)}${where} ORDER BY ${order} LIMIT $${args.length + 1} OFFSET $${args.length + 2}`, [...args, query.pageSize, (page - 1) * query.pageSize])).rows;
    return { rows, pagination: { page, pageSize: query.pageSize, total, totalPages } };
  }
  async function userPage(input = {}) {
    const query = listQuery(input), clauses = [], args = [];
    for (const [field, choices] of [["role", ["admin", "learner"]], ["status", ["active", "disabled"]]]) {
      const value = input[field];
      if (value === undefined || value === "" || value === "all") continue;
      if (typeof value !== "string" || !choices.includes(value)) fail("用户筛选条件不正确");
      args.push(value); clauses.push(`${field}=$${args.length}`);
    }
    if (query.q) { args.push(query.q); clauses.push(`strpos(lower(username || ' ' || display_name || ' ' || coalesce(yyb_ref,'')),lower($${args.length}))>0`); }
    const result = await pageResult('users', clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', args, query, '*', 'created_at DESC,id DESC');
    return { users: await Promise.all(result.rows.map(userValue)), pagination: result.pagination };
  }
  async function auditPage(input = {}) {
    const query = listQuery(input), clauses = [], args = [];
    if (query.q) {
      const matching = Object.keys(adminActions).filter(action => adminActions[action].toLowerCase().includes(query.q.toLowerCase()));
      args.push(query.q); let clause = `strpos(lower(actor_name || ' ' || action || ' ' || target_name || ' ' || detail),lower($${args.length}))>0`;
      if (matching.length) { args.push(matching); clause += ` OR action=ANY($${args.length}::text[])`; }
      clauses.push(`(${clause})`);
    }
    if (input.action !== undefined && input.action !== '' && input.action !== 'all') { args.push(text(input.action, 100, '审计操作')); clauses.push(`action=$${args.length}`); }
    const result = await pageResult('audit', clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', args, query, auditSelect, 'id DESC');
    return { entries: result.rows.map(entry => normalizeAt({ ...entry, id: String(entry.id) })), pagination: result.pagination,
      actions: (await db.query(`SELECT DISTINCT action FROM ${table('audit')} ORDER BY action`)).rows.map(row => row.action) };
  }
  async function announcementPage(input = {}) {
    const query = listQuery(input);
    const result = await pageResult('announcements', query.q ? " WHERE strpos(lower(title || ' ' || body),lower($1))>0" : '', query.q ? [query.q] : [], query, 'id,title,body,created_at AS "createdAt"', 'created_at DESC,id DESC');
    return { announcements: result.rows.map(normalizeAt), pagination: result.pagination };
  }
  async function createUser(input, actor, setup = false) {
    const username = text(input?.username, 40, '用户名');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,39}$/.test(username)) fail('用户名需要 3–40 位，使用字母、数字、点、下划线或短横线');
    const displayName = text(input.displayName || username, 80, '显示名称'), role = setup ? 'admin' : input.role || 'learner';
    if (!['admin', 'learner'].includes(role)) fail('用户角色不正确');
    const yybRef = accountBinding(input.yybRef), hash = passwordHash(input.password);
    try {
      return await db.transaction(async () => {
        if (setup) {
          await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${db.webSchema}.setup`]);
          if (await count()) fail('系统已经初始化，请使用管理员账号登录', 409);
        }
        const id = randomUUID();
        await db.query(`INSERT INTO ${table('users')}(id,username,display_name,password_hash,role,yyb_ref,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)`, [id, username, displayName, hash, role, yybRef, now()]);
        const user = await userValue(await rowFor(id));
        await audit(actor || user, setup ? 'system.setup' : 'user.created', user);
        return user;
      });
    } catch (error) { if (error.code === '23505') fail('用户名已存在', 409); throw error; }
  }
  async function updateUser(id, input, actor) {
    return db.transaction(async () => {
      await db.query(`SELECT id FROM ${table('users')} WHERE role='admin' AND status='active' ORDER BY id FOR UPDATE`);
      const row = await rowFor(id, true);
      if (!row) fail('未找到该用户', 404);
      const displayName = input.displayName === undefined ? row.display_name : text(input.displayName, 80, '显示名称');
      const role = input.role ?? row.role, status = input.status ?? row.status, yybRef = input.yybRef === undefined ? row.yyb_ref : accountBinding(input.yybRef);
      if (!['admin', 'learner'].includes(role) || !['active', 'disabled'].includes(status)) fail('角色或账号状态不正确');
      if (row.role === 'admin' && row.status === 'active' && (role !== 'admin' || status !== 'active') && Number((await one(`SELECT count(*) AS n FROM ${table('users')} WHERE role='admin' AND status='active'`)).n) <= 1)
        fail('至少需要保留一名启用的管理员', 409);
      await db.query(`UPDATE ${table('users')} SET display_name=$1,role=$2,status=$3,yyb_ref=$4 WHERE id=$5`, [displayName, role, status, yybRef, id]);
      if (status === 'disabled') await db.query(`DELETE FROM ${table('auth_sessions')} WHERE user_id=$1`, [id]);
      const user = await userValue(await rowFor(id));
      await audit(actor, 'user.updated', user, [role !== row.role ? `角色：${role}` : '', status !== row.status ? `状态：${status}` : '', yybRef !== row.yyb_ref ? '更新学习账号分配' : ''].filter(Boolean).join('；'));
      return user;
    });
  }
  async function login(username, password, space = 'learning') {
    const row = typeof username === 'string' && username.length <= 40 ? await one(`SELECT * FROM ${table('users')} WHERE lower(username)=lower($1)`, [username.trim()]) : null;
    const hash = row?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`;
    if (!passwordMatches(password, hash) || !row || row.status !== 'active') fail('用户名或密码不正确，或账号已停用', 401);
    if (space === 'admin' && row.role !== 'admin') fail('此账号没有管理空间权限', 403);
    await db.query(`UPDATE ${table('users')} SET last_login_at=$1 WHERE id=$2`, [now(), row.id]);
    const user = await userValue(await rowFor(row.id)); await audit(user, 'auth.login', user, space); return user;
  }
  async function issueSession(userId, lifetime, space = 'learning') {
    await db.query(`DELETE FROM ${table('auth_sessions')} WHERE expires<=$1`, [Date.now()]);
    const token = randomBytes(32).toString('base64url');
    await db.query(`INSERT INTO ${table('auth_sessions')}(token_hash,user_id,space,expires) VALUES($1,$2,$3,$4)`, [tokenHash(token), userId, space, Date.now() + lifetime]);
    return token;
  }
  async function sessionUser(token, space = 'learning') {
    if (typeof token !== 'string' || token.length > 256) return null;
    return userValue(await one(`SELECT u.* FROM ${table('auth_sessions')} s JOIN ${table('users')} u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires>$2 AND s.space=$3 AND u.status='active'`, [tokenHash(token), Date.now(), space]));
  }
  async function revokeSession(token) { if (typeof token === 'string') await db.query(`DELETE FROM ${table('auth_sessions')} WHERE token_hash=$1`, [tokenHash(token)]); }
  async function studyData(userId) {
    const row = await one(`SELECT data,revision FROM ${table('study_data')} WHERE user_id=$1`, [userId]);
    return row ? { data: row.data, revision: row.revision } : { data: emptyStudy(), revision: 0 };
  }
  async function saveStudyData(userId, input, revision) {
    const data = validateStudyData(input);
    if (!Number.isInteger(revision) || revision < 0) fail('学习记录版本不正确');
    return db.transaction(async () => {
      if (!await rowFor(userId, true)) fail('未找到该用户', 404);
      const current = await studyData(userId);
      if (current.revision !== revision) throw new ApiError('学习记录已在其他窗口更新，请同步后重试', 409, current);
      await db.query(`INSERT INTO ${table('study_data')}(user_id,data,revision) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,revision=excluded.revision`, [userId, JSON.stringify(data), revision + 1]);
      return { data, revision: revision + 1 };
    });
  }
  const listAnnouncements = async () => (await db.query(`SELECT id,title,body,created_at AS "createdAt" FROM ${table('announcements')} ORDER BY created_at DESC,id DESC`)).rows.map(normalizeAt);
  const store = {
    setupRequired: async () => await count() === 0,
    setup: (input) => createUser(input, null, true),
    registerUser: (input) => createUser({username:input.username,displayName:input.displayName,password:input.password,role:'learner',yybRef:''}),
    createUser, updateUser, login, issueSession, sessionUser, revokeSession,
    user: async (id) => userValue(await rowFor(id)),
    users: async () => Promise.all((await db.query(`SELECT * FROM ${table('users')} ORDER BY created_at,id`)).rows.map(userValue)),
    yybSettings, saveYybSettings, selectYybAccount, userPage, auditPage, announcementPage,
    async resetPassword(id, password, actor) {
      const hash = passwordHash(password);
      return db.transaction(async () => {
        const user = await userValue(await rowFor(id, true)); if (!user) fail('未找到该用户', 404);
        await db.query(`UPDATE ${table('users')} SET password_hash=$1 WHERE id=$2`, [hash, id]);
        await db.query(`DELETE FROM ${table('auth_sessions')} WHERE user_id=$1`, [id]);
        await audit(actor, 'user.password_reset', user);
      });
    },
    async changePassword(userId, currentPassword, password, currentToken) {
      return db.transaction(async () => {
        const row = await rowFor(userId, true);
        if (!row || !passwordMatches(currentPassword, row.password_hash)) fail('当前密码不正确', 400);
        const hash = passwordHash(password);
        await db.query(`UPDATE ${table('users')} SET password_hash=$1 WHERE id=$2`, [hash, userId]);
        await db.query(`DELETE FROM ${table('auth_sessions')} WHERE user_id=$1 AND token_hash!=$2`, [userId, tokenHash(currentToken)]);
        const user = await userValue(row); await audit(user, 'auth.password_changed', user, '当前会话保留，其他登录会话已退出');
      });
    },
    studyData, saveStudyData, audit, auditEntries, listAnnouncements,
    async announce(input, actor) {
      const announcement = { id: randomUUID(), title: text(input?.title, 160, '公告标题'), body: text(input?.body, 5000, '公告内容'), createdAt: now() };
      await db.transaction(async () => {
        await db.query(`INSERT INTO ${table('announcements')}(id,title,body,created_at) VALUES($1,$2,$3,$4)`, [announcement.id, announcement.title, announcement.body, announcement.createdAt]);
        await audit(actor, 'announcement.created', announcement.title);
      }); return announcement;
    },
    async deleteAnnouncement(id, actor) {
      return db.transaction(async () => {
        const entry = await one(`DELETE FROM ${table('announcements')} WHERE id=$1 RETURNING title`, [id]);
        if (!entry) fail('未找到该公告', 404); await audit(actor, 'announcement.deleted', entry.title);
      });
    },
    async overview(connections) {
      const users = await store.users(), active = users.filter(user => user.status === 'active');
      const linked = active.map(user => connections.get(user.id)).filter(connection => connection?.expires > Date.now());
      const totals = await one(`SELECT coalesce(sum(jsonb_array_length(data->'tasks')),0) AS tasks,coalesce(sum(jsonb_array_length(data->'activities')),0) AS activities FROM ${table('study_data')}`);
      const learningUsers=Number((await one(`SELECT count(DISTINCT user_id) AS n FROM ${table('auth_sessions')} s JOIN ${table('users')} u ON u.id=s.user_id WHERE s.space='learning' AND s.expires>$1 AND u.status='active'`,[Date.now()])).n);
      return {
        stats: { users: users.length, activeUsers: active.length, learningUsers, connectedUsers: linked.filter(item => Object.values(item.platforms).some(platform => platform.connected)).length, tasks: Number(totals.tasks), activities: Number(totals.activities) },
        platforms: ['math', 'computer'].map(id => ({ id, label: id === 'math' ? '考研数学' : '计算机 408', connectedUsers: linked.filter(item => item.platforms[id]?.connected).length })),
        recentAudit: await auditEntries(8),
      };
    },
    close: async () => {},
  };
  return store;
}

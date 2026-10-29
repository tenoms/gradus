import { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, ArrowRight, Bell, Check, ChevronRight,
  CircleAlert, Clock3, KeyRound, Link2, ListChecks,
  LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, Trash2, Users, X,
} from "lucide-react";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { useDialogFocus } from "../lib/focus";
import Pagination from "../components/Pagination";
import { adminActions } from "../../shared/admin-actions.mjs";
import "./admin.css";
const OperationsConsole = lazy(() => import("./admin/OperationsConsole"));
const DataManagement = lazy(() => import("./admin/DataManagement"));
const IntegrationSettings = lazy(() => import("./admin/IntegrationSettings"));

type Role = "admin" | "learner";
interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  status: "active" | "disabled";
  yybRef?: string | null;
  yyb?: { mode: "system" | "custom"; baseUrl: string; apiKeyConfigured: boolean; ref: string };
  createdAt: string;
  lastLoginAt?: string | null;
}
interface LearningAccount { ref: string; nickname: string; status: string; serviceName?: string; routes?: { serviceName: string }[]; assignedTo?: { id: string; displayName: string } }
interface PageInfo { page: number; pageSize: number; total: number; totalPages: number }
const emptyPage: PageInfo = { page: 1, pageSize: 20, total: 0, totalPages: 1 };
interface AuditEntry {
  id: string;
  at: string;
  actorName: string;
  action: string;
  targetName?: string;
  detail?: unknown;
}
interface Announcement { id: string; title: string; body: string; createdAt: string }
interface OverviewData {
  stats: { users: number; activeUsers: number; connectedUsers: number; learningUsers: number; tasks: number; activities: number };
  platforms: { id: string; label: string; connectedUsers: number; resourceCount: number }[];
  recentAudit: AuditEntry[];
}
const actions = adminActions;
const dateTime = (value?: string | null) => {
  if (!value) return "尚无记录";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
};
const actionName = (value: string) => actions[value] || value;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "操作未完成，请稍后重试";

function useResource<T>(path: string, version = 0) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api<T>(path).then((result) => { if (active) setData(result); })
      .catch((cause) => { if (active) setError(errorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, attempt, version]);
  return { data, loading, error, reload: () => setAttempt((value) => value + 1) };
}
function ResourceState({ loading, error, retry }: { loading?: boolean; error?: string; retry: () => void }) {
  if (loading) return <div className="admin-state" role="status"><LoaderCircle className="spin" size={22} /><p>正在读取管理数据…</p></div>;
  if (error) return <div className="admin-state admin-state-error" role="alert"><CircleAlert size={25} /><p>{error}</p><button className="btn btn-secondary" onClick={retry}><RefreshCw size={15} />重新加载</button></div>;
  return null;
}
function Empty({ children, icon = <Users size={26} /> }: { children: ReactNode; icon?: ReactNode }) {
  return <div className="admin-empty">{icon}<p>{children}</p></div>;
}
function RoleBadge({ role }: { role: Role }) {
  return <span className={`admin-badge ${role === "admin" ? "admin-badge-purple" : ""}`}>{role === "admin" ? <ShieldCheck size={12} /> : <Users size={12} />}{role === "admin" ? "管理员" : "学习者"}</span>;
}
function UserYYBDetails({ user, accountName, detailed = false }: { user: AdminUser; accountName?: string; detailed?: boolean }) {
  const own = user.yyb?.mode === "custom";
  const ref = own ? user.yyb?.ref : user.yybRef;
  return <div className="admin-user-yyb">
    <span className={`admin-badge ${own ? "admin-badge-purple" : ""}`}>{own ? "自有 YYB" : "系统 YYB"}</span>
    {user.yyb?.baseUrl && <span className="admin-yyb-endpoint" title={user.yyb.baseUrl}>{own ? "" : "已保存自有地址："}{user.yyb.baseUrl}</span>}
    <span className={`admin-account-value ${ref ? "assigned" : ""}`}>{ref ? own ? `微信账号 ${ref}` : accountName || `账号 ${ref}` : own ? "自动选择可用来源" : "自动调度"}</span>
    {detailed && user.yyb?.baseUrl && <small>自有 API Key：{user.yyb.apiKeyConfigured ? "已配置" : "未配置"}</small>}
  </div>;
}
function AuditList({ entries, compact = false }: { entries: AuditEntry[]; compact?: boolean }) {
  if (!entries.length) return <Empty icon={<Clock3 size={26} />}>操作记录将在这里显示。</Empty>;
  if (compact) return <div className="admin-audit-feed">{entries.slice(0, 6).map((entry) => <div className="admin-audit-event" key={entry.id}><span className="admin-audit-marker"><Activity size={14} /></span><div><p><strong>{entry.actorName || "系统"}</strong> · {actionName(entry.action)}</p><small>{entry.targetName || "系统管理"}</small></div><time>{dateTime(entry.at)}</time></div>)}</div>;
  return <div className="admin-table-scroll"><table className="admin-table"><caption className="sr-only">系统操作审计记录</caption><thead><tr><th>操作时间</th><th>操作人</th><th>操作</th><th>对象</th><th>详情</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td className="admin-date">{dateTime(entry.at)}</td><td>{entry.actorName || "系统"}</td><td>{actionName(entry.action)}</td><td>{entry.targetName || "—"}</td><td className="admin-audit-detail">{typeof entry.detail === "string" ? entry.detail || "—" : entry.detail ? JSON.stringify(entry.detail) : "—"}</td></tr>)}</tbody></table></div>;
}
function Overview({ version }: { version: number }) {
  const resource = useResource<OverviewData>("/api/admin/overview", version);
  if (!resource.data || resource.error) return <section className="panel"><ResourceState {...resource} retry={resource.reload} /></section>;
  const { stats, platforms, recentAudit } = resource.data;
  const cards = [
    { label: "系统用户", value: stats.users, icon: Users, note: `${stats.activeUsers} 位已启用` },
    { label: "学习登录用户", value: stats.learningUsers, icon: Link2, note: "持有有效学习会话的用户" },
    { label: "学习计划", value: stats.tasks, icon: ListChecks, note: "全体用户已保存的计划" },
    { label: "学习活动", value: stats.activities, icon: Activity, note: "已保存到系统的记录" },
  ];
  return <>
    <div className="admin-metrics">{cards.map(({ label, value, icon: Icon, note }) => <section className="panel admin-metric" key={label}><div><span>{label}</span><Icon size={19} /></div><strong>{Number(value || 0).toLocaleString("zh-CN")}</strong><small>{note}</small></section>)}</div>
    <div className="admin-overview-grid">
      <section className="panel"><div className="admin-section-heading"><div><h2>学习平台</h2><p>两科学习优先使用本地资源，缺失时自动补充。</p></div><Link className="text-link" to="/users">管理分配<ArrowRight size={14} /></Link></div><div className="admin-platforms">{platforms.map((platform) => <div className="admin-platform" key={platform.id}><span className={`admin-platform-symbol ${platform.id}`}>{platform.id === "math" ? "∑" : "</>"}</span><div><strong>{platform.label}</strong><small>{platform.resourceCount} 份已保存资源</small></div><span className={`admin-badge ${platform.resourceCount ? "admin-badge-green" : ""}`}>{platform.resourceCount ? "本地可用" : "按需补充"}</span></div>)}</div><div className="admin-note"><ShieldCheck size={17} /><p>学习者只需登录 Web。系统来源或用户自有 YYB 仅用于按需补充资源，个人记录独立保存。</p></div></section>
      <section className="panel"><div className="admin-section-heading"><div><h2>管理工作</h2><p>为学习者准备好学习空间。</p></div></div><div className="admin-quick-links"><Link to="/users"><span className="admin-quick-icon"><Users size={19} /></span><span><strong>用户与账号</strong><small>创建用户、分配账号、管理权限</small></span><ArrowRight size={17} /></Link><Link to="/announcements"><span className="admin-quick-icon"><Bell size={19} /></span><span><strong>学习公告</strong><small>向所有学习者发布通知</small></span><ArrowRight size={17} /></Link><Link to="/audit"><span className="admin-quick-icon"><Activity size={19} /></span><span><strong>操作审计</strong><small>查看登录与管理操作记录</small></span><ArrowRight size={17} /></Link></div></section>
    </div>
    <section className="panel"><div className="admin-section-heading"><div><h2>最近操作</h2><p>管理动作有迹可循。</p></div><Link className="text-link" to="/audit">查看全部<ArrowRight size={14} /></Link></div><AuditList entries={recentAudit || []} compact /></section>
  </>;
}
interface UserDraft { username: string; displayName: string; password: string; role: Role; status: "active" | "disabled"; yybRef: string }
const emptyDraft: UserDraft = { username: "", displayName: "", password: "", role: "learner", status: "active", yybRef: "" };
function UserEditor({ user, accounts, accountsError, onSaved, onClose }: {
  user: AdminUser | null; users: AdminUser[]; accounts: LearningAccount[]; accountsError: string; onSaved: (message?: string) => void; onClose: () => void;
}) {
  const { session, refresh } = useSession();
  const ownId = session.user?.id;
  const [draft, setDraft] = useState<UserDraft>(user ? { ...emptyDraft, ...user, yybRef: user.yybRef || "" } : { ...emptyDraft });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");
  const set = <K extends keyof UserDraft>(key: K, value: UserDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true); setError("");
    try {
      const fields = { displayName: draft.displayName.trim(), role: draft.role, yybRef: draft.yybRef, ...(user ? { status: draft.status } : { username: draft.username.trim(), password: draft.password }) };
      await api(user ? `/api/admin/users/${encodeURIComponent(user.id)}` : "/api/admin/users", { method: user ? "PATCH" : "POST", body: JSON.stringify(fields) });
      if (user?.id === ownId) await refresh();
      onSaved();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setPending(false); }
  }
  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setPending(true); setError(""); setPasswordNotice("");
    try {
      await api(`/api/admin/users/${encodeURIComponent(user.id)}/password`, { method: "POST", body: JSON.stringify({ password: resetPassword }) });
      setResetPassword(""); setPasswordOpen(false); setPasswordNotice("密码已重置，该用户需使用新密码重新登录。");
      onSaved("密码已重置，该用户需使用新密码重新登录。");
      if (user.id === ownId) await refresh();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setPending(false); }
  }
  return <aside className="panel admin-user-editor" aria-label={user ? `编辑用户 ${user.displayName}` : "创建用户"}>
    <div className="admin-section-heading"><div><span className="admin-kicker">{user ? "用户详情" : "添加学习成员"}</span><h2>{user ? user.displayName : "创建用户"}</h2></div><button className="icon-button" onClick={onClose} disabled={pending} aria-label="关闭用户编辑"><X size={18} /></button></div>
    <form onSubmit={save}>
      <label className="field-label">登录用户名<input className="input" value={draft.username} onChange={(event) => set("username", event.target.value)} autoComplete="off" required minLength={3} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,39}" disabled={!!user || pending} placeholder="例如 learner_01" /><small>3–40 位字母、数字、点、下划线或短横线。</small></label>
      <label className="field-label">显示名称<input className="input" value={draft.displayName} onChange={(event) => set("displayName", event.target.value)} required maxLength={60} disabled={pending} placeholder="学习者的名字" /></label>
      {!user && <label className="field-label">初始密码<input className="input" type="password" value={draft.password} onChange={(event) => set("password", event.target.value)} required minLength={10} maxLength={256} autoComplete="new-password" disabled={pending} placeholder="至少 10 个字符" /><small>请将用户名和初始密码告知对应学习者。</small></label>}
      <div className="admin-field-pair"><label className="field-label">用户角色<select className="input" value={draft.role} onChange={(event) => set("role", event.target.value as Role)} disabled={pending}><option value="learner">学习者</option><option value="admin">管理员</option></select></label>{user && <label className="field-label">账号状态<select className="input" value={draft.status} onChange={(event) => set("status", event.target.value as UserDraft["status"])} disabled={pending || user.id === ownId}><option value="active">已启用</option><option value="disabled">已停用</option></select></label>}</div>
      {draft.role === "admin" && <p className="admin-inline-hint"><ShieldCheck size={14} />管理员可以管理所有用户、分配学习账号和发布公告。</p>}
      {user && <div className="admin-yyb-details"><h3>当前资源来源偏好</h3><UserYYBDetails user={user} detailed accountName={accounts.find(account => account.ref === user.yybRef)?.nickname} />{user.yyb?.mode === "custom" && <p>自有服务由该用户在个人中心维护，下面的系统账号分配可在切回系统 YYB 后使用。</p>}</div>}
      <label className="field-label">系统 YYB 来源偏好<select className="input" value={draft.yybRef} onChange={(event) => set("yybRef", event.target.value)} disabled={pending || !!accountsError}><option value="">从账号池自动调度</option>{draft.yybRef && !accounts.some((account) => account.ref === draft.yybRef) && <option value={draft.yybRef}>已分配账号 · {draft.yybRef}</option>}{accounts.map((account) => {
        return <option key={account.ref} value={account.ref}>{account.nickname || account.ref}{account.routes && account.routes.length>1 ? ` · ${account.routes.length} 条 YYB 路径` : account.serviceName ? ` · ${account.serviceName}` : ""}{account.status === "alive" ? "" : "（需检查会话）"}</option>;
      })}</select><small>{accountsError ? `账号目录暂不可用：${accountsError}` : "多个用户可共享同一账号，个人学习记录按 Web 用户独立保存。留空时使用账号池调度。"}</small></label>
      {user && user.yybRef !== draft.yybRef && <p className="admin-inline-hint"><CircleAlert size={14} />后续缺失资源将按新来源补充，已有资源和个人学习记录保留。</p>}
      {user && user.status !== draft.status && draft.status === "disabled" && <p className="admin-inline-hint admin-warning"><CircleAlert size={14} />保存后，{user.displayName} 将立即退出并无法登录。</p>}
      {error && <p className="admin-form-error" role="alert">{error}</p>}
      <div className="admin-form-actions"><button className="btn btn-primary" type="submit" disabled={pending}>{pending ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}{user ? "保存修改" : "创建用户"}</button><button className="btn btn-secondary" type="button" onClick={onClose} disabled={pending}>取消</button></div>
    </form>
    {user && <div className="admin-user-meta"><div><span>创建时间</span><time>{dateTime(user.createdAt)}</time></div><div><span>最近登录</span><time>{dateTime(user.lastLoginAt)}</time></div></div>}
    {user && <div className="admin-password-section">{passwordNotice && <p className="admin-inline-success" role="status"><Check size={15} />{passwordNotice}</p>}{passwordOpen ? <form onSubmit={changePassword}><h3>重置 {user.displayName} 的密码</h3><p>重置后，此用户的现有登录将失效。</p><label className="field-label">新密码<input type="password" className="input" required minLength={10} maxLength={256} value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} autoComplete="new-password" placeholder="至少 10 个字符" disabled={pending} /></label><div className="admin-form-actions"><button className="btn btn-primary" disabled={pending} type="submit">确认重置</button><button className="btn btn-secondary" disabled={pending} type="button" onClick={() => setPasswordOpen(false)}>取消</button></div></form> : <button className="admin-password-button" onClick={() => setPasswordOpen(true)} disabled={pending}><KeyRound size={16} />重置登录密码<ArrowRight size={14} /></button>}</div>}
  </aside>;
}
function UsersPanel({ version, notify }: { version: number; notify: (value: string) => void }) {
  const contentRef = useRef<HTMLElement>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), q: search, role, status });
  const resource = useResource<{ users: AdminUser[]; pagination: PageInfo }>(`/api/admin/users?${params}`, version);
  const accountsResource = useResource<{ accounts: LearningAccount[] }>("/api/admin/accounts", version);
  const [editor, setEditor] = useState<AdminUser | "create" | null>(null);
  const users = resource.data?.users || [];
  const pagination = resource.data?.pagination || { ...emptyPage, pageSize };
  const accounts = accountsResource.data?.accounts || [];
  const selected = editor && editor !== "create" ? editor : null;
  const filter = (update: () => void) => { update(); setPage(1); };
  return <div className={`admin-users-layout ${editor ? "has-editor" : ""}`}>
    <section className="panel admin-users-panel pagination-content" ref={contentRef}>
      <div className="admin-section-heading"><div><h2>用户与学习账号 <span className="admin-count">{pagination.total}</span></h2><p>管理成员、系统账号分配与自有 YYB 配置。</p></div><button className="btn btn-primary" onClick={() => setEditor("create")}><Plus size={15} />创建用户</button></div>
      <div className="admin-user-toolbar"><label className="admin-search"><Search size={17} /><input aria-label="搜索用户" placeholder="搜索姓名、用户名或学习账号" value={search} onChange={event => filter(() => setSearch(event.target.value))} /></label><select className="input" aria-label="按角色筛选" value={role} onChange={event => filter(() => setRole(event.target.value))}><option value="all">全部角色</option><option value="admin">管理员</option><option value="learner">学习者</option></select><select className="input" aria-label="按状态筛选" value={status} onChange={event => filter(() => setStatus(event.target.value))}><option value="all">全部状态</option><option value="active">已启用</option><option value="disabled">已停用</option></select></div>
      {resource.loading || resource.error ? <ResourceState {...resource} retry={resource.reload} /> : users.length ? <div className="admin-table-scroll"><table className="admin-table admin-users-table"><caption className="sr-only">系统用户列表</caption><thead><tr><th>用户</th><th>角色</th><th>状态</th><th>YYB 来源与账号</th><th>最近登录</th><th><span className="sr-only">管理操作</span></th></tr></thead><tbody>{users.map(user => <tr className={selected?.id === user.id ? "selected" : ""} key={user.id}><td><button className="admin-user-name" onClick={() => setEditor(user)}><span className={`admin-person-avatar ${user.role === "admin" ? "is-admin" : ""}`}>{user.displayName.slice(0, 1).toUpperCase()}</span><span><strong>{user.displayName}</strong><small>@{user.username}</small></span></button></td><td><RoleBadge role={user.role} /></td><td><span className={`admin-user-status ${user.status}`}><i />{user.status === "active" ? "已启用" : "已停用"}</span></td><td><UserYYBDetails user={user} accountName={accounts.find(account => account.ref === user.yybRef)?.nickname} /></td><td className="admin-date">{dateTime(user.lastLoginAt)}</td><td><button className="admin-row-action" onClick={() => setEditor(user)} aria-label={`管理用户 ${user.displayName}`}>管理<ChevronRight size={14} /></button></td></tr>)}</tbody></table></div> : <Empty>没有符合筛选条件的用户。</Empty>}
      <Pagination contentRef={contentRef} page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} label="用户列表" disabled={resource.loading || !!resource.error} />
      {accountsResource.error && <div className="admin-directory-error" role="status"><CircleAlert size={15} /><span>学习账号目录暂不可用。{accountsResource.error}</span><button className="text-link" onClick={accountsResource.reload}>重试</button></div>}
    </section>
    {editor && <UserEditor key={selected?.id || "create"} user={selected} users={users} accounts={accounts} accountsError={accountsResource.error || (accountsResource.loading ? "正在读取账号目录" : "")} onClose={() => setEditor(null)} onSaved={message => { notify(message || (editor === "create" ? "用户已创建，可以将登录信息交给学习者。" : "用户设置已保存。")); setPage(1); resource.reload(); accountsResource.reload(); setEditor(null); }} />}
  </div>;
}
function DeleteAnnouncement({ announcement, onClose, onDeleted }: { announcement: Announcement; onClose: () => void; onDeleted: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return <div className="modal-backdrop" onClick={() => !pending && onClose()}><section className="modal small-modal admin-delete-modal" role="dialog" aria-modal="true" aria-labelledby="announcement-delete-title" ref={ref} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.key === "Escape" && !pending && onClose()}><button className="icon-button modal-close" onClick={onClose} disabled={pending} aria-label="关闭删除确认"><X size={20} /></button><h2 id="announcement-delete-title">删除这条公告？</h2><p>“{announcement.title}”将从所有学习者的公告中移除。</p>{error && <p className="admin-form-error" role="alert">{error}</p>}<div className="admin-form-actions"><button className="btn btn-secondary" onClick={onClose} disabled={pending}>保留公告</button><button className="btn admin-btn-danger" disabled={pending} onClick={async () => { setPending(true); setError(""); try { await api(`/api/admin/announcements/${encodeURIComponent(announcement.id)}`, { method: "DELETE" }); onDeleted(); } catch (cause) { setError(errorMessage(cause)); } finally { setPending(false); } }}>{pending ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}确认删除</button></div></section></div>;
}
function AnnouncementsPanel({ version, notify }: { version: number; notify: (value: string) => void }) {
  const contentRef = useRef<HTMLElement>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), q: search });
  const resource = useResource<{ announcements: Announcement[]; pagination: PageInfo }>(`/api/admin/announcements?${params}`, version);
  const pagination = resource.data?.pagination || { ...emptyPage, pageSize };
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<Announcement>();
  async function publish(event: FormEvent) {
    event.preventDefault(); setPending(true); setError("");
    try { await api("/api/admin/announcements", { method: "POST", body: JSON.stringify({ title: title.trim(), body: body.trim() }) }); setTitle(""); setBody(""); setPage(1); resource.reload(); notify("公告已发布，学习者可以在学习概览中查看。"); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setPending(false); }
  }
  return <div className="admin-announcements-layout"><section className="panel pagination-content" ref={contentRef}><div className="admin-section-heading"><div><h2>已发布公告 <span className="admin-count">{pagination.total}</span></h2><p>公告面向所有登录用户。</p></div><Bell size={20} /></div><label className="admin-search"><Search size={17} /><input aria-label="搜索公告" placeholder="搜索公告标题或内容" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>{resource.loading || resource.error ? <ResourceState {...resource} retry={resource.reload} /> : !resource.data?.announcements.length ? <Empty icon={<Bell size={26} />}>{search ? "没有符合搜索条件的公告。" : "还没有公告。在右侧编写第一条学习通知。"}</Empty> : <div className="admin-announcement-list">{resource.data.announcements.map(announcement => <article className="admin-announcement" key={announcement.id}><div><time>{dateTime(announcement.createdAt)}</time><button className="icon-button" aria-label={`删除公告 ${announcement.title}`} onClick={() => setDeleting(announcement)}><Trash2 size={16} /></button></div><h3>{announcement.title}</h3><p>{announcement.body}</p></article>)}</div>}<Pagination contentRef={contentRef} page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} label="公告列表" disabled={resource.loading || !!resource.error} /></section><aside className="panel admin-announcement-editor"><div className="admin-section-heading"><div><span className="admin-kicker">面向全体学习者</span><h2>发布学习公告</h2></div><span className="admin-quick-icon"><Bell size={19} /></span></div><form onSubmit={publish}><label className="field-label">公告标题<input className="input" placeholder="例如：本周复习安排" value={title} onChange={event => setTitle(event.target.value)} required maxLength={120} disabled={pending} /></label><label className="field-label">公告内容<textarea className="input" rows={9} placeholder="写下学习安排、使用提示或其他通知…" value={body} onChange={event => setBody(event.target.value)} required maxLength={4000} disabled={pending} /><small>{body.length} / 4000</small></label><p className="admin-inline-hint"><Bell size={14} />发布后，公告将显示在学习者的学习概览中。</p>{error && <p className="admin-form-error" role="alert">{error}</p>}<button className="btn btn-primary" type="submit" disabled={pending || !title.trim() || !body.trim()}>{pending ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}发布公告</button></form></aside>{deleting && <DeleteAnnouncement announcement={deleting} onClose={() => setDeleting(undefined)} onDeleted={() => { setDeleting(undefined); resource.reload(); notify("公告已删除。"); }} />}</div>;
}
function AuditPanel({ version }: { version: number }) {
  const contentRef = useRef<HTMLElement>(null);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), q: search, action });
  const resource = useResource<{ entries: AuditEntry[]; pagination: PageInfo; actions: string[] }>(`/api/admin/audit?${params}`, version);
  const pagination = resource.data?.pagination || { ...emptyPage, pageSize };
  const entries = resource.data?.entries || [];
  return <section className="panel pagination-content" ref={contentRef}><div className="admin-section-heading"><h2>审计记录</h2><span className="admin-badge"><Clock3 size={13} />共 {pagination.total} 条</span></div><div className="admin-user-toolbar"><label className="admin-search"><Search size={17} /><input aria-label="搜索审计记录" placeholder="搜索操作人、对象、操作或详情" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label><select className="input admin-audit-filter" aria-label="按操作筛选" value={action} onChange={event => { setAction(event.target.value); setPage(1); }}><option value="all">全部操作</option>{(resource.data?.actions || []).map(item => <option value={item} key={item}>{actionName(item)}</option>)}</select></div>{resource.loading || resource.error ? <ResourceState {...resource} retry={resource.reload} /> : entries.length ? <AuditList entries={entries} /> : <Empty icon={<Activity size={26} />}>没有符合筛选条件的记录。</Empty>}<Pagination contentRef={contentRef} page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} label="操作审计" disabled={resource.loading || !!resource.error} /></section>;
}
export default function AdminWorkspace() {
  const { session, openLogin } = useSession();
  const user = session.user;
  const location = useLocation();
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState("");
  const section = location.pathname.split("/")[1] || "overview";
  useEffect(() => { if (!["overview", "users", "configuration", "data", "announcements", "audit", "operations"].includes(section)) navigate("/", { replace: true }); }, [section, navigate]);
  if (!session.authenticated || user?.role !== "admin") return <section className="panel admin-access-state"><span className="admin-access-icon"><ShieldCheck size={30} /></span><h1>管理工作台</h1><p>{session.authenticated ? "当前账号没有管理权限。请联系系统管理员。" : "请使用管理员账号登录，管理用户与学习空间。"}</p>{session.authenticated ? <a className="btn btn-primary" href="/learn/">返回学习空间<ArrowRight size={15} /></a> : <button className="btn btn-primary" onClick={openLogin}>登录管理账号<ArrowRight size={15} /></button>}</section>;
  const headings: Record<string, string> = { overview: "管理总览", users: "用户与学习账号", configuration: "平台集成配置", data: "账号池与资源同步", announcements: "学习公告", audit: "操作审计", operations: "运行诊断" };
  const heading = headings[section] || headings.overview;
  return <div className="admin-workspace">
    <h1 className="sr-only">{heading}</h1>
    {!["configuration", "operations", "data"].includes(section) && <div className="admin-page-tools"><button className="btn btn-secondary" onClick={() => { setVersion((value) => value + 1); setNotice(""); }}><RefreshCw size={15} />刷新数据</button></div>}
    {notice && <div className="admin-feedback" role="status"><Check size={17} /><span>{notice}</span><button className="icon-button" aria-label="关闭操作提示" onClick={() => setNotice("")}><X size={16} /></button></div>}
    {section === "data" ? <Suspense fallback={<section className="panel"><ResourceState loading retry={() => {}} /></section>}><DataManagement /></Suspense> : section === "operations" ? <Suspense fallback={<section className="panel"><ResourceState loading retry={() => {}} /></section>}><OperationsConsole /></Suspense> : section === "configuration" ? <Suspense fallback={<section className="panel"><ResourceState loading retry={() => {}} /></section>}><IntegrationSettings /></Suspense> : section === "users" ? <UsersPanel version={version} notify={setNotice} /> : section === "announcements" ? <AnnouncementsPanel version={version} notify={setNotice} /> : section === "audit" ? <AuditPanel version={version} /> : <Overview version={version} />}
  </div>;
}

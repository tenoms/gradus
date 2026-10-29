import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Database, Edit3, FileJson, LoaderCircle, RefreshCw, Search, Trash2, X } from "lucide-react";
import { api, ApiError } from "../../../shared/api/client";
import { useDialogFocus } from "../../../shared/lib/focus";
import Pagination from "../../../shared/ui/pagination/Pagination";
import "./resource-manager.css";

type ResourceScope = "public" | "account" | "volatile";
interface ResourceItem {
  sourceId: string; platform: "math" | "computer"; key: string; scope: ResourceScope; kind: string;
  path: string; command?: string; title?: string; revision: number; syncedAt: string; changedAt?: string;
  expiresAt?: string | null; expired?: boolean;
}
interface ResourceDetail extends ResourceItem { request: unknown; response: unknown }
interface PageInfo { page: number; pageSize: number; total: number; totalPages: number }
interface ResourcePage { resources: ResourceItem[]; pagination: PageInfo }
const emptyPage: PageInfo = { page: 1, pageSize: 20, total: 0, totalPages: 1 };
const scopeNames: Record<ResourceScope, string> = { public: "公共资源", account: "账号资源", volatile: "短效资源" };
const platformName = (value: string) => value === "math" ? "考研数学" : "计算机 408";
const message = (error: unknown) => error instanceof Error ? error.message : "操作失败，请重试";
const displayName = (resource: ResourceItem) => resource.title || resource.command || resource.path?.split("/").filter(Boolean).at(-1) || resource.kind || "资源";
const resourcePath = (resource: ResourceItem) => `/api/admin/resources/${encodeURIComponent(resource.platform)}/${encodeURIComponent(resource.sourceId)}/${encodeURIComponent(resource.key)}`;
const dateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
};
const expired = (resource: ResourceItem) => resource.expired === true || !resource.expiresAt || Date.parse(resource.expiresAt) <= Date.now();
const pretty = (value: unknown) => JSON.stringify(value, null, 2) ?? "null";

export default function ResourceManager({ onChanged }: { onChanged?: () => void }) {
  const contentRef = useRef<HTMLElement>(null);
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState(""), [q, setQ] = useState("");
  const [platform, setPlatform] = useState(""), [scope, setScope] = useState(""), [kind, setKind] = useState("");
  const [kindInput, setKindInput] = useState("");
  const [version, setVersion] = useState(0), [data, setData] = useState<ResourcePage>();
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [selected, setSelected] = useState<ResourceItem>();
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...(q ? { q } : {}), ...(platform ? { platform } : {}), ...(scope ? { scope } : {}), ...(kind ? { kind } : {}) }).toString();
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    api<ResourcePage>(`/api/admin/resources?${params}`).then(value => { if (active) setData(value); })
      .catch(cause => { if (active) setError(message(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params, version]);
  const pagination = data?.pagination || { ...emptyPage, pageSize };
  const reload = () => setVersion(value => value + 1);
  return <section className="panel data-card resource-manager pagination-content" ref={contentRef} aria-labelledby="resource-manager-title">
    <div className="resource-manager-heading"><div className="data-heading"><Database size={22} /><div><h2 id="resource-manager-title">资源管理 <span className="resource-total">{pagination.total}</span></h2><p>查看和维护已同步的小程序资源。公共内容由多个用户复用，个人学习记录独立保存。</p></div></div><button type="button" className="btn btn-secondary" disabled={loading} onClick={reload}><RefreshCw size={15} />刷新资源</button></div>
    <form className="resource-filters" onSubmit={event => { event.preventDefault(); setQ(search.trim()); setKind(kindInput.trim()); setPage(1); }}>
      <label className="resource-search"><Search size={16} /><input className="input" aria-label="搜索资源" placeholder="搜索资源名称、接口或命令" value={search} onChange={event => setSearch(event.target.value)} maxLength={160} /></label>
      <select className="input" aria-label="按学科筛选资源" value={platform} onChange={event => { setPlatform(event.target.value); setPage(1); }}><option value="">全部学科</option><option value="math">考研数学</option><option value="computer">计算机 408</option></select>
      <select className="input" aria-label="按共享范围筛选资源" value={scope} onChange={event => { setScope(event.target.value); setPage(1); }}><option value="">全部共享范围</option><option value="public">公共资源</option><option value="account">账号资源</option><option value="volatile">短效资源</option></select>
      <input className="input resource-kind-filter" aria-label="资源类型" placeholder="资源类型，例如 math.books" value={kindInput} onChange={event => setKindInput(event.target.value)} maxLength={100} />
      <button className="btn btn-secondary" type="submit">查询</button>
    </form>
    {error ? <div className="resource-state" role="alert"><CircleAlert size={24} /><p>{error}</p><button className="btn btn-secondary" onClick={reload}>重新读取</button></div> : loading ? <div className="resource-state" role="status"><LoaderCircle size={23} className="spin" /><p>正在读取资源目录…</p></div> : !data?.resources.length ? <div className="resource-state"><FileJson size={27} /><p>{q || platform || scope || kind ? "没有符合条件的资源。" : "暂无已同步资源，用户访问学习内容后将在这里积累。"}</p></div> : <div className="resource-table-scroll"><table className="resource-table"><caption className="sr-only">已同步资源目录</caption><thead><tr><th>资源</th><th>学科与共享范围</th><th>最近同步</th><th>有效状态</th><th>版本</th><th><span className="sr-only">管理操作</span></th></tr></thead><tbody>{data.resources.map(resource => <tr key={`${resource.platform}-${resource.sourceId}-${resource.key}`}><td><button type="button" className="resource-name" onClick={() => setSelected(resource)}>{displayName(resource)}</button><small className="resource-path" title={resource.path}>{resource.path}</small><small className="resource-kind">{resource.kind}</small></td><td><span>{platformName(resource.platform)}</span><span className={`resource-scope scope-${resource.scope}`}>{scopeNames[resource.scope] || resource.scope}</span></td><td className="resource-date">{dateTime(resource.syncedAt)}</td><td><span className={`resource-validity ${expired(resource) ? "needs-update" : ""}`}>{expired(resource) ? "访问时更新" : "可直接读取"}</span><small className="resource-date">{resource.expiresAt ? dateTime(resource.expiresAt) : "下次访问时检查"}</small></td><td>{resource.revision}</td><td><button type="button" className="text-link" onClick={() => setSelected(resource)} aria-label={`管理资源 ${displayName(resource)}`}>管理</button></td></tr>)}</tbody></table></div>}
    <Pagination contentRef={contentRef} page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} label="资源目录" disabled={loading || !!error} />
    {selected && <ResourceDialog item={selected} onClose={() => setSelected(undefined)} onChanged={() => { reload(); onChanged?.(); }} />}
  </section>;
}

function ResourceDialog({ item, onClose, onChanged }: { item: ResourceItem; onClose: () => void; onChanged: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref);
  const path = resourcePath(item);
  const [resource, setResource] = useState<ResourceDetail>();
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState(false), [conflict, setConflict] = useState(false);
  function accept(value: ResourceDetail) { setResource(value); setDraft(pretty(value.response)); setEditing(false); setConflict(false); }
  async function load() {
    setLoading(true); setError(""); setNotice("");
    try { accept(await api<ResourceDetail>(path)); } catch (cause) { setError(message(cause)); } finally { setLoading(false); }
  }
  useEffect(() => { let active = true; api<ResourceDetail>(path).then(value => { if (active) accept(value); }).catch(cause => { if (active) setError(message(cause)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [path]);
  async function change(action: "save" | "invalidate" | "delete") {
    if (!resource) return;
    setError(""); setNotice(""); setBusy(action);
    try {
      let response: unknown;
      if (action === "save") {
        try { response = JSON.parse(draft); } catch { throw new Error("资源内容不是有效的 JSON，请修正后保存。"); }
        if (!response || typeof response !== "object") throw new Error("资源内容需要为 JSON 对象或数组。");
      }
      if (action === "delete") {
        await api(path, { method: "DELETE", body: JSON.stringify({ revision: resource.revision }) });
        onChanged(); onClose(); return;
      }
      const updated = await api<ResourceDetail>(action === "invalidate" ? `${path}/invalidate` : path, { method: action === "invalidate" ? "POST" : "PATCH", body: JSON.stringify({ revision: resource.revision, ...(action === "save" ? { response } : {}) }) });
      accept(updated); onChanged();
      setNotice(action === "save" ? "资源内容已保存，后续学习将优先读取此版本。" : "已标记需更新，下次访问该资源时将向小程序请求并保存。");
    } catch (cause) { setConflict(cause instanceof ApiError && cause.status === 409); setError(message(cause)); }
    finally { setBusy(""); }
  }
  const current = resource || item;
  return <div className="modal-backdrop resource-modal-backdrop" onClick={() => !busy && onClose()}><section ref={ref} className="modal resource-dialog" role="dialog" aria-modal="true" aria-labelledby="resource-dialog-title" onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape" && !busy) onClose(); }}>
    <button type="button" className="icon-button modal-close" aria-label="关闭资源详情" onClick={onClose} disabled={!!busy}><X size={20} /></button>
    <h2 id="resource-dialog-title">{deleting ? "删除这份资源？" : displayName(current)}</h2>
    {deleting ? <><p className="resource-delete-description">将删除本系统保存的这份资源及其内容索引，下次访问时可重新从小程序读取。用户的答案、笔记、收藏和其他个人学习记录会保留。</p>{error && <div className="resource-error" role="alert"><p>{error}</p>{conflict && <button type="button" className="text-link" disabled={!!busy} onClick={() => { setDeleting(false); void load(); }}>重新读取最新资源</button>}</div>}<div className="resource-dialog-actions"><button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => { setDeleting(false); setError(""); }}>保留资源</button><button type="button" className="btn resource-danger" disabled={!!busy} onClick={() => void change("delete")}>{busy === "delete" && <LoaderCircle size={15} className="spin" />}删除资源</button></div></> : <>
      <p className="resource-dialog-description">{platformName(current.platform)} · {scopeNames[current.scope] || current.scope} · 版本 {current.revision}</p>
      {loading ? <div className="resource-state" role="status"><LoaderCircle size={22} className="spin" /><p>正在读取资源内容…</p></div> : resource && <>
        <dl className="resource-metadata"><div><dt>资源类型</dt><dd>{resource.kind}</dd></div><div><dt>最近同步</dt><dd>{dateTime(resource.syncedAt)}</dd></div><div><dt>有效期</dt><dd>{expired(resource) ? "访问时更新" : dateTime(resource.expiresAt)}</dd></div><div><dt>最近内容变更</dt><dd>{dateTime(resource.changedAt)}</dd></div><div className="resource-metadata-wide"><dt>接口</dt><dd>{resource.path}{resource.command ? ` · ${resource.command}` : ""}</dd></div></dl>
        <details className="resource-json"><summary>请求参数</summary><pre>{pretty(resource.request)}</pre></details>
        {editing ? <label className="resource-editor">资源内容（JSON）<textarea className="input" spellCheck={false} rows={20} value={draft} onChange={event => setDraft(event.target.value)} disabled={!!busy} /><small>保存会更新资源版本，并重新生成内容索引。请保持原接口响应结构。</small></label> : <details className="resource-json" open><summary>资源内容</summary><pre>{pretty(resource.response)}</pre></details>}
      </>}
      {notice && <p className="resource-notice" role="status"><Check size={16} />{notice}</p>}
      {error && <div className="resource-error" role="alert"><p>{error}</p>{(conflict || !resource) && <button type="button" className="text-link" onClick={() => void load()} disabled={!!busy}>重新读取最新资源</button>}</div>}
      {resource && !loading && <div className="resource-dialog-actions">{editing ? <><button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => { setDraft(pretty(resource.response)); setEditing(false); setError(""); }}>放弃编辑</button><button type="button" className="btn btn-primary" disabled={!!busy || draft === pretty(resource.response) || conflict} onClick={() => void change("save")}>{busy === "save" ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}保存资源内容</button></> : <><button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => { setEditing(true); setNotice(""); }}><Edit3 size={15} />编辑资源内容</button><button type="button" className="btn btn-secondary" disabled={!!busy || conflict} onClick={() => void change("invalidate")}>{busy === "invalidate" ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}标记需更新</button><button type="button" className="btn resource-danger" disabled={!!busy || conflict} onClick={() => { setDeleting(true); setError(""); setNotice(""); }}><Trash2 size={15} />删除资源</button></>}</div>}
    </>}
  </section></div>;
}

import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Clock3, Database, Download, FileJson, Layers3, Link2, LoaderCircle, RefreshCw, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { api, ApiError } from "../../../shared/api/client";
import { useDialogFocus } from "../../../shared/lib/focus";
import Pagination from "../../../shared/ui/pagination/Pagination";
import ResourceDialog from "./ResourceDialog";
import { dateTime, displayName, downloadResources, expired, message, platformName, resourceId, resourcePath, resourceSelector, scopeNames, sourceName, typeName, validityName } from "./resource-data";
import type { ResourceDetail, ResourceItem, ResourcePage } from "./resource-data";
import "./resource-manager.css";

type BatchAction = "invalidate" | "delete";
const emptyPage = { page: 1, pageSize: 20, total: 0, totalPages: 1 };
const initialFilters = { platform: "", scope: "", sourceId: "", kind: "", validity: "", sort: "synced-desc", q: "" };

export default function ResourceManager({ onChanged }: { onChanged?: () => void }) {
  const contentRef = useRef<HTMLElement>(null);
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [version, setVersion] = useState(0), [data, setData] = useState<ResourcePage>();
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [detail, setDetail] = useState<ResourceItem>();
  const [selection, setSelection] = useState<string[]>([]), [batch, setBatch] = useState<BatchAction>();
  const [exporting, setExporting] = useState(false);
  const params = new URLSearchParams({ ...filters, page: String(page), pageSize: String(pageSize) }).toString();
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setSelection([]);
    api<ResourcePage>(`/api/admin/resources?${params}`).then(value => { if (active) setData(value); })
      .catch(cause => { if (active) setError(message(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params, version]);
  const pagination = data?.pagination || { ...emptyPage, pageSize };
  const selected = data?.resources.filter(resource => selection.includes(resourceId(resource))) || [];
  const allSelected = !!data?.resources.length && selected.length === data.resources.length;
  const activeFilters = Object.entries(filters).filter(([key, value]) => value && (key !== "sort" || value !== "synced-desc")).length;
  const sources = data?.facets?.sources.filter(source => !filters.platform || source.platform === filters.platform) || [];
  function updateFilters(value: Partial<typeof filters>) { setFilters(previous => ({ ...previous, ...value })); setPage(1); setSelection([]); }
  function reload() { setSelection([]); setVersion(value => value + 1); }
  function changed(text: string) { setNotice(text); reload(); onChanged?.(); }
  async function exportSelection() {
    if (!selected.length || exporting) return;
    setExporting(true); setError(""); setNotice("");
    try {
      const resources = await Promise.all(selected.map(resource => api<ResourceDetail>(resourcePath(resource))));
      downloadResources(resources); setNotice(`已导出所选 ${resources.length} 份资源的已保存内容。`);
    } catch (cause) { setError(`导出未完成：${message(cause)}。请刷新目录后重试。`); }
    finally { setExporting(false); }
  }
  return <section className="panel data-card resource-manager pagination-content" ref={contentRef} aria-labelledby="resource-manager-title">
    <div className="resource-manager-heading"><div className="data-heading"><Database size={22} /><div><h2 id="resource-manager-title">资源管理 <span className="resource-total">{pagination.total.toLocaleString("zh-CN")}</span></h2></div></div><button type="button" className="btn btn-secondary" disabled={loading || exporting} onClick={reload}><RefreshCw size={15} />刷新目录</button></div>
    <div className="resource-statistics" aria-label="当前筛选资源统计" aria-busy={loading}>
      {[
        { label: "匹配资源", value: data?.summary?.total ?? 0, icon: Layers3 },
        { label: "有效期内", value: data?.summary?.fresh ?? 0, icon: Check },
        { label: "访问时更新", value: data?.summary?.expired ?? 0, icon: Clock3 },
        { label: "视频与附件链接", value: data?.summary?.mediaReferences ?? 0, icon: Link2 },
      ].map(({ label, value, icon: Icon }) => <div key={label}><span><Icon size={15} />{label}</span><strong>{loading ? "—" : value.toLocaleString("zh-CN")}</strong></div>)}
    </div>
    <form className="resource-filter-form" onSubmit={event => { event.preventDefault(); updateFilters({ q: search.trim() }); }}>
      <fieldset className="resource-filters" disabled={exporting}>
        <legend className="sr-only">筛选资源目录</legend>
        <div className="resource-search-row"><label className="resource-search"><Search size={17} /><input className="input" aria-label="搜索资源" placeholder="搜索课程、章节、题目或资源名称" value={search} onChange={event => setSearch(event.target.value)} maxLength={160} /></label><button className="btn btn-primary" type="submit">搜索</button></div>
        <label>学科<select className="input" aria-label="按学科筛选资源" value={filters.platform} onChange={event => updateFilters({ platform: event.target.value, sourceId: "" })}><option value="">全部学科</option><option value="math">考研数学</option><option value="computer">计算机 408</option></select></label>
        <label>共享范围<select className="input" aria-label="按共享范围筛选资源" value={filters.scope} onChange={event => updateFilters({ scope: event.target.value })}><option value="">全部共享范围</option>{Object.entries(scopeNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>资源来源<select className="input" aria-label="按来源筛选资源" value={filters.sourceId} onChange={event => updateFilters({ sourceId: event.target.value })}><option value="">全部来源</option>{sources.map(source => <option key={`${source.platform}/${source.id}`} value={source.id}>{sourceName(source)} ({source.count || 0})</option>)}</select></label>
        <label>资源类型<select className="input" aria-label="按类型筛选资源" value={filters.kind} onChange={event => updateFilters({ kind: event.target.value })}><option value="">全部类型</option>{data?.facets?.kinds.map(kind => <option key={kind.value} value={kind.value}>{typeName(kind.value, kind.label)} ({kind.count})</option>)}</select></label>
        <label>有效状态<select className="input" aria-label="按有效状态筛选资源" value={filters.validity} onChange={event => updateFilters({ validity: event.target.value })}><option value="">全部状态</option><option value="fresh">有效期内</option><option value="expired">访问时更新</option></select></label>
        <label>目录排序<select className="input" aria-label="资源排序" value={filters.sort} onChange={event => updateFilters({ sort: event.target.value })}><option value="synced-desc">最近同步优先</option><option value="synced-asc">最早同步优先</option><option value="changed-desc">最近内容变更</option><option value="title-asc">资源名称顺序</option><option value="expires-asc">待更新 / 到期优先</option></select></label>
      </fieldset>
      <div className="resource-filter-footer"><span><SlidersHorizontal size={14} />{activeFilters ? `已应用 ${activeFilters} 项条件` : "统计范围：全部资源"}</span><button type="button" className="text-link" disabled={!activeFilters || exporting} onClick={() => { setFilters(initialFilters); setSearch(""); setPage(1); setSelection([]); }}>重置条件</button></div>
    </form>
    {notice && <p className="resource-notice" role="status"><Check size={16} />{notice}</p>}
    {error && <div className="resource-error" role="alert"><p>{notice ? `操作结果已保留，目录未能刷新：${error}` : error}</p><button type="button" className="text-link" onClick={reload} disabled={loading || exporting}>重新读取目录</button></div>}
    <div className={`resource-selection-bar ${selected.length ? "has-selection" : ""}`}>
      <span>{selected.length ? <>当前页已选 <strong>{selected.length}</strong> 份资源<button type="button" className="text-link" disabled={exporting} onClick={() => setSelection([])}>清除选择</button></> : "选择当前页资源可批量维护或导出"}</span>
      <div><button type="button" className="btn btn-secondary" disabled={!selected.length || loading || exporting || !!error} onClick={() => void exportSelection()}>{exporting ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />}导出所选</button><button type="button" className="btn btn-secondary" disabled={!selected.length || loading || exporting || !!error} onClick={() => setBatch("invalidate")}><RefreshCw size={14} />标记需更新</button><button type="button" className="btn resource-danger" disabled={!selected.length || loading || exporting || !!error} onClick={() => setBatch("delete")}><Trash2 size={14} />删除所选</button></div>
    </div>
    {loading ? <div className="resource-state" role="status"><LoaderCircle size={23} className="spin" /><p>正在读取资源目录…</p></div> : error ? null : !data?.resources.length ? <div className="resource-state"><FileJson size={29} /><h3>{activeFilters ? "没有符合条件的资源" : "暂无学习资源"}</h3><p>{activeFilters ? "尝试减少筛选条件，或搜索其他名称。" : "开启自动保存后，已访问的学习资源会显示在这里。"}</p></div> : <div className="resource-table-scroll"><table className="resource-table"><caption className="sr-only">已同步资源目录</caption><thead><tr><th className="resource-checkbox"><input type="checkbox" aria-label="选择当前页全部资源" checked={allSelected} ref={node => { if (node) node.indeterminate = selected.length > 0 && !allSelected; }} disabled={exporting} onChange={event => setSelection(event.target.checked ? data.resources.map(resourceId) : [])} /></th><th>资源与来源</th><th>学科 / 范围</th><th>同步与有效期</th><th>内容统计</th><th>操作</th></tr></thead><tbody>{data.resources.map(resource => {
      const id = resourceId(resource), source = data.facets?.sources.find(value => value.id === resource.sourceId && value.platform === resource.platform);
      return <tr className={selection.includes(id) ? "is-selected" : ""} key={id}><td className="resource-checkbox"><input type="checkbox" aria-label={`选择资源 ${displayName(resource)}`} checked={selection.includes(id)} disabled={exporting} onChange={event => setSelection(value => event.target.checked ? [...value, id] : value.filter(key => key !== id))} /></td><td><button type="button" className="resource-name" disabled={exporting} onClick={() => setDetail(resource)}>{displayName(resource)}</button>{resource.subtitle && <small className="resource-subtitle">{resource.subtitle}</small>}<small className="resource-kind">{typeName(resource.kind, resource.typeLabel)}</small><small className="resource-source">{sourceName(source)}</small></td><td><span>{platformName(resource.platform)}</span><span className={`resource-scope scope-${resource.scope}`}>{scopeNames[resource.scope]}</span></td><td><span className={`resource-validity ${expired(resource) ? "needs-update" : ""}`}>{validityName(resource)}</span><small className="resource-date">同步 {dateTime(resource.syncedAt)}</small><small className="resource-date">{resource.expiresAt ? `到期 ${dateTime(resource.expiresAt)}` : "实时更新"}</small></td><td><span className="resource-index-count">{resource.entityCount || 0} 条内容</span><small className="resource-date">{resource.mediaCount || 0} 个链接</small></td><td><button type="button" className="text-link" disabled={exporting} onClick={() => setDetail(resource)} aria-label={`管理资源 ${displayName(resource)}`}>详情</button></td></tr>;
    })}</tbody></table></div>}
    <Pagination contentRef={contentRef} page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} label="资源目录" disabled={loading || exporting || !!error} />

    {detail && <ResourceDialog item={detail} onClose={() => setDetail(undefined)} onChanged={changed} />}
    {batch && <BatchDialog action={batch} resources={selected} onClose={() => setBatch(undefined)} onReload={() => { setBatch(undefined); reload(); }} onChanged={text => { setBatch(undefined); changed(text); }} />}
  </section>;
}

function BatchDialog({ action, resources, onClose, onReload, onChanged }: { action: BatchAction; resources: ResourceItem[]; onClose: () => void; onReload: () => void; onChanged: (message: string) => void }) {
  const ref = useRef<HTMLElement>(null), pendingRef = useRef(false);
  useDialogFocus(ref);
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [stale, setStale] = useState(false);
  const deleting = action === "delete";
  async function submit() {
    if (pendingRef.current || stale) return;
    pendingRef.current = true; setPending(true); setError("");
    try {
      const result = await api<{ count: number }>("/api/admin/resources/batch", { method: "POST", body: JSON.stringify({ action, resources: resources.map(resourceSelector) }) });
      onChanged(deleting ? `已删除 ${result.count} 份资源，个人学习记录保留。` : `已将 ${result.count} 份资源标记为需更新，将在下次访问时获取最新内容。`);
    } catch (cause) {
      const rejected = cause instanceof ApiError && [400, 404, 409].includes(cause.status);
      setStale(true);
      setError(rejected ? `本次操作未执行，所选资源均未更改。${message(cause)}` : `未能确认操作结果。${message(cause)}。请重新读取目录核实后再操作。`);
    }
    finally { pendingRef.current = false; setPending(false); }
  }
  return <div className="modal-backdrop resource-modal-backdrop" onClick={() => !pending && onClose()}><section className="modal resource-batch-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="resource-batch-title" onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape" && !pending) onClose(); }}>
    <button type="button" className="icon-button modal-close" aria-label="关闭批量操作确认" disabled={pending} onClick={onClose}><X size={20} /></button>
    <span className={`resource-confirm-icon ${deleting ? "danger" : ""}`}>{deleting ? <Trash2 size={23} /> : <RefreshCw size={23} />}</span><h2 id="resource-batch-title">{deleting ? "删除" : "标记更新"}所选 {resources.length} 份资源？</h2>
    <p className="resource-delete-description">{deleting ? "将删除所选资源。后续访问时可重新获取，用户的作答、笔记和收藏会保留。" : "下次访问这些资源时，将获取最新内容。"}</p>
    <ul className="resource-confirm-list">{resources.slice(0, 5).map(resource => <li key={resourceId(resource)}><span>{displayName(resource)}</span><small>{platformName(resource.platform)}</small></li>)}{resources.length > 5 && <li className="resource-confirm-more">另有 {resources.length - 5} 份资源</li>}</ul>
    <p className="resource-dialog-description">本次操作仅针对当前页所选资源。</p>
    {error && <div className="resource-error" role="alert"><p>{error}</p>{stale && <button type="button" className="text-link" onClick={onReload}>重新读取目录并选择</button>}</div>}
    <div className="resource-dialog-actions"><button type="button" className="btn btn-secondary" disabled={pending} onClick={onClose}>取消操作</button><button type="button" className={`btn ${deleting ? "resource-danger" : "btn-primary"}`} disabled={pending || stale} onClick={() => void submit()}>{pending && <LoaderCircle size={15} className="spin" />}{pending ? "正在处理…" : deleting ? "确认删除资源" : "确认标记需更新"}</button></div>
  </section></div>;
}

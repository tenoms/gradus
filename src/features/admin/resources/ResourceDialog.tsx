import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Download, Edit3, ExternalLink, FileJson, Link2, LoaderCircle, RefreshCw, Trash2, X } from "lucide-react";
import { api, ApiError } from "../../../shared/api/client";
import { useDialogFocus } from "../../../shared/lib/focus";
import { dateTime, displayName, downloadResources, entityName, message, parseResource, platformName, pretty, resourcePath, scopeNames, sourceName, typeName, validityName } from "./resource-data";
import type { ResourceDetail, ResourceItem } from "./resource-data";

type DetailView = "overview" | "content" | "request" | "media";
const views: { value: DetailView; label: string }[] = [{ value: "overview", label: "详情概览" }, { value: "content", label: "资源内容" }, { value: "request", label: "请求参数" }, { value: "media", label: "视频与附件链接" }];
function safeUrl(value: string) { try { return ["http:", "https:"].includes(new URL(value).protocol) ? value : undefined; } catch { return undefined; } }

export default function ResourceDialog({ item, onClose, onChanged }: { item: ResourceItem; onClose: () => void; onChanged: (message: string) => void }) {
  const ref = useRef<HTMLElement>(null), pendingRef = useRef(false);
  useDialogFocus(ref);
  const path = resourcePath(item);
  const [resource, setResource] = useState<ResourceDetail>();
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState(false), [closing, setClosing] = useState(false), [conflict, setConflict] = useState(false);
  const [view, setView] = useState<DetailView>("overview");
  const dirty = editing && !!resource && draft !== pretty(resource.response);
  function accept(value: ResourceDetail) { setResource(value); setDraft(pretty(value.response)); setEditing(false); setConflict(false); }
  async function load() {
    setLoading(true); setError(""); setNotice("");
    try { accept(await api<ResourceDetail>(path)); } catch (cause) { setError(message(cause)); } finally { setLoading(false); }
  }
  useEffect(() => { let active = true; api<ResourceDetail>(path).then(value => { if (active) accept(value); }).catch(cause => { if (active) setError(message(cause)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [path]);
  function requestClose() { if (pendingRef.current) return; if (dirty) setClosing(true); else onClose(); }
  async function change(action: "save" | "invalidate" | "delete") {
    if (!resource || pendingRef.current || conflict) return;
    pendingRef.current = true; setError(""); setNotice(""); setBusy(action);
    try {
      const response = action === "save" ? parseResource(draft) : undefined;
      if (action === "delete") {
        await api(path, { method: "DELETE", body: JSON.stringify({ revision: resource.revision }) });
        onChanged("资源已删除，个人学习记录保留。"); onClose(); return;
      }
      const updated = await api<ResourceDetail>(action === "invalidate" ? `${path}/invalidate` : path, { method: action === "invalidate" ? "POST" : "PATCH", body: JSON.stringify({ revision: resource.revision, ...(action === "save" ? { response } : {}) }) });
      accept(updated);
      const text = action === "save" ? resource.scope === "public" ? "资源内容已保存。" : "资源内容已保存，后续访问时仍会实时更新。" : "已标记需更新，下次访问时将获取最新内容。";
      setNotice(text); onChanged(text);
    } catch (cause) { setConflict(cause instanceof ApiError && cause.status === 409); setError(message(cause)); }
    finally { pendingRef.current = false; setBusy(""); }
  }
  const current = resource || item;
  return <div className="modal-backdrop resource-modal-backdrop" onClick={requestClose}><section ref={ref} className={`modal resource-dialog ${deleting || closing ? "resource-dialog-confirming" : ""}`} role="dialog" aria-modal="true" aria-labelledby="resource-dialog-title" onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); if (!busy) { if (closing) setClosing(false); else if (deleting) setDeleting(false); else requestClose(); } } }}>
    <button type="button" className="icon-button modal-close" aria-label="关闭资源详情" onClick={requestClose} disabled={!!busy}><X size={20} /></button>
    <h2 id="resource-dialog-title">{closing ? "放弃尚未保存的修改？" : deleting ? "删除这份资源？" : displayName(current)}</h2>
    {closing ? <><p className="resource-delete-description">资源内容还未保存。返回编辑可继续修改，放弃后保留已保存的版本。</p><div className="resource-dialog-actions"><button type="button" className="btn btn-secondary" onClick={() => setClosing(false)}>返回编辑</button><button type="button" className="btn resource-danger" onClick={onClose}>放弃修改并关闭</button></div></> : deleting ? <>
      <p className="resource-delete-description">将删除“{displayName(current)}”。后续访问时可重新获取，用户的作答、笔记和收藏会保留。</p>
      {error && <div className="resource-error" role="alert"><p>{error}</p>{conflict && <button type="button" className="text-link" disabled={!!busy} onClick={() => { setDeleting(false); void load(); }}>重新读取最新资源</button>}</div>}
      <div className="resource-dialog-actions"><button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => { setDeleting(false); setError(""); }}>保留资源</button><button type="button" className="btn resource-danger" disabled={!!busy || conflict} onClick={() => void change("delete")}>{busy === "delete" && <LoaderCircle size={15} className="spin" />}确认删除资源</button></div>
    </> : <>
      <p className="resource-dialog-description">{platformName(current.platform)} · {typeName(current.kind, current.typeLabel)} · {scopeNames[current.scope]}</p>{current.subtitle && <p className="resource-detail-subtitle">{current.subtitle}</p>}
      {loading ? <div className="resource-state" role="status"><LoaderCircle size={22} className="spin" /><p>正在读取资源内容…</p></div> : resource && <>
        <div className="resource-detail-nav" aria-label="资源详情分类">{views.map(tab => <button type="button" key={tab.value} aria-pressed={view === tab.value} className={view === tab.value ? "is-active" : ""} onClick={() => setView(tab.value)}>{tab.label}{tab.value === "media" && <span>{resource.media?.length || 0}</span>}</button>)}</div>
        {view === "overview" && <div className="resource-detail-panel">
          <dl className="resource-metadata">
            <div><dt>资源类型</dt><dd>{typeName(resource.kind, resource.typeLabel)}</dd></div><div><dt>资源状态</dt><dd>{validityName(resource)}</dd></div>
            <div><dt>最近同步</dt><dd>{dateTime(resource.syncedAt)}</dd></div><div><dt>最近内容变更</dt><dd>{dateTime(resource.changedAt)}</dd></div>
            <div><dt>资源来源</dt><dd>{sourceName(resource.source)}</dd></div><div><dt>有效期</dt><dd>{resource.expiresAt ? dateTime(resource.expiresAt) : "实时更新"}</dd></div>
          </dl>

          <section className="resource-derived"><h3><FileJson size={16} />内容统计 <span>{resource.entityCount || 0}</span></h3>{resource.entities?.length ? <div className="resource-entity-list">{resource.entities.map(entity => <span key={entity.kind}>{entityName(entity.kind)}<strong>{entity.count}</strong></span>)}</div> : <p>暂无内容统计。</p>}</section>
          <details className="resource-technical">
            <summary>技术信息</summary>
            <dl className="resource-metadata">
              <div className="resource-metadata-wide"><dt>接口路径</dt><dd className="resource-monospace">{resource.path}</dd></div>
              {resource.command && <div className="resource-metadata-wide"><dt>接口命令</dt><dd className="resource-monospace">{resource.command}</dd></div>}
              <div><dt>原始类型</dt><dd className="resource-monospace">{resource.kind}</dd></div>
              {resource.source?.accountRef && <div><dt>来源账号标识</dt><dd className="resource-monospace">{resource.source.accountRef}</dd></div>}
              <div className="resource-metadata-wide"><dt>来源哈希</dt><dd className="resource-monospace">{resource.sourceId}</dd></div>
              <div className="resource-metadata-wide"><dt>资源标识</dt><dd className="resource-monospace">{resource.key}</dd></div>
              {!!resource.entities?.length && <div className="resource-metadata-wide"><dt>原始索引类型</dt><dd className="resource-monospace">{resource.entities.map(entity => `${entity.kind} (${entity.count})`).join(" · ")}</dd></div>}
            </dl>
            {!!resource.context && Object.keys(resource.context).length > 0 && <div className="resource-json"><pre>{pretty(resource.context)}</pre></div>}
          </details>
        </div>}
        {view === "request" && <div className="resource-detail-panel"><p className="resource-inline-help">同步此资源时使用的接口与请求参数。</p><div className="resource-json"><pre>{pretty(resource.request)}</pre></div></div>}
        {view === "media" && <div className="resource-detail-panel"><p className="resource-inline-help">查看资源中的视频、附件和相关链接。</p>{resource.media?.length ? <ul className="resource-media-list">{resource.media.map(media => <li key={media.url}><Link2 size={16} /><div>{safeUrl(media.url) ? <a href={media.url} target="_blank" rel="noopener noreferrer">{media.url}<ExternalLink size={13} /></a> : <span>{media.url}</span>}<small>发现于 {dateTime(media.observedAt)}</small></div></li>)}</ul> : <div className="resource-state"><Link2 size={25} /><p>暂无相关链接。</p></div>}</div>}
        {view === "content" && <div className="resource-detail-panel">{editing ? <label className="resource-editor">资源内容（JSON）<textarea className="input" aria-label="编辑资源内容 JSON" spellCheck={false} rows={18} value={draft} onChange={event => setDraft(event.target.value)} disabled={!!busy} /><small>请保留现有内容格式。</small><button type="button" className="text-link resource-format" disabled={!!busy} onClick={() => { try { setDraft(pretty(parseResource(draft))); setError(""); } catch (cause) { setError(message(cause)); } }}>校验并格式化 JSON</button></label> : <div className="resource-json"><pre>{pretty(resource.response)}</pre></div>}</div>}
      </>}
      {notice && <p className="resource-notice" role="status"><Check size={16} />{notice}</p>}
      {error && <div className="resource-error" role="alert"><p><CircleAlert size={15} />{error}</p>{(conflict || !resource) && <button type="button" className="text-link" onClick={() => void load()} disabled={!!busy}>重新读取最新资源</button>}</div>}
      {resource && !loading && <div className="resource-dialog-actions">{editing ? <><button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => { setDraft(pretty(resource.response)); setEditing(false); setError(""); }}>放弃编辑</button><button type="button" className="btn btn-primary" disabled={!!busy || !dirty || conflict} onClick={() => void change("save")}>{busy === "save" ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}保存资源内容</button></> : <><button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => downloadResources([resource])}><Download size={15} />导出 JSON</button><button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => { setEditing(true); setView("content"); setNotice(""); }}><Edit3 size={15} />编辑内容</button>{resource.scope === "public" && <button type="button" className="btn btn-secondary" disabled={!!busy || conflict} onClick={() => void change("invalidate")}>{busy === "invalidate" ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}标记需更新</button>}<button type="button" className="btn resource-danger" disabled={!!busy || conflict} onClick={() => { setDeleting(true); setError(""); setNotice(""); }}><Trash2 size={15} />删除资源</button></>}</div>}
    </>}
  </section></div>;
}

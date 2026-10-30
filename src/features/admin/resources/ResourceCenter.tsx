import { useEffect, useState } from "react";
import { Check, CircleAlert, FolderOpen, LoaderCircle, RefreshCw } from "lucide-react";
import { api, ApiError } from "../../../shared/api/client";
import SettingSwitch from "../../../shared/ui/setting-switch/SettingSwitch";
import ResourceManager from "./ResourceManager";
import "../data/data-management.css";
import "./resource-center.css";

type SyncState = {
  settings: { enabled: boolean; revision: number; refreshAfterDays: number };
  resources: { total: number; byPlatform: Record<string, number>; mediaReferences: number; lastSyncedAt?: string | null };
  sources?: { id: string; platform: string; accountRef: string }[];
  lastCapturedAt?: string | null;
  lastError?: string;
};
const message = (cause: unknown) => cause instanceof Error ? cause.message : "操作失败，请重试";
const syncTime = (value?: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "暂无更新记录";

export default function ResourceCenter() {
  const [sync, setSync] = useState<SyncState>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshDays, setRefreshDays] = useState("30");
  const [version, setVersion] = useState(0);
  function accept(value: SyncState) { setSync(value); setRefreshDays(String(value.settings.refreshAfterDays)); }
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    api<SyncState>("/api/admin/resource-sync").then(value => { if (active) accept(value); })
      .catch(cause => { if (active) setError(`更新状态读取失败：${message(cause)}`); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);
  const refresh = () => setVersion(value => value + 1);
  async function saveSettings(changes: { enabled?: boolean; refreshAfterDays?: number }) {
    if (!sync || pending || loading) return;
    setPending(true); setError(""); setNotice("");
    try {
      const value = await api<SyncState>("/api/admin/resource-sync", { method: "PUT", body: JSON.stringify({ enabled: changes.enabled ?? sync.settings.enabled, refreshAfterDays: changes.refreshAfterDays ?? sync.settings.refreshAfterDays, revision: sync.settings.revision }) });
      accept(value);
      setNotice(changes.refreshAfterDays !== undefined ? `已保存复核期限：${value.settings.refreshAfterDays} 天。已有公共资源始终可读。` : value.settings.enabled ? "已开启资源渐进式同步。" : "已关闭资源渐进式同步，已有公共资源仍可使用，不再后台更新或自动保存。");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        try { accept(await api<SyncState>("/api/admin/resource-sync")); setError("更新设置已在其他页面更新，已读取最新状态，请确认后再操作。"); }
        catch { setError("更新设置未保存，最新状态读取失败，请刷新后重试。"); }
      } else setError(`更新设置未保存：${message(cause)}`);
    } finally { setPending(false); }
  }
  function saveRefreshDays() {
    const days = Number(refreshDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) { setError("复核期限需为 1–3650 天的整数。"); return; }
    void saveSettings({ refreshAfterDays: days });
  }
  const lastSyncedAt = sync?.resources.lastSyncedAt || sync?.lastCapturedAt;
  return <div className="resource-center">
    <header className="resource-center-intro"><span className="resource-center-icon"><FolderOpen size={25} /></span><div><h2>资源中心</h2><p>统一维护考研数学与计算机 408 的学习资源。</p></div></header>
    <section className="panel data-card resource-sync-card" aria-labelledby="resource-sync-title">
      <div className="resource-sync-heading"><h2 id="resource-sync-title">资源渐进式同步</h2><button className="btn btn-secondary admin-inline-refresh" aria-label="刷新状态" title="刷新资源同步状态与统计" aria-busy={loading} disabled={loading || pending} onClick={refresh}><RefreshCw size={15} className={loading ? "spin" : ""} /><span>刷新状态</span></button></div>
      {loading && !sync && <p className="resource-sync-loading" role="status"><LoaderCircle className="spin" size={18} />正在读取更新状态…</p>}
      {error && <div className="error-banner" role="alert"><CircleAlert size={17} /><span>{error}</span><button className="text-link" disabled={loading || pending} onClick={refresh}>重试</button></div>}
      {notice && <p className="notice" role="status"><Check size={16} />{notice}</p>}
      {sync && <>
        <SettingSwitch label="启用渐进式同步" description="随学习者访问，逐步保存资源，并在需要复核时尝试后台更新。" checked={sync.settings.enabled} pending={pending} disabled={loading || pending} onChange={enabled => { void saveSettings({ enabled }); }} />
        <p className="resource-sync-description">已保存的公共资源长期从本地读取。超过复核期限后，访问时仍立即返回本地内容，并尝试后台更新；YYB 不可用不影响已有内容，仅缺失资源需要从来源获取。</p>
        <form className="resource-refresh-settings" onSubmit={event => { event.preventDefault(); saveRefreshDays(); }}>
          <label htmlFor="resource-refresh-days">公共资源复核期限<span><input id="resource-refresh-days" className="input" type="number" min={1} max={3650} step={1} required value={refreshDays} disabled={loading || pending} onChange={event => setRefreshDays(event.target.value)} aria-describedby="resource-refresh-help" />天</span></label>
          <button className="btn btn-secondary" type="submit" disabled={loading || pending || Number(refreshDays) === sync.settings.refreshAfterDays}>{pending ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}保存期限</button>
          <p id="resource-refresh-help">默认 30 天，可设置 1–3650 天。复核期限只决定何时建议更新，不影响本地内容使用。关闭同步后不后台更新或自动保存。</p>
        </form>
        <dl className="resource-center-stats" aria-label="全部资源统计">
          <div><dt>全部资源</dt><dd>{sync.resources.total.toLocaleString("zh-CN")}</dd></div>
          <div><dt>考研数学</dt><dd>{(sync.resources.byPlatform.math || 0).toLocaleString("zh-CN")}</dd></div>
          <div><dt>计算机 408</dt><dd>{(sync.resources.byPlatform.computer || 0).toLocaleString("zh-CN")}</dd></div>
          <div><dt>资源来源</dt><dd>{sync.sources?.length || 0}</dd></div>
          <div><dt>视频与附件链接</dt><dd>{sync.resources.mediaReferences.toLocaleString("zh-CN")}</dd></div>
        </dl>
        <p className="resource-sync-last">最近更新：{lastSyncedAt ? <time dateTime={lastSyncedAt}>{syncTime(lastSyncedAt)}</time> : "暂无更新记录"}{loading && <span role="status"> · 更新统计中…</span>}</p>
        {sync.lastError && <p className="data-sync-error" role="status">最近一次资源更新未完成：{sync.lastError}。已有公共内容仍可使用，开启同步时后续访问会重新尝试。</p>}
      </>}
    </section>
    <ResourceManager onChanged={refresh} />
  </div>;
}

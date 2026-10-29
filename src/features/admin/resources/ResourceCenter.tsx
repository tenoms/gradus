import { useEffect, useState } from "react";
import { Check, CircleAlert, FolderOpen, LoaderCircle, RefreshCw } from "lucide-react";
import { api, ApiError } from "../../../shared/api/client";
import SettingSwitch from "../../../shared/ui/setting-switch/SettingSwitch";
import ResourceManager from "./ResourceManager";
import "../data/data-management.css";
import "./resource-center.css";

type SyncState = {
  settings: { enabled: boolean; revision: number };
  resources: { total: number; byPlatform: Record<string, number>; mediaReferences: number; lastSyncedAt?: string | null };
  sources?: { id: string; platform: string; accountRef: string }[];
  lastCapturedAt?: string | null;
  lastError?: string;
};
const message = (cause: unknown) => cause instanceof Error ? cause.message : "操作失败，请重试";
const syncTime = (value?: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "暂无同步记录";

export default function ResourceCenter() {
  const [sync, setSync] = useState<SyncState>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    api<SyncState>("/api/admin/resource-sync").then(value => { if (active) setSync(value); })
      .catch(cause => { if (active) setError(`同步状态读取失败：${message(cause)}`); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);
  const refresh = () => setVersion(value => value + 1);
  async function toggleSync(enabled: boolean) {
    if (!sync || pending || loading) return;
    setPending(true); setError(""); setNotice("");
    try {
      const value = await api<SyncState>("/api/admin/resource-sync", { method: "PUT", body: JSON.stringify({ enabled, revision: sync.settings.revision }) });
      setSync(value);
      setNotice(value.settings.enabled ? "已开启资源同步，后续学习访问的资源将逐步保存。" : "已关闭新增和更新资源的自动保存，现有资源和个人学习记录继续保留。");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        try { setSync(await api<SyncState>("/api/admin/resource-sync")); setError("同步设置已在其他页面更新，已读取最新状态，请确认后再操作。"); }
        catch { setError("同步设置未保存，最新状态读取失败，请刷新后重试。"); }
      } else setError(`同步设置未保存：${message(cause)}`);
    } finally { setPending(false); }
  }
  const lastSyncedAt = sync?.resources.lastSyncedAt || sync?.lastCapturedAt;
  return <div className="resource-center">
    <header className="resource-center-intro"><span className="resource-center-icon"><FolderOpen size={25} /></span><div><h2>资源中心</h2><p>统一维护考研数学与计算机 408 的学习资源。</p></div></header>
    <section className="panel data-card resource-sync-card" aria-labelledby="resource-sync-title">
      <div className="resource-sync-heading"><div><h2 id="resource-sync-title">小程序资源渐进同步</h2><p>公共内容优先读取有效缓存，缺失或需更新时向小程序获取。资源随实际学习逐步积累。</p></div><button className="btn btn-secondary" disabled={loading || pending} onClick={refresh}><RefreshCw size={15} />刷新状态</button></div>
      {loading && !sync && <p className="resource-sync-loading" role="status"><LoaderCircle className="spin" size={18} />正在读取同步状态…</p>}
      {error && <div className="error-banner" role="alert"><CircleAlert size={17} /><span>{error}</span><button className="text-link" disabled={loading || pending} onClick={refresh}>重试</button></div>}
      {notice && <p className="notice" role="status"><Check size={16} />{notice}</p>}
      {sync && <>
        <SettingSwitch label="启用学习过程资源同步" description="立即保存设置，不影响个人记录与导入。" checked={sync.settings.enabled} pending={pending} disabled={loading || pending} onChange={value => { void toggleSync(value); }} />
        <dl className="resource-center-stats" aria-label="全库资源统计">
          <div><dt>全库资源</dt><dd>{sync.resources.total.toLocaleString("zh-CN")}</dd></div>
          <div><dt>考研数学</dt><dd>{(sync.resources.byPlatform.math || 0).toLocaleString("zh-CN")}</dd></div>
          <div><dt>计算机 408</dt><dd>{(sync.resources.byPlatform.computer || 0).toLocaleString("zh-CN")}</dd></div>
          <div><dt>资源来源</dt><dd>{sync.sources?.length || 0}</dd></div>
          <div><dt>媒体 / 链接引用</dt><dd>{sync.resources.mediaReferences.toLocaleString("zh-CN")}</dd></div>
        </dl>
        <p className="resource-sync-last">最近同步：{lastSyncedAt ? <time dateTime={lastSyncedAt}>{syncTime(lastSyncedAt)}</time> : "暂无同步记录"}{loading && <span role="status"> · 更新统计中…</span>}</p>
        {sync.lastError && <p className="data-sync-error" role="status">最近一次资源保存未完成：{sync.lastError}。后续访问时会重新尝试。</p>}
      </>}
    </section>
    <ResourceManager onChanged={refresh} />
  </div>;
}

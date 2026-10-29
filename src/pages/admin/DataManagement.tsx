import { useEffect, useState } from "react";
import { Check, CircleAlert, Database, LoaderCircle, RefreshCw, Save, Users } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import SettingSwitch from "../../components/SettingSwitch";
import "./data-management.css";
import ResourceManager from "./ResourceManager";
import YybServices from "./YybServices";
import RegistrationSettings from "./RegistrationSettings";

type AccountPool = { initialized?: boolean; revision: number; algorithm: "round_robin" | "least_loaded" | "sticky"; enabledRefs: string[]; issues?:{serviceId:string;serviceName:string;message:string}[]; accounts: { ref: string; nickname?: string; status?: string; activeUsers?: number;openid?:string;serviceName?:string;routes?:{serviceId:string;serviceName:string;rawRef:string;status:string}[] }[] };
type SyncSettings = { enabled: boolean; revision: number; updatedAt?: string };
type SyncState = {
  mode: "learning";
  settings: SyncSettings;
  resources: { total: number; byPlatform: Record<string, number>; mediaReferences: number; lastSyncedAt?: string | null };
  sources?: { id: string; platform: string; accountRef: string }[];
  lastCapturedAt?: string | null;
  lastError?: string;
};
const message = (error: unknown) => error instanceof Error ? error.message : "操作失败，请重试";

export default function DataManagement() {
  const [pool, setPool] = useState<AccountPool>();
  const [algorithm, setAlgorithm] = useState<AccountPool["algorithm"]>("round_robin");
  const [refs, setRefs] = useState<string[]>([]);
  const [sync, setSync] = useState<SyncState>();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [syncError,setSyncError] = useState("");
  const [syncNotice,setSyncNotice] = useState("");
  function acceptPool(value: AccountPool) { setPool(value); setAlgorithm(value.algorithm); setRefs(value.enabledRefs); }
  function acceptSync(value: SyncState) { setSync(value); setEnabled(value.settings.enabled); }
  async function action(name: string, work: () => Promise<void>) {
    setBusy(name); setError(""); setNotice("");
    try { await work(); } catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }
  async function load() {
    setSyncError("");setSyncNotice("");
    await action("load", async () => {
      const results = await Promise.allSettled([api<AccountPool>("/api/admin/account-pool"), api<SyncState>("/api/admin/resource-sync")]);
      for (const [i, result] of results.entries()) {
        if (result.status === "rejected") { setError(message(result.reason)); continue; }
        if (i === 0) acceptPool(result.value as AccountPool); else acceptSync(result.value as SyncState);
      }
    });
  }
  useEffect(() => { void load(); }, []);
  async function toggleSync(enabled: boolean) {
    if(!sync || busy)return;
    const previous=sync;
    setEnabled(enabled);setBusy("sync");setSyncError("");setSyncNotice("");
    try {
      const value=await api<SyncState>("/api/admin/resource-sync",{method:"PUT",body:JSON.stringify({enabled,revision:previous.settings.revision})});
      acceptSync(value);
      setSyncNotice(value.settings.enabled?"已开启资源同步，后续学习访问的资源将逐步保存。":"资源同步已关闭，已有资源保留，个人学习记录继续保存。");
    }catch(cause){
      setEnabled(previous.settings.enabled);
      if(cause instanceof ApiError && cause.status===409) {
        try{acceptSync(await api<SyncState>("/api/admin/resource-sync"));setSyncError("资源同步设置已在其他页面更新，已读取最新状态。");}
        catch{setSyncError("未能保存，已恢复原状态。请刷新后重试。");}
      }else setSyncError(`未能保存，已恢复原状态：${message(cause)}`);
    }finally{setBusy("");}
  }
  return <div className="data-management">
    <div className="data-toolbar"><p>共享学习资源，按 Web 用户保存个人学习记录。</p><button className="btn btn-secondary" disabled={!!busy} onClick={() => void load()}><RefreshCw size={15} />刷新</button></div>
    {error && <div className="error-banner" role="alert"><CircleAlert size={17} />{error}</div>}
    {notice && <p className="notice" role="status"><Check size={16} />{notice}</p>}
    {busy === "load" && !pool && !sync && <p role="status"><LoaderCircle size={18} className="spin" />正在读取数据配置…</p>}
    <RegistrationSettings />
    <YybServices onChanged={async()=>{acceptPool(await api<AccountPool>("/api/admin/account-pool"));}} />
    <section className="panel data-card">
      <div className="data-heading"><Users size={22} /><div><h2>系统 YYB 账号池</h2><p>多个用户可同时使用同一微信账号。跨服务相同 openid 只占一份调度权重与负载，可在多条访问路径间替代。</p></div></div>
      {pool?.issues?.map(issue=><p key={issue.serviceId} className="data-sync-error" role="status">{issue.serviceName}：{issue.message}。其他可用服务仍可提供资源。</p>)}
      {pool && <form onSubmit={event => { event.preventDefault(); void action("pool", async () => {
        acceptPool(await api<AccountPool>("/api/admin/account-pool", { method: "PUT", body: JSON.stringify({ revision: pool.revision, algorithm, enabledRefs: refs }) }));
        setNotice("账号池已保存，后续资源请求将使用新的调度策略。");
      }); }}>
        <label className="field-label">调度算法<select className="input" value={algorithm} onChange={event => setAlgorithm(event.target.value as AccountPool["algorithm"])} disabled={!!busy}><option value="round_robin">轮询 · 依次分配账号</option><option value="least_loaded">最少分配 · 优先低负载账号</option><option value="sticky">稳定分配 · 尽量复用同一账号</option></select></label>
        <fieldset className="data-accounts" disabled={!!busy}><legend>参与自动调度的账号</legend>{pool.accounts.length ? pool.accounts.map(account => <label key={account.ref}><input type="checkbox" checked={refs.includes(account.ref)} onChange={event => setRefs(value => event.target.checked ? [...value, account.ref] : value.filter(ref => ref !== account.ref))} /><span><strong>{account.nickname || "微信学习账号"}</strong><small>{account.openid?`微信 ${account.openid.slice(0,6)}…${account.openid.slice(-4)}`:account.ref} · {account.status === "alive" ? "会话可用" : "会话待检查"}{account.activeUsers !== undefined ? ` · ${account.activeUsers} 位分配用户` : ""}</small><small>{account.routes?.map(route=>route.serviceName).join(" / ")||account.serviceName}{account.routes&&account.routes.length>1?` · ${account.routes.length} 条访问路径`:""}</small></span></label>) : <p className="muted">暂无可用账号，请添加或检测上方 YYB 服务。</p>}</fieldset>
        {!refs.length && <p className="muted">当前未启用自动调度账号。</p>}
        <button className="btn btn-primary" disabled={!!busy || (pool.initialized !== false && algorithm === pool.algorithm && JSON.stringify(refs.slice().sort()) === JSON.stringify(pool.enabledRefs.slice().sort()))}>{busy === "pool" ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}保存账号池</button>
      </form>}
    </section>
    <section className="panel data-card">
      <div className="data-heading"><Database size={22} /><div><h2>小程序资源渐进同步</h2><p>学习优先读取 PostgreSQL 中的有效资源；缺失或需要更新时，再向小程序请求并保存。</p></div></div>
      {sync && <>
        <SettingSwitch label="启用学习过程资源同步" description="切换后立即保存。关闭后已有资源仍可学习，个人记录继续独立保存。" checked={enabled} pending={busy==="sync"} disabled={!!busy} onChange={value=>{void toggleSync(value);}} />
        {syncError && <p className="error-banner" role="alert"><CircleAlert size={17}/>{syncError}</p>}
        {syncNotice && <p className="notice" role="status"><Check size={16}/>{syncNotice}</p>}
        <SyncSummary state={sync} />
      </>}
    </section>
    <ResourceManager onChanged={() => { void api<SyncState>("/api/admin/resource-sync").then(setSync).catch(cause => setError(`资源统计刷新失败：${message(cause)}`)); }} />
  </div>;
}

function SyncSummary({ state }: { state: SyncState }) {
  const lastSyncedAt = state.resources.lastSyncedAt || state.lastCapturedAt;
  const lastSyncDate = lastSyncedAt ? new Date(lastSyncedAt) : null;
  const lastSyncLabel = lastSyncDate && !Number.isNaN(lastSyncDate.getTime())
    ? lastSyncDate.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })
    : "暂无同步记录";
  return <div className="data-sync-summary" aria-live="polite">
    <dl className="data-sync-stats">
      <div><dt>已保存资源</dt><dd>{state.resources.total}</dd></div>
      <div><dt>考研数学</dt><dd>{state.resources.byPlatform.math || 0}</dd></div>
      <div><dt>计算机 408</dt><dd>{state.resources.byPlatform.computer || 0}</dd></div>
      <div><dt>资源来源</dt><dd>{state.sources?.length || 0}</dd></div>
      <div><dt>媒体引用</dt><dd>{state.resources.mediaReferences}</dd></div>
    </dl>
    <p>最近同步：{lastSyncedAt && lastSyncDate && !Number.isNaN(lastSyncDate.getTime()) ? <time dateTime={lastSyncedAt}>{lastSyncLabel}</time> : lastSyncLabel}</p>
    {!state.resources.total && <p>还没有保存资源。开启后，资源会随用户的正常学习逐步积累。</p>}
    <p className="data-sync-help">公共内容供多个用户复用，个人学习记录按 Web 用户隔离。资源随实际学习访问逐渐积累。</p>
    {state.lastError && <p className="data-sync-error" role="status">最近一次资源保存未完成：{state.lastError}。学习可继续，后续访问时会重新保存。</p>}
  </div>;
}

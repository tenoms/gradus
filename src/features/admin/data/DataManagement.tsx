import { useEffect, useState } from "react";
import { Check, CircleAlert, LoaderCircle, RefreshCw, Save, Users } from "lucide-react";
import { api } from "../../../shared/api/client";
import "./data-management.css";
import YybServices from "../integrations/YybServices";
import RegistrationSettings from "../users/RegistrationSettings";

type AccountPool = { initialized?: boolean; revision: number; algorithm: "round_robin" | "least_loaded" | "sticky"; enabledRefs: string[]; issues?:{serviceId:string;serviceName:string;message:string}[]; accounts: { ref: string; nickname?: string; status?: string; activeUsers?: number;openid?:string;serviceName?:string;routes?:{serviceId:string;serviceName:string;rawRef:string;status:string}[] }[] };
const message = (error: unknown) => error instanceof Error ? error.message : "操作失败，请重试";

export default function DataManagement() {
  const [pool, setPool] = useState<AccountPool>();
  const [algorithm, setAlgorithm] = useState<AccountPool["algorithm"]>("round_robin");
  const [refs, setRefs] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  function acceptPool(value: AccountPool) { setPool(value); setAlgorithm(value.algorithm); setRefs(value.enabledRefs); }
  async function action(name: string, work: () => Promise<void>) {
    setBusy(name); setError(""); setNotice("");
    try { await work(); } catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }
  async function load() {
    await action("load", async () => acceptPool(await api<AccountPool>("/api/admin/account-pool")));
  }
  useEffect(() => { void load(); }, []);
  return <div className="data-management">
    {error && <div className="error-banner" role="alert"><CircleAlert size={17} />{error}</div>}
    {notice && <p className="notice" role="status"><Check size={16} />{notice}</p>}
    {busy === "load" && !pool && <p role="status"><LoaderCircle size={18} className="spin" />正在读取数据配置…</p>}
    <RegistrationSettings />
    <YybServices onChanged={async()=>{acceptPool(await api<AccountPool>("/api/admin/account-pool"));}} />
    <section className="panel data-card">
      <div className="data-heading data-pool-heading"><Users size={22} /><h2>系统 YYB 账号池</h2><button className="btn btn-secondary admin-inline-refresh" disabled={!!busy} aria-busy={busy === "load"} aria-label="刷新账号池" title="重新读取系统 YYB 账号池" onClick={() => void load()}><RefreshCw size={15} className={busy === "load" ? "spin" : ""} /><span>刷新</span></button><p>多个用户可同时使用同一微信账号。跨服务相同 openid 只占一份调度权重与负载，可在多条访问路径间替代。</p></div>
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
  </div>;
}

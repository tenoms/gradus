import { useEffect, useState } from "react";
import { CheckCheck, CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import { api } from "../../lib/api";
import { useSession } from "../../lib/session";

type YybSettings = { mode: "system" | "custom"; baseUrl: string; apiKeyConfigured: boolean; ref: string };
type Account = { ref: string; nickname?: string; status?: string };

export default function AccountConnection() {
  const { session, refresh } = useSession();
  const [configuration, setConfiguration] = useState<YybSettings>();
  const [mode, setMode] = useState<"system" | "custom">("system");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function accept(value: YybSettings) {
    setConfiguration(value); setMode(value.mode); setBaseUrl(value.baseUrl || ""); setApiKey(""); setClearApiKey(false);
  }
  async function loadAccounts(preferred = configuration?.ref) {
    const result = await api<{ accounts: Account[] }>("/api/auth/accounts");
    const list = result.accounts || [];
    setAccounts(list);
    setSelected(list.some(row => row.ref === preferred) ? preferred || "" : list.find(row => row.status === "alive")?.ref || list[0]?.ref || "");
  }
  async function load() {
    setLoading(true); setError("");
    try {
      const value = await api<YybSettings>("/api/learning/account/yyb");
      accept(value);
      await loadAccounts(value.ref);
    } catch (error) { setError((error as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const value = await api<YybSettings>("/api/learning/account/yyb", { method: "PUT", body: JSON.stringify({ mode, baseUrl, ...(apiKey ? { apiKey } : {}), ...(clearApiKey ? { clearApiKey: true } : {}) }) });
      accept(value); setAccounts([]); setSelected("");
      await refresh();
      setNotice("连接来源已保存，请选择账号并连接学习平台。");
      await loadAccounts(value.ref);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function connect() {
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/auth/connect", { method: "POST", body: JSON.stringify({ ref: selected }) });
      await refresh(); setConfiguration(value => value ? { ...value, ref: selected } : value); setNotice("学习账号已连接。");
    } catch (error) { setError((error as Error).message); await refresh(); }
    finally { setBusy(false); }
  }
  const changed = configuration && (mode !== configuration.mode || baseUrl !== configuration.baseUrl || !!apiKey || clearApiKey);
  return <div className="personal-connection">
    <section className="panel settings-panel">
      <h2>YYB 连接来源</h2>
      <p className="muted">使用系统分配的账号，或接入自己的 YYB 服务。</p>
      {loading && <p role="status"><LoaderCircle size={16} className="spin" />正在读取连接设置…</p>}
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="personal-form-grid">
          <label>账号来源<select className="input" value={mode} onChange={event => setMode(event.target.value as "system" | "custom")} disabled={busy || loading}><option value="system">系统分配</option><option value="custom">自己的 YYB</option></select></label>
          {mode === "custom" && <>
            <label>YYB 服务地址<input className="input" type="url" required placeholder="http://你的 YYB 地址:端口" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} disabled={busy} /></label>
            <label>API Key（可选）<input className="input" type="password" autoComplete="off" placeholder={configuration?.apiKeyConfigured && baseUrl === configuration.baseUrl ? "已保存，留空保留" : "服务要求认证时填写"} value={apiKey} onChange={event => { setApiKey(event.target.value); setClearApiKey(false); }} disabled={busy} /></label>
          </>}
        </div>
        {mode === "system" && <p className="muted">使用管理员分配给当前账号的 YYB 学习身份。</p>}
        {mode === "custom" && configuration?.apiKeyConfigured && <label className="personal-key-clear"><input type="checkbox" checked={clearApiKey} onChange={event => { setClearApiKey(event.target.checked); if (event.target.checked) setApiKey(""); }} disabled={busy} />清除已保存的 API Key</label>}
        {mode === "custom" && configuration?.apiKeyConfigured && baseUrl !== configuration.baseUrl && <p className="muted">更换服务地址后，需要时请重新填写 API Key。</p>}
        <button className="btn btn-primary" disabled={busy || loading || !changed}>{busy ? <LoaderCircle className="spin" size={16} /> : <CheckCheck size={16} />}保存连接来源</button>
      </form>
    </section>
    <section className="panel settings-panel">
      <div className="personal-section-heading"><h2>学习账号</h2><button className="btn btn-secondary" disabled={busy || loading || !!changed} onClick={() => { setError(""); void loadAccounts().catch(error => setError(error.message)); }}><RefreshCw size={14} />刷新账号</button></div>
      {changed && <p className="muted">先保存连接来源，再读取该服务的账号。</p>}
      <label className="personal-account-select">选择学习账号<select className="input" value={selected} onChange={event => setSelected(event.target.value)} disabled={busy || loading || !!changed || !accounts.length}><option value="" disabled>{accounts.length ? "请选择账号" : configuration?.mode === "custom" ? "该服务暂无可用账号" : "尚未分配账号"}</option>{accounts.map(account => <option key={account.ref} value={account.ref}>{account.nickname || "微信学习账号"}{account.status !== "alive" ? "（会话状态待确认）" : ""}</option>)}</select></label>
      <div className="personal-platform-status">{(["math", "computer"] as const).map(platform => <div key={platform}><strong>{platform === "math" ? "考研数学" : "计算机 408"}</strong><span className={`pill ${session.platforms[platform]?.connected ? "success" : ""}`}>{session.platforms[platform]?.connected ? "已连接" : "未连接"}</span>{session.platforms[platform]?.error && <small>{session.platforms[platform]?.error}</small>}</div>)}</div>
      <button className="btn btn-primary" disabled={busy || loading || !selected || !!changed} onClick={() => void connect()}>{busy && <LoaderCircle size={16} className="spin" />}连接学习账号</button>
    </section>
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <div className="error-banner" role="alert"><CircleAlert size={16} /><span>{error}</span><button className="text-link" onClick={() => void load()}>重试</button></div>}
  </div>;
}

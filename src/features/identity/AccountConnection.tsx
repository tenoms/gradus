import { useEffect, useState } from "react";
import { BookOpen, Check, CheckCheck, CircleAlert, Database, Link2, LoaderCircle, RefreshCw, Unlink } from "lucide-react";
import { api, ApiError } from "../../shared/api/client";
import PersonalImportedRecords from "./PersonalImportedRecords";
import { errorMessage, maskedIdentity, personalScopes, personalSyncPath, platformNames, syncDate } from "./personal-sync";
import type { PersonalScope, PersonalSourceAccount, PersonalSyncStatus } from "./personal-sync";

export default function PersonalLearningAccount() {
  const [status, setStatus] = useState<PersonalSyncStatus>();
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [accounts, setAccounts] = useState<PersonalSourceAccount[]>([]);
  const [directoryRead, setDirectoryRead] = useState(false);
  const [ref, setRef] = useState("");
  const [replaceRef, setReplaceRef] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [scopes, setScopes] = useState<PersonalScope[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function readStatus(resetForms = false) {
    const value = await api<PersonalSyncStatus>(personalSyncPath);
    setStatus(value);
    if (resetForms) {
      setBaseUrl(value.connection.baseUrl || ""); setApiKey(""); setClearApiKey(false);
      setEnabled(value.settings.enabled); setScopes(value.settings.scopes);
    }
    return value;
  }
  async function action(name: string, work: () => Promise<void>) {
    setBusy(name); setError(""); setNotice("");
    try { await work(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(""); }
  }
  useEffect(() => { void action("load", async () => { await readStatus(true); }); }, []);

  const connectionChanged = !!status && (baseUrl !== status.connection.baseUrl || !!apiKey || clearApiKey);
  const settingsChanged = !!status && (enabled !== status.settings.enabled || JSON.stringify(scopes.slice().sort()) !== JSON.stringify(status.settings.scopes.slice().sort()));
  const selected = accounts.find(account => account.ref === ref);
  const disabled = !!busy;

  async function bind(replace = false) {
    const chosenRef = replace ? replaceRef : ref;
    await action("binding", async () => {
      try {
        await api(`${personalSyncPath}/binding`, { method: "POST", body: JSON.stringify({ ref: chosenRef, ...(replace ? { replace: true } : {}) }) });
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 409 && !replace) {
          setReplaceRef(chosenRef);
          setError("你选择了另一个微信账号。切换关联后，已导入的记录仍会保留。");
          return;
        }
        throw cause;
      }
      setReplaceRef("");
      await readStatus(true);
      setNotice("账号已关联。选择要导入的记录后，即可预览或导入。");
    });
  }

  return <div className="personal-connection personal-sync">
    <section className="panel settings-panel personal-sync-intro">
      <span className="personal-sync-icon"><BookOpen size={23} /></span>
      <div><h2>导入小程序学习记录</h2><p>关联自己的微信账号，继续使用小程序中的书架、收藏、错题、笔记和历史记录。</p><p className="muted">按需关联即可，不影响正常学习。</p></div>
    </section>

    {error && <div className="error-banner" role="alert"><CircleAlert size={17} /><span>{error}</span>{!status && <button className="text-link" onClick={() => void action("load", async () => { await readStatus(true); })}>重新读取</button>}</div>}
    {notice && <p className="notice" role="status"><Check size={16} />{notice}</p>}
    {busy === "load" && !status && <p className="loading-state" role="status"><LoaderCircle size={20} className="spin" />正在读取个人学习账号…</p>}

    {status && <>
      <section className="panel settings-panel">
        <div className="personal-section-heading"><div><h2>我的小程序学习账号</h2></div>{status.binding && <span className="personal-sync-badge">已关联</span>}</div>
        {status.binding && <div className="personal-linked-account">
          <div className="personal-linked-heading"><Link2 size={19} /><div><strong>{status.binding.nickname || "我的微信账号"}</strong><small>账号 {maskedIdentity(status.binding.openid)}</small></div><button className="btn btn-secondary" disabled={disabled} onClick={() => void action("unlink", async () => {
            await api(`${personalSyncPath}/binding`, { method: "DELETE" });
            await readStatus(true); setReplaceRef("");
            setNotice("已解除关联，已导入的记录仍会保留。");
          })}>{busy === "unlink" ? <LoaderCircle size={15} className="spin" /> : <Unlink size={15} />}解除关联</button></div>
          <div className="personal-platform-status">{(["math", "computer"] as const).map(platform => {
            const state = status.binding!.platforms?.[platform];
            return <div key={platform}><strong>{platformNames[platform]}</strong><span className={state?.status === "ready" ? "green-text" : "muted"}>{state?.status === "ready" ? "已关联" : state?.status === "needs_verification" ? "需要重新关联" : "暂未关联"}</span>{state?.error ? <small>{state.error}</small> : state?.subjectId ? <small>可导入该科目的学习记录。</small> : <small>请重新关联后重试。</small>}</div>;
          })}</div>
        </div>}
        <details className="personal-connection-details" open={!status.binding}>
          <summary>{status.binding ? "更换连接或关联账号" : "连接小程序账号"}</summary>
          <form onSubmit={event => { event.preventDefault(); void action("connection", async () => {
            await api(`${personalSyncPath}/connection`, { method: "PUT", body: JSON.stringify({ baseUrl, ...(apiKey ? { apiKey } : {}), ...(clearApiKey ? { clearApiKey: true } : {}) }) });
            await readStatus(true); setAccounts([]); setDirectoryRead(false); setRef(""); setReplaceRef("");
            setNotice("连接已保存。请读取账号列表，选择自己的微信账号。");
          }); }}>
            <div className="personal-form-grid">
              <label>YYB 服务地址<input className="input" type="url" required maxLength={2000} value={baseUrl} placeholder="http://你的服务地址:端口" onChange={event => { setBaseUrl(event.target.value); setAccounts([]); setDirectoryRead(false); setRef(""); }} disabled={disabled} /></label>
              <label>API Key（可选）<input className="input" type="password" autoComplete="new-password" value={apiKey} placeholder={status.connection.apiKeyConfigured && baseUrl === status.connection.baseUrl ? "已保存，留空保留" : "服务要求认证时填写"} onChange={event => { setApiKey(event.target.value); setClearApiKey(false); }} disabled={disabled} /></label>
            </div>
            {status.connection.apiKeyConfigured && <label className="personal-key-clear"><input type="checkbox" checked={clearApiKey} disabled={disabled} onChange={event => { setClearApiKey(event.target.checked); if (event.target.checked) setApiKey(""); }} />清除已保存的 API Key</label>}
            {status.connection.apiKeyConfigured && baseUrl !== status.connection.baseUrl && <p className="muted">更换服务地址时，需要认证请重新填写 API Key。</p>}
            <button className="btn btn-primary" disabled={disabled || !connectionChanged}>{busy === "connection" ? <LoaderCircle size={16} className="spin" /> : <CheckCheck size={16} />}保存连接</button>
          </form>
          <div className="personal-source-directory">
            <button className="btn btn-secondary" disabled={disabled || !status.connection.baseUrl || connectionChanged} onClick={() => void action("accounts", async () => {
              const result = await api<{ accounts: PersonalSourceAccount[] }>(`${personalSyncPath}/accounts`);
              setAccounts(result.accounts); setDirectoryRead(true); setRef(""); setReplaceRef("");
            })}>{busy === "accounts" ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}读取账号列表</button>
            {connectionChanged && <p className="muted">请先保存连接，再读取账号列表。</p>}
            {directoryRead && !accounts.length && <p className="muted">该 YYB 服务中暂无可关联账号。</p>}
            {!!accounts.length && <>
              <label className="personal-account-select">选择自己的微信账号<select className="input" value={ref} disabled={disabled} onChange={event => { setRef(event.target.value); setReplaceRef(""); }}><option value="">请选择要关联的账号</option>{accounts.map(account => <option key={account.ref} value={account.ref} disabled={!account.openid}>{account.nickname || "微信账号"} · {account.openid ? maskedIdentity(account.openid) : "账号信息不完整，无法关联"}{account.status === "alive" ? "" : " · 状态待确认"}</option>)}</select></label>
              <p className="muted">请选择自己的微信账号。</p>
              <button className="btn btn-primary" disabled={disabled || connectionChanged || !selected?.openid} onClick={() => void bind()}>{busy === "binding" ? <LoaderCircle size={16} className="spin" /> : <Link2 size={16} />}关联这个微信账号</button>
            </>}
            {replaceRef && <div className="personal-sync-replace"><p>你正在关联另一个微信账号。切换后更新新账号的记录，原账号已导入的内容继续保留。</p><div className="personal-sync-actions"><button className="btn btn-primary" disabled={disabled || connectionChanged} onClick={() => void bind(true)}>切换关联并保留已导入记录</button><button className="btn btn-secondary" disabled={disabled} onClick={() => setReplaceRef("")}>取消切换</button></div></div>}
          </div>
        </details>
      </section>

      <section className="panel settings-panel">
        <div className="personal-section-heading"><div><h2>学习记录同步</h2><p className="muted">这里新增或修改的学习记录不会同步回小程序。</p></div><span className={`personal-sync-badge ${status.settings.enabled ? "" : "is-paused"}`}>{status.settings.enabled ? "已开启" : "已关闭"}</span></div>
        <form onSubmit={event => { event.preventDefault(); void action("settings", async () => {
          await api(`${personalSyncPath}/settings`, { method: "PUT", body: JSON.stringify({ enabled, scopes }) });
          await readStatus(true); setNotice(enabled ? "设置已保存，学习时会自动更新所选记录。" : "已关闭自动更新，已有学习记录仍会保留。");
        }); }}>
          <label className="personal-sync-toggle"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={disabled} /><span><strong>自动更新已导入的记录</strong><small>学习时获取小程序中的最新记录。</small></span></label>
          <fieldset className="personal-sync-scopes" disabled={disabled}><legend>选择要导入的记录</legend>{Object.entries(personalScopes).map(([scope, name]) => <label key={scope}><input type="checkbox" checked={scopes.includes(scope as PersonalScope)} onChange={event => setScopes(current => event.target.checked ? [...current, scope as PersonalScope] : current.filter(value => value !== scope))} />{name}</label>)}</fieldset>
          <button className="btn btn-primary" disabled={disabled || !settingsChanged || (enabled && !scopes.length)}>{busy === "settings" ? <LoaderCircle size={16} className="spin" /> : <CheckCheck size={16} />}保存同步设置</button>
        </form>
        <div className="personal-sync-summary"><Database size={17} /><span>已导入 <strong>{status.summary.total}</strong> 条记录</span><span>最近更新：{syncDate(status.summary.lastSyncedAt)}</span></div>
        {!!status.summary.total && <div className="personal-sync-counts">{Object.entries(personalScopes).map(([scope, name]) => <span key={scope}>{name} <strong>{status.summary.byScope?.[scope as PersonalScope] || 0}</strong></span>)}</div>}
        {status.summary.lastError && <p className="personal-sync-warning" role="status">最近更新未完成：{status.summary.lastError}。已导入记录仍可查看。</p>}
      </section>

      <PersonalImportedRecords status={status} onChanged={() => readStatus()} disabled={disabled} />
    </>}
  </div>;
}

import { useEffect, useState } from "react";
import { BookOpen, Check, CheckCheck, CircleAlert, Database, Link2, LoaderCircle, RefreshCw, Unlink } from "lucide-react";
import { api, ApiError } from "../../lib/api";
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
          setError("所选账号与当前关联的微信账号不同。确认切换后，已有导入记录仍保留在当前 Web 账号下。");
          return;
        }
        throw cause;
      }
      setReplaceRef("");
      await readStatus(true);
      setNotice("个人学习账号已关联。选择同步范围后，可预览或导入本人的学习记录。");
    });
  }

  return <div className="personal-connection personal-sync">
    <section className="panel settings-panel personal-sync-intro">
      <span className="personal-sync-icon"><BookOpen size={23} /></span>
      <div><h2>把小程序里的学习积累带到 Web</h2><p>关联自己的微信账号，单向导入书架、收藏、错题、笔记和历史记录。导入后归当前 Web 账号保存，在 Web 学习产生的新记录也保存在这里。</p><p className="muted">题目等学习资源由系统账号池自动补齐，使用 Web 无需先关联个人账号。</p></div>
    </section>

    {error && <div className="error-banner" role="alert"><CircleAlert size={17} /><span>{error}</span>{!status && <button className="text-link" onClick={() => void action("load", async () => { await readStatus(true); })}>重新读取</button>}</div>}
    {notice && <p className="notice" role="status"><Check size={16} />{notice}</p>}
    {busy === "load" && !status && <p className="loading-state" role="status"><LoaderCircle size={20} className="spin" />正在读取个人学习账号…</p>}

    {status && <>
      <section className="panel settings-panel">
        <div className="personal-section-heading"><div><h2>我的小程序学习账号</h2><p className="muted">通过自己的 YYB 服务关联，数学与计算机学习身份分别确认。</p></div>{status.binding && <span className="personal-sync-badge">已关联</span>}</div>
        {status.binding && <div className="personal-linked-account">
          <div className="personal-linked-heading"><Link2 size={19} /><div><strong>{status.binding.nickname || "我的微信账号"}</strong><small>微信标识 {maskedIdentity(status.binding.openid)}</small></div><button className="btn btn-secondary" disabled={disabled} onClick={() => void action("unlink", async () => {
            await api(`${personalSyncPath}/binding`, { method: "DELETE" });
            await readStatus(true); setReplaceRef("");
            setNotice("已解除关联，停止更新个人数据。已导入记录仍保留在当前 Web 账号下。");
          })}>{busy === "unlink" ? <LoaderCircle size={15} className="spin" /> : <Unlink size={15} />}解除关联</button></div>
          <div className="personal-platform-status">{(["math", "computer"] as const).map(platform => {
            const state = status.binding!.platforms?.[platform];
            return <div key={platform}><strong>{platformNames[platform]}</strong><span className={state?.status === "ready" ? "green-text" : "muted"}>{state?.status === "ready" ? "身份已确认" : state?.status === "needs_verification" ? "需要重新确认" : "暂未确认"}</span>{state?.error ? <small>{state.error}</small> : state?.subjectId ? <small>学习身份 {maskedIdentity(String(state.subjectId))}</small> : <small>重新关联时可再次检查该科学习身份。</small>}</div>;
          })}</div>
        </div>}
        <details className="personal-connection-details" open={!status.binding}>
          <summary>{status.binding ? "更换 YYB 连接或关联账号" : "配置自己的 YYB 服务"}</summary>
          <form onSubmit={event => { event.preventDefault(); void action("connection", async () => {
            await api(`${personalSyncPath}/connection`, { method: "PUT", body: JSON.stringify({ baseUrl, ...(apiKey ? { apiKey } : {}), ...(clearApiKey ? { clearApiKey: true } : {}) }) });
            await readStatus(true); setAccounts([]); setDirectoryRead(false); setRef(""); setReplaceRef("");
            setNotice("YYB 连接已保存。请读取账号目录，选择并确认自己的微信账号。");
          }); }}>
            <div className="personal-form-grid">
              <label>YYB 服务地址<input className="input" type="url" required maxLength={2000} value={baseUrl} placeholder="http://你的服务地址:端口" onChange={event => { setBaseUrl(event.target.value); setAccounts([]); setDirectoryRead(false); setRef(""); }} disabled={disabled} /></label>
              <label>API Key（可选）<input className="input" type="password" autoComplete="new-password" value={apiKey} placeholder={status.connection.apiKeyConfigured && baseUrl === status.connection.baseUrl ? "已保存，留空保留" : "服务要求认证时填写"} onChange={event => { setApiKey(event.target.value); setClearApiKey(false); }} disabled={disabled} /></label>
            </div>
            {status.connection.apiKeyConfigured && <label className="personal-key-clear"><input type="checkbox" checked={clearApiKey} disabled={disabled} onChange={event => { setClearApiKey(event.target.checked); if (event.target.checked) setApiKey(""); }} />清除已保存的 API Key</label>}
            {status.connection.apiKeyConfigured && baseUrl !== status.connection.baseUrl && <p className="muted">更换服务地址时，需要认证请重新填写 API Key。</p>}
            <button className="btn btn-primary" disabled={disabled || !connectionChanged}>{busy === "connection" ? <LoaderCircle size={16} className="spin" /> : <CheckCheck size={16} />}保存 YYB 连接</button>
          </form>
          <div className="personal-source-directory">
            <button className="btn btn-secondary" disabled={disabled || !status.connection.baseUrl || connectionChanged} onClick={() => void action("accounts", async () => {
              const result = await api<{ accounts: PersonalSourceAccount[] }>(`${personalSyncPath}/accounts`);
              setAccounts(result.accounts); setDirectoryRead(true); setRef(""); setReplaceRef("");
            })}>{busy === "accounts" ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}读取我的账号目录</button>
            {connectionChanged && <p className="muted">先保存连接，再读取账号目录。</p>}
            {directoryRead && !accounts.length && <p className="muted">该 YYB 服务中暂无可关联账号。</p>}
            {!!accounts.length && <>
              <label className="personal-account-select">选择自己的微信账号<select className="input" value={ref} disabled={disabled} onChange={event => { setRef(event.target.value); setReplaceRef(""); }}><option value="">请选择要关联的账号</option>{accounts.map(account => <option key={account.ref} value={account.ref} disabled={!account.openid}>{account.nickname || "微信账号"} · {account.openid ? maskedIdentity(account.openid) : "缺少微信标识，无法关联"}{account.status === "alive" ? "" : " · 会话待检查"}</option>)}</select></label>
              <p className="muted">同一个微信账号更换 YYB 地址后可继续原有关联，不会重复导入。请确认所选账号属于自己。</p>
              <button className="btn btn-primary" disabled={disabled || !selected?.openid} onClick={() => void bind()}>{busy === "binding" ? <LoaderCircle size={16} className="spin" /> : <Link2 size={16} />}关联这个微信账号</button>
            </>}
            {replaceRef && <div className="personal-sync-replace"><p>你正在关联另一个微信账号。切换后更新新账号的记录，原账号已导入的内容继续保留。</p><div className="personal-sync-actions"><button className="btn btn-primary" disabled={disabled} onClick={() => void bind(true)}>切换关联并保留已导入记录</button><button className="btn btn-secondary" disabled={disabled} onClick={() => setReplaceRef("")}>取消切换</button></div></div>}
          </div>
        </details>
      </section>

      <section className="panel settings-panel">
        <div className="personal-section-heading"><div><h2>个人学习数据同步</h2><p className="muted">小程序记录单向导入 Web；Web 中的新增与修改不会回写小程序。</p></div><span className={`personal-sync-badge ${status.settings.enabled ? "" : "is-paused"}`}>{status.settings.enabled ? "已开启" : "已关闭"}</span></div>
        <form onSubmit={event => { event.preventDefault(); void action("settings", async () => {
          await api(`${personalSyncPath}/settings`, { method: "PUT", body: JSON.stringify({ enabled, scopes }) });
          await readStatus(true); setNotice(enabled ? "个人同步设置已保存，进入相关页面时按需更新当前范围。" : "个人同步已关闭，已有记录和 Web 新学习记录继续保留。");
        }); }}>
          <label className="personal-sync-toggle"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={disabled} /><span><strong>在学习时更新我的小程序记录</strong><small>此开关独立于管理员的公共资源同步开关。</small></span></label>
          <fieldset className="personal-sync-scopes" disabled={disabled}><legend>允许导入的数据范围</legend>{Object.entries(personalScopes).map(([scope, name]) => <label key={scope}><input type="checkbox" checked={scopes.includes(scope as PersonalScope)} onChange={event => setScopes(current => event.target.checked ? [...current, scope as PersonalScope] : current.filter(value => value !== scope))} />{name}</label>)}</fieldset>
          <button className="btn btn-primary" disabled={disabled || !settingsChanged || (enabled && !scopes.length)}>{busy === "settings" ? <LoaderCircle size={16} className="spin" /> : <CheckCheck size={16} />}保存个人同步设置</button>
        </form>
        <div className="personal-sync-summary"><Database size={17} /><span>已导入 <strong>{status.summary.total}</strong> 条记录</span><span>最近更新：{syncDate(status.summary.lastSyncedAt)}</span></div>
        {!!status.summary.total && <div className="personal-sync-counts">{Object.entries(personalScopes).map(([scope, name]) => <span key={scope}>{name} <strong>{status.summary.byScope?.[scope as PersonalScope] || 0}</strong></span>)}</div>}
        {status.summary.lastError && <p className="personal-sync-warning" role="status">最近更新未完成：{status.summary.lastError}。已导入记录仍可查看。</p>}
      </section>

      <PersonalImportedRecords status={status} onChanged={() => readStatus()} disabled={disabled} />
    </>}
  </div>;
}

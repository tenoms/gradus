import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Check, CircleAlert, Clock3, Code2, KeyRound, Link2,
  LoaderCircle, RefreshCw, RotateCcw, Save, ShieldCheck, Sigma, X,
} from "lucide-react";
import { api, ApiError } from "../../lib/api";
import type {
  IntegrationAccount, IntegrationConfig, IntegrationConfiguration,
  IntegrationProbe, IntegrationTarget, SecretPath,
} from "../../lib/platform-config";
import "./integration-settings.css";

const labels: Record<IntegrationTarget | "all", string> = {
  yyb: "YYB 会话服务", math: "考研数学", computer: "计算机 408", all: "全部集成",
};
const secretPaths: SecretPath[] = [
  "yyb.apiKey", "math.ocrUsername", "math.ocrPassword",
  "computer.oauthClientSecret", "computer.videoKey", "computer.videoIv",
];
const blankSecrets = () => Object.fromEntries(secretPaths.map(path => [path, ""])) as Record<SecretPath, string>;
const message = (cause: unknown) => cause instanceof Error ? cause.message : "操作未完成，请稍后重试";
const dateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
};

function Field({ label, help, children, wide = false }: { label: string; help?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`field-label integration-field ${wide ? "integration-field-wide" : ""}`}>
    <span>{label}</span>{children}{help && <small>{help}</small>}
  </label>;
}

function SecretField({ path, label, help, configured, value, clear, disabled, onChange, onClear }: {
  path: SecretPath; label: string; help?: string; configured: boolean; value: string; clear: boolean; disabled: boolean;
  onChange: (value: string) => void; onClear: (clear: boolean) => void;
}) {
  return <div className="integration-secret-field">
    <div className="integration-secret-label"><label htmlFor={`integration-${path}`}>{label}</label><span className={`integration-secret-status ${configured ? "is-configured" : ""}`}><KeyRound size={12} />{clear ? "保存时清空" : configured ? "已配置" : "未配置"}</span></div>
    <input id={`integration-${path}`} className="input" type="password" autoComplete="new-password" spellCheck={false} value={value} disabled={disabled || clear} onChange={event => onChange(event.target.value)} placeholder={clear ? "此项将在保存时清空" : configured ? "留空保留现有值，输入新值替换" : "输入配置值"} />
    <div className="integration-secret-help"><small>{help || "已保存的值不会返回浏览器。"}</small>{configured && <label><input type="checkbox" aria-label={`清空${label}`} checked={clear} disabled={disabled} onChange={event => onClear(event.target.checked)} />清空此项</label>}</div>
  </div>;
}

export default function IntegrationSettings() {
  const [saved, setSaved] = useState<IntegrationConfiguration>();
  const [draft, setDraft] = useState<IntegrationConfig>();
  const [secrets, setSecrets] = useState(blankSecrets);
  const [clearSecrets, setClearSecrets] = useState<SecretPath[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");
  const [probing, setProbing] = useState<IntegrationTarget | "all">();
  const [probe, setProbe] = useState<IntegrationProbe>();
  const [probeError, setProbeError] = useState("");
  const [accounts, setAccounts] = useState<IntegrationAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState("");
  const [accountRef, setAccountRef] = useState("");
  const dirty = !!saved && !!draft && (JSON.stringify(saved.config) !== JSON.stringify(draft) || secretPaths.some(path => secrets[path] !== "") || clearSecrets.length > 0);
  const busy = loading || saving || !!probing;

  function accept(value: IntegrationConfiguration) {
    setSaved(value); setDraft(structuredClone(value.config));
    setSecrets(blankSecrets()); setClearSecrets([]); setConflict(false);
  }
  async function load() {
    setLoading(true); setError(""); setNotice("");
    try { accept(await api<IntegrationConfiguration>("/api/admin/configuration")); }
    catch (cause) { setError(message(cause)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function setField<T extends IntegrationTarget, K extends keyof IntegrationConfig[T]>(target: T, key: K, value: IntegrationConfig[T][K]) {
    setDraft(current => current ? { ...current, [target]: { ...current[target], [key]: value } } : current);
    setNotice("");
  }
  function setSecret(path: SecretPath, value: string) {
    setSecrets(current => ({ ...current, [path]: value })); setNotice("");
  }
  function clearSecret(path: SecretPath, clear: boolean) {
    setClearSecrets(current => clear ? [...current.filter(value => value !== path), path] : current.filter(value => value !== path));
    if (clear) setSecrets(current => ({ ...current, [path]: "" }));
    setNotice("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!saved || !draft) return;
    setSaving(true); setError(""); setNotice("");
    const config: Record<IntegrationTarget, Record<string, unknown>> = {
      yyb: { ...draft.yyb }, math: { ...draft.math }, computer: { ...draft.computer },
    };
    for (const path of secretPaths) {
      if (!secrets[path]) continue;
      const [target, field] = path.split(".");
      config[target as IntegrationTarget][field] = secrets[path];
    }
    try {
      const value = await api<IntegrationConfiguration>("/api/admin/configuration", { method: "PUT", body: JSON.stringify({ revision: saved.revision, config, clearSecrets }) });
      const affected = value.affectedPlatforms || [];
      accept(value); setProbe(undefined); setProbeError("");
      setAccounts([]); setAccountRef(""); setAccountsError("");
      setNotice(affected.length ? `配置已保存。${affected.map(target => labels[target]).join("、")}将使用新配置，已有学习连接需要重新建立。` : "配置已保存。");
    } catch (cause) {
      const stale = cause instanceof ApiError && cause.status === 409;
      setConflict(stale);
      setError(stale ? "配置已在其他页面更新，当前编辑尚未保存。请先保留需要的内容，再重新读取最新配置。" : message(cause));
    } finally { setSaving(false); }
  }
  async function readAccounts() {
    setAccountsLoading(true); setAccountsError("");
    try {
      const value = await api<{ accounts: IntegrationAccount[] }>("/api/admin/accounts");
      setAccounts(value.accounts || []);
      if (!(value.accounts || []).some(account => account.ref === accountRef)) setAccountRef("");
    } catch (cause) { setAccountsError(message(cause)); }
    finally { setAccountsLoading(false); }
  }
  async function check(target: IntegrationTarget | "all") {
    if (probing) return;
    setProbing(target); setProbeError(""); setProbe(undefined);
    try {
      setProbe(await api<IntegrationProbe>("/api/admin/configuration/probe", { method: "POST", body: JSON.stringify({ target, ...(accountRef ? { ref: accountRef } : {}) }) }));
    } catch (cause) { setProbeError(message(cause)); }
    finally { setProbing(undefined); }
  }
  const renderSecret = (path: SecretPath, label: string, help?: string) => <SecretField key={path} path={path} label={label} help={help} configured={!!saved?.secretStatus[path]} value={secrets[path]} clear={clearSecrets.includes(path)} disabled={busy} onChange={value => setSecret(path, value)} onClear={clear => clearSecret(path, clear)} />;
  const probeButton = (target: IntegrationTarget) => <button className="btn btn-secondary integration-probe-link" type="button" disabled={!!probing || busy} onClick={() => void check(target)}>{probing === target ? <LoaderCircle size={15} className="spin" /> : <Link2 size={15} />}检查{labels[target]}</button>;

  if (!draft || !saved) return <section className="panel integration-initial-state">{loading ? <><LoaderCircle size={25} className="spin" /><p>正在读取平台配置…</p></> : <><CircleAlert size={26} /><p role="alert">{error || "配置暂时不可用"}</p><button className="btn btn-secondary" onClick={() => void load()}><RefreshCw size={15} />重新读取</button></>}</section>;

  return <div className="integration-settings">
    <div className="integration-toolbar" role="group" aria-label="平台配置操作"><span className="integration-revision">配置版本 {saved.revision}</span><button className="btn btn-secondary" type="button" disabled={busy || dirty} onClick={() => void load()}><RefreshCw size={14} />读取最新配置</button></div>
    {notice && <div className="integration-notice" role="status"><Check size={18} /><p>{notice}</p><button className="icon-button" aria-label="关闭保存提示" onClick={() => setNotice("")}><X size={16} /></button></div>}
    {error && <div className="integration-error" role="alert"><CircleAlert size={18} /><div><p>{error}</p>{conflict && <button className="text-link" disabled={busy} onClick={() => void load()}>放弃当前编辑并读取最新配置</button>}</div></div>}
    <div className="integration-layout">
      <form className="integration-form" onSubmit={save}>
        <section className="panel integration-card" aria-labelledby="integration-yyb-title">
          <div className="integration-card-heading"><span className="integration-platform-icon yyb"><Link2 size={23} /></span><div><h2 id="integration-yyb-title">YYB 会话服务</h2></div><span className={`integration-state ${draft.yyb.baseUrl ? "is-enabled" : ""}`}>{draft.yyb.baseUrl ? "已填写地址" : "待配置"}</span></div>
          <fieldset disabled={busy}><div className="integration-fields"><Field label="服务地址" help="填写 YYB 服务根地址，例如 https://yyb.example.com。" wide><input className="input" type="url" value={draft.yyb.baseUrl} placeholder="https://yyb.example.com" onChange={event => setField("yyb", "baseUrl", event.target.value)} autoComplete="url" spellCheck={false} /></Field>{renderSecret("yyb.apiKey", "API Key", "YYB 服务需要鉴权时填写。")}</div></fieldset>
          <div className="integration-card-footer"><p>更改 YYB 配置会影响两个学科的账号连接。</p>{probeButton("yyb")}</div>
        </section>

        <section className={`panel integration-card ${!draft.math.enabled ? "platform-disabled" : ""}`} aria-labelledby="integration-math-title">
          <div className="integration-card-heading"><span className="integration-platform-icon math"><Sigma size={24} /></span><div><h2 id="integration-math-title">考研数学</h2></div><label className="integration-toggle"><input type="checkbox" aria-label="启用考研数学" checked={draft.math.enabled} disabled={busy} onChange={event => setField("math", "enabled", event.target.checked)} /><span aria-hidden="true" /><strong>{draft.math.enabled ? "已启用" : "已停用"}</strong></label></div>
          <fieldset disabled={busy}><div className="integration-fields"><Field label="平台地址" wide><input className="input" type="url" required value={draft.math.baseUrl} onChange={event => setField("math", "baseUrl", event.target.value)} spellCheck={false} /></Field><Field label="微信 App ID" help="数学小程序在微信开放平台的 App ID。" wide><input className="input" value={draft.math.appId} onChange={event => setField("math", "appId", event.target.value)} required pattern="wx[0-9a-fA-F]{16}" maxLength={18} spellCheck={false} /></Field><Field label="站点 ID"><input className="input" type="number" min={1} step={1} required value={draft.math.stationId} onChange={event => setField("math", "stationId", Number(event.target.value))} /></Field><Field label="登录 ID"><input className="input" type="number" min={1} step={1} required value={draft.math.loginId} onChange={event => setField("math", "loginId", Number(event.target.value))} /></Field></div>
            <details className="integration-subsection" open><summary>图片识别服务 <span>OCR</span></summary><div className="integration-fields"><Field label="OCR 接口地址" help="用于数学拍照搜题，填写完整识别接口地址。" wide><input className="input" type="url" value={draft.math.ocrUrl} onChange={event => setField("math", "ocrUrl", event.target.value)} spellCheck={false} /></Field>{renderSecret("math.ocrUsername", "OCR 用户名")}{renderSecret("math.ocrPassword", "OCR 密码")}</div></details>
          </fieldset>
          <div className="integration-card-footer"><p>{draft.math.enabled ? "修改数学配置后，已有数学连接需要重新建立。" : "停用后，学习者无法连接或请求数学平台。"}</p>{probeButton("math")}</div>
        </section>

        <section className={`panel integration-card ${!draft.computer.enabled ? "platform-disabled" : ""}`} aria-labelledby="integration-computer-title">
          <div className="integration-card-heading"><span className="integration-platform-icon computer"><Code2 size={23} /></span><div><h2 id="integration-computer-title">计算机 408</h2></div><label className="integration-toggle"><input type="checkbox" aria-label="启用计算机 408" checked={draft.computer.enabled} disabled={busy} onChange={event => setField("computer", "enabled", event.target.checked)} /><span aria-hidden="true" /><strong>{draft.computer.enabled ? "已启用" : "已停用"}</strong></label></div>
          <fieldset disabled={busy}><div className="integration-fields"><Field label="平台地址" wide><input className="input" type="url" required value={draft.computer.baseUrl} onChange={event => setField("computer", "baseUrl", event.target.value)} spellCheck={false} /></Field><Field label="微信 App ID" wide><input className="input" value={draft.computer.appId} onChange={event => setField("computer", "appId", event.target.value)} required pattern="wx[0-9a-fA-F]{16}" maxLength={18} spellCheck={false} /></Field><Field label="租户代码"><input className="input" required value={draft.computer.tenantCode} onChange={event => setField("computer", "tenantCode", event.target.value)} maxLength={100} spellCheck={false} /></Field><Field label="OAuth 客户端 ID"><input className="input" required value={draft.computer.oauthClientId} onChange={event => setField("computer", "oauthClientId", event.target.value)} maxLength={160} spellCheck={false} /></Field>{renderSecret("computer.oauthClientSecret", "OAuth 客户端密钥")}</div>
            <details className="integration-subsection" open><summary>授权录播配置 <span>VIDEO</span></summary><p>仅用于解密原平台授予的播放地址。</p><div className="integration-fields">{renderSecret("computer.videoKey", "录播 AES Key", "需要 16 字节 UTF-8 值。")}{renderSecret("computer.videoIv", "录播 AES IV", "需要 16 字节 UTF-8 值。")}</div></details>
          </fieldset>
          <div className="integration-card-footer"><p>{draft.computer.enabled ? "修改计算机配置后，已有计算机连接需要重新建立。" : "停用后，学习者无法连接或请求计算机平台。"}</p>{probeButton("computer")}</div>
        </section>

        <div className="integration-save-bar"><div><span className={`integration-dirty-dot ${dirty ? "is-dirty" : ""}`} /><div><strong>{saving ? "正在保存配置…" : dirty ? "有未保存的更改" : "已与服务器配置一致"}</strong><p>{clearSecrets.length ? `${clearSecrets.length} 项秘密将在保存时清空。` : "保存后立即应用到后续学习请求。"}</p></div></div><div className="integration-save-actions"><button className="btn btn-secondary" type="button" disabled={busy || !dirty} onClick={() => { if (conflict) void load(); else { accept(saved); setError(""); setNotice(""); } }}><RotateCcw size={15} />放弃编辑</button><button className="btn btn-primary" type="submit" disabled={busy || !dirty || conflict}>{saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}保存配置</button></div></div>
      </form>

      <aside className="integration-inspector">
        <section className="panel integration-probe-panel"><div className="integration-probe-heading"><span className="integration-platform-icon"><ShieldCheck size={22} /></span><div><h2>连接与身份检查</h2></div></div>
          <div className="integration-check-mode"><label className="field-label">实测学习账号<select className="input" value={accountRef} disabled={accountsLoading || !!probing || busy} onChange={event => setAccountRef(event.target.value)}><option value="">仅检查服务连接</option>{accounts.map(account => <option value={account.ref} key={account.ref}>{account.nickname || `学习账号 ${account.ref}`}{account.status && account.status !== "alive" ? "（需检查会话）" : ""}</option>)}</select></label><button className="text-link" type="button" disabled={accountsLoading || !!probing || busy} onClick={() => void readAccounts()}>{accountsLoading ? <LoaderCircle size={13} className="spin" /> : <RefreshCw size={13} />}{accounts.length ? "刷新 YYB 账号" : "读取 YYB 账号"}</button></div>
          {accountsError && <p className="integration-probe-error" role="alert">{accountsError}</p>}
          {accounts.length === 0 && !accountsLoading && !accountsError && <p className="integration-probe-explanation">读取 YYB 账号后，可选择账号验证两个小程序的登录与本人资料接口。</p>}
          <div className="integration-probe-scope"><Link2 size={15} /><p>{accountRef ? "将使用所选 YYB 账号登录目标小程序，并读取本人资料。" : "检查服务健康与公开接口，不建立学习账号登录。"}</p></div>
          {dirty && <p className="integration-probe-unsaved"><CircleAlert size={14} />当前编辑尚未保存，检测仍使用配置版本 {saved.revision}。</p>}
          <button className="btn btn-primary full-width" type="button" disabled={!!probing || busy} onClick={() => void check("all")}>{probing ? <LoaderCircle size={16} className="spin" /> : <Link2 size={16} />}{probing ? `正在检查${labels[probing]}…` : accountRef ? "完整检查所选账号" : "检查全部服务"}</button>
          {probeError && <div className="integration-probe-error" role="alert"><CircleAlert size={17} /><p>{probeError}</p></div>}
          {probe && <div className="integration-probe-result" aria-live="polite"><div className={`integration-probe-summary ${probe.ok ? "is-success" : "is-failure"}`}><span>{probe.ok ? <Check size={17} /> : <CircleAlert size={17} />}{probe.ok ? "检查通过" : "检查发现问题"}</span><small>{labels[probe.target]}</small></div><p className="integration-probe-time"><Clock3 size={12} /><time dateTime={probe.checkedAt}>{dateTime(probe.checkedAt)}</time></p><ol className="integration-check-list">{probe.checks.map((item, index) => <li key={`${item.name}-${index}`} className={item.ok ? "is-success" : "is-failure"}>{item.ok ? <Check size={15} /> : <X size={15} />}<div><strong>{item.name}</strong><p>{item.message}</p>{item.durationMs !== undefined && <small>{Math.round(item.durationMs)} ms</small>}</div></li>)}</ol></div>}
        </section>
        <section className="integration-configuration-note"><KeyRound size={17} /><div><h3>秘密仅保存在服务器</h3><p>密钥和密码只显示是否已配置。输入新值会替换原值，留空则保留；勾选“清空此项”并保存才会移除。</p></div></section>
      </aside>
    </div>
  </div>;
}

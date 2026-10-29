import { useState } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import { api } from "../../shared/api/client";

export default function PasswordSettings() {
  const [currentPassword, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  return <section className="panel settings-panel"><h2>登录安全</h2><p className="muted">更改密码后，其他设备需要重新登录。</p><form className="password-settings-form" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { await api("/api/auth/password", { method: "POST", body: JSON.stringify({ currentPassword, password }) }); setCurrent(""); setPassword(""); setNotice("密码已更新，其他设备的登录已失效。"); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }}>
    <label className="field-label">当前密码<input className="input" type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrent(e.target.value)} required maxLength={256} disabled={busy} /></label>
    <label className="field-label">新密码<input className="input" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required minLength={10} maxLength={256} placeholder="至少 10 位字符" disabled={busy} /></label>
    <button className="btn btn-secondary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <KeyRound size={16} />}更新密码</button>
    {(error || notice) && <p role={error ? "alert" : "status"} className={error ? "error-banner" : "green-text"}>{error || notice}</p>}
  </form></section>;
}

import { useEffect, useState } from "react";
import { Check, CircleAlert, LoaderCircle, Save, UserPlus } from "lucide-react";
import { api } from "../../lib/api";

type RegistrationPolicy = { enabled: boolean; revision: number; updatedAt: string };
export default function RegistrationSettings() {
  const [saved, setSaved] = useState<RegistrationPolicy>();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  function accept(value: RegistrationPolicy) { setSaved(value); setEnabled(value.enabled); }
  async function load() {
    setBusy(true); setError("");
    try { accept(await api<RegistrationPolicy>("/api/admin/registration")); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  return <section className="panel data-card">
    <div className="data-heading"><UserPlus size={22} /><div><h2>用户注册</h2><p>开放后，访客可以自行创建学习账号，无需邮箱验证。新账号仅有学习权限。</p></div></div>
    {error && <div className="error-banner" role="alert"><CircleAlert size={17} /><span>{error}</span><button className="text-link" disabled={busy} onClick={() => void load()}>重新读取</button></div>}
    {notice && <p className="notice" role="status"><Check size={16} />{notice}</p>}
    {!saved && busy && <p role="status"><LoaderCircle size={17} className="spin" />正在读取注册设置…</p>}
    {saved && <form onSubmit={event => { event.preventDefault(); setBusy(true); setError(""); setNotice(""); void api<RegistrationPolicy>("/api/admin/registration", { method: "PUT", body: JSON.stringify({ enabled, revision: saved.revision }) }).then(value => { accept(value); setNotice(value.enabled ? "已开放学习账号注册。" : "已关闭注册，已有账号仍可登录。"); }).catch(cause => setError((cause as Error).message)).finally(() => setBusy(false)); }}>
      <label className="data-switch"><input type="checkbox" aria-label="开放用户注册" checked={enabled} disabled={busy} onChange={event => setEnabled(event.target.checked)} /><strong>{enabled ? "允许访客注册学习账号" : "用户注册已关闭"}</strong></label>
      <button className="btn btn-primary" disabled={busy || enabled === saved.enabled}>{busy ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}保存注册设置</button>
    </form>}
  </section>;
}

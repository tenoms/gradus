import { useEffect, useState } from "react";
import { Check, CircleAlert, LoaderCircle, UserPlus } from "lucide-react";
import { api, ApiError } from "../../../shared/api/client";
import SettingSwitch from "../../../shared/ui/setting-switch/SettingSwitch";

type RegistrationPolicy = { enabled: boolean; revision: number; updatedAt: string };
export default function RegistrationSettings() {
  const [saved, setSaved] = useState<RegistrationPolicy>();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState<""|"load"|"save">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  function accept(value: RegistrationPolicy) { setSaved(value); setEnabled(value.enabled); }
  async function load() {
    setBusy("load"); setError("");
    try { accept(await api<RegistrationPolicy>("/api/admin/registration")); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(""); }
  }
  useEffect(() => { void load(); }, []);
  async function toggle(enabled: boolean) {
    if(!saved || busy)return;
    const previous=saved;
    setEnabled(enabled);setBusy("save");setError("");setNotice("");
    try {
      const value=await api<RegistrationPolicy>("/api/admin/registration",{method:"PUT",body:JSON.stringify({enabled,revision:previous.revision})});
      accept(value);setNotice(value.enabled?"已开放学习账号注册。":"已关闭注册，已有账号仍可登录。");
    }catch(cause){
      setEnabled(previous.enabled);
      if(cause instanceof ApiError && cause.status===409) {
        try{accept(await api<RegistrationPolicy>("/api/admin/registration"));setError("注册设置已在其他页面更新，已读取最新状态。");}
        catch{setError("未能保存，已恢复原状态。请重新读取后重试。");}
      }else setError(`未能保存，已恢复原状态：${(cause as Error).message}`);
    }finally{setBusy("");}
  }
  return <section className="panel data-card">
    <div className="data-heading"><UserPlus size={22} /><div><h2>用户注册</h2><p>开放后，访客可以自行创建学习账号，无需邮箱验证。新账号仅有学习权限。</p></div></div>
    {error && <div className="error-banner" role="alert"><CircleAlert size={17} /><span>{error}</span><button className="text-link" disabled={!!busy} onClick={() => void load()}>重新读取</button></div>}
    {notice && <p className="notice" role="status"><Check size={16} />{notice}</p>}
    {!saved && busy && <p role="status"><LoaderCircle size={17} className="spin" />正在读取注册设置…</p>}
    {saved && <SettingSwitch label="开放用户注册" description="切换后立即保存，已有学习账号不受影响。" checked={enabled} pending={busy==="save"} disabled={!!busy} onChange={value=>{void toggle(value);}} />}
  </section>;
}

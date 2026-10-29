import { useEffect, useState } from "react";
import { Camera, LoaderCircle, Save, UserRound } from "lucide-react";
import { api } from "../../shared/api/client";
import { useSession } from "../../shared/auth/session";
import { createProfileAvatar } from "./profile-avatar";
import { preparationStatuses, reviewMonths } from "../../../shared/account-profile.mjs";
import type { AccountProfile as AccountProfileValue } from "../../../shared/account-profile.mjs";
import "./account-profile.css";

export default function AccountProfile({ userId }: { userId: string }) {
  const { refresh } = useSession();
  const [form, setForm] = useState<AccountProfileValue>();
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    api<{ profile: AccountProfileValue }>("/api/learning/profile")
      .then(value => { if (active) setForm(value.profile); })
      .catch(cause => { if (active) setError(cause.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [userId, version]);
  function set<K extends keyof AccountProfileValue>(key: K, value: AccountProfileValue[K]) {
    setForm(previous => previous ? { ...previous, [key]: value } : previous);
  }
  async function upload(file?: File) {
    if (!file) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      set("avatar", await createProfileAvatar(file));
      setNotice("头像已选好，保存资料后生效。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "头像读取失败，请重试。"); }
    finally { setSaving(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form || saving) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const value = await api<{ profile: AccountProfileValue }>("/api/learning/profile", { method: "PUT", body: JSON.stringify(form) });
      setForm(value.profile);
      await refresh();
      setNotice("个人资料已保存，下次登录可继续使用。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "资料保存失败，请重试。"); }
    finally { setSaving(false); }
  }
  if (busy) return <div className="account-profile-state" role="status"><LoaderCircle className="spin" /><p>正在读取个人资料…</p></div>;
  if (!form) return <div className="account-profile-state"><p className="account-profile-error" role="alert">{error || "个人资料暂不可用"}</p><button className="btn btn-secondary" onClick={() => setVersion(value => value + 1)}>重新读取</button></div>;
  const years = [...new Set([form.examYear, ...Array.from({ length: 4 }, (_, index) => String(new Date().getFullYear() - 1 + index)), "其他"].filter(Boolean))];
  return <form className="account-profile-form" onSubmit={save}>
    <div className="account-profile-head">
      <div className="account-profile-avatar">{form.avatar ? <img src={form.avatar} alt="个人头像" /> : <UserRound size={30} />}</div>
      <div><h4>{form.nickname || "学习者"}</h4><label className="btn btn-secondary account-profile-upload"><Camera size={14} />更换头像<input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving} onChange={event => void upload(event.target.files?.[0])} /></label></div>
    </div>
    <fieldset className="account-profile-grid" disabled={saving}>
      <label className="account-profile-field">昵称<input className="input" required maxLength={80} value={form.nickname} onChange={event => set("nickname", event.target.value)} /></label>
      <label className="account-profile-field">考研年份<select className="input" value={form.examYear} onChange={event => set("examYear", event.target.value)}><option value="">请选择</option>{years.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="account-profile-field">所在省份<input className="input" maxLength={100} placeholder="例如：浙江省" value={form.province} onChange={event => set("province", event.target.value)} /></label>
      <label className="account-profile-field">报考专业<input className="input" maxLength={100} value={form.major} onChange={event => set("major", event.target.value)} /></label>
      <label className="account-profile-field">备考状态<select className="input" value={form.preparationStatus} onChange={event => set("preparationStatus", event.target.value)}><option value="">请选择</option>{preparationStatuses.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="account-profile-field">开始复习月份<select className="input" value={form.reviewMonth} onChange={event => set("reviewMonth", event.target.value)}><option value="">请选择</option>{reviewMonths.map(value => <option key={value}>{value}</option>)}</select></label>
    </fieldset>
    <button className="btn btn-primary" disabled={saving}><Save size={15} />{saving ? "正在保存…" : "保存个人资料"}</button>
    {notice && <p role="status" className="account-profile-notice">{notice}</p>}
    {error && <p role="alert" className="account-profile-error">{error}</p>}
  </form>;
}

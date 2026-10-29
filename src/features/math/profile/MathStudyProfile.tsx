import { useEffect, useState } from "react";
import { Camera, LoaderCircle, Save, UserRound } from "lucide-react";
import { api } from "../../../shared/api/client";
import { useSession } from "../../../shared/auth/session";
import { retryStudySync } from "../../learning/state/store";
import { createProfileAvatar } from "./profile-avatar";
import type { MathProfile } from "../../../../shared/math-profile.mjs";
import type { MathRow } from "../api/math";
import "./math-account.css";

export default function MathStudyProfile({ user }: { user: MathRow }) {
  const { refresh } = useSession();
  const [form, setForm] = useState<MathProfile>();
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    api<{ profile: MathProfile }>("/api/learning/profile/math")
      .then(value => { if (active) setForm(value.profile); })
      .catch(cause => { if (active) setError(cause.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [user.StuID, version]);
  function set<K extends keyof MathProfile>(key: K, value: MathProfile[K]) {
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
      const value = await api<{ profile: MathProfile }>("/api/learning/profile/math", { method: "PUT", body: JSON.stringify(form) });
      setForm(value.profile);
      await retryStudySync();
      await refresh();
      setNotice("个人资料已保存，下次登录可继续使用。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "资料保存失败，请重试。"); }
    finally { setSaving(false); }
  }
  if (busy) return <div className="math-state" role="status"><LoaderCircle className="spin" /><p>正在读取个人资料…</p></div>;
  if (!form) return <div className="math-state"><p className="math-error-text" role="alert">{error || "个人资料暂不可用"}</p><button className="btn btn-secondary" onClick={() => setVersion(value => value + 1)}>重新读取</button></div>;
  const years = [...new Set([form.examYear, ...Array.from({ length: 4 }, (_, index) => String(new Date().getFullYear() - 1 + index)), "其他"].filter(Boolean))];
  return <form className="math-study-profile" onSubmit={save}>
    <div className="math-profile-head">
      <div className="math-connect-icon">{form.avatar ? <img src={form.avatar} alt="个人头像" /> : <UserRound size={30} />}</div>
      <div><h4>{form.nickname || "数学学习者"}</h4><label className="btn btn-secondary macc-upload"><Camera size={14} />更换头像<input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving} onChange={event => void upload(event.target.files?.[0])} /></label></div>
    </div>
    <fieldset className="macc-grid" disabled={saving}>
      <label className="math-field">昵称<input className="input" required maxLength={80} value={form.nickname} onChange={event => set("nickname", event.target.value)} /></label>
      <label className="math-field">数学类别<select className="input" value={form.subject} onChange={event => set("subject", event.target.value as MathProfile["subject"])}>{["数一", "数二", "数三"].map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="math-field">考研年份<select className="input" value={form.examYear} onChange={event => set("examYear", event.target.value)}><option value="">请选择</option>{years.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="math-field">所在省份<input className="input" maxLength={100} placeholder="例如：浙江省" value={form.province} onChange={event => set("province", event.target.value)} /></label>
      <label className="math-field">报考专业<input className="input" maxLength={100} value={form.major} onChange={event => set("major", event.target.value)} /></label>
      <label className="math-field">备考状态<select className="input" value={form.preparationStatus} onChange={event => set("preparationStatus", event.target.value)}><option value="">请选择</option>{["在职", "应届", "脱产"].map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="math-field">开始复习月份<select className="input" value={form.reviewMonth} onChange={event => set("reviewMonth", event.target.value)}><option value="">请选择</option>{Array.from({ length: 12 }, (_, index) => `${index + 1}月`).map(value => <option key={value}>{value}</option>)}</select></label>
    </fieldset>
    <button className="btn btn-primary" disabled={saving}><Save size={15} />{saving ? "正在保存…" : "保存个人资料"}</button>
    {notice && <p role="status" className="math-account-notice">{notice}</p>}
    {error && <p role="alert" className="math-error-text">{error}</p>}
  </form>;
}

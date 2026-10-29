import { useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, UserRound } from "lucide-react";
import { api } from "../../../shared/api/client";
import type { MathProfile } from "../../../../shared/math-profile.mjs";
import "./user-learning-profile.css";

export default function UserLearningProfile({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<MathProfile>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api<{ profile: MathProfile }>(`/api/admin/users/${encodeURIComponent(userId)}/profile/math`)
      .then(value => { if (active) setProfile(value.profile); })
      .catch(cause => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, version]);
  const fields: [string, string | undefined][] = [
    ["数学类别", profile?.subject], ["考研年份", profile?.examYear],
    ["所在省份", profile?.province], ["报考专业", profile?.major],
    ["备考状态", profile?.preparationStatus], ["开始复习月份", profile?.reviewMonth],
  ];
  return <section className="admin-learning-profile" aria-label="用户学习资料">
    <div className="admin-learning-profile-heading"><h3>学习资料</h3><button type="button" className="text-link" disabled={loading} onClick={() => setVersion(value => value + 1)} aria-label="刷新用户学习资料"><RefreshCw size={13} />刷新</button></div>
    {loading ? <p className="admin-learning-profile-status" role="status"><LoaderCircle size={15} className="spin" />正在读取资料…</p> : error ? <p className="admin-form-error" role="alert">{error}</p> : profile && <>
      <div className="admin-learning-profile-identity"><span>{profile.avatar ? <img src={profile.avatar} alt="用户头像" /> : <UserRound size={21} />}</span><div><small>用户昵称</small><strong>{profile.nickname}</strong></div></div>
      <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "尚未填写"}</dd></div>)}</dl>
    </>}
  </section>;
}

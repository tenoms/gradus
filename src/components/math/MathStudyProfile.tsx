import { studyFetch } from "../../lib/api";
import { useEffect, useState } from "react";
import { Camera, LoaderCircle, Save, UserRound } from "lucide-react";
import { useSession } from "../../lib/session";
import {
  mathCommand,
  mathData,
  mathGet,
  mathPost,
  mathRows,
} from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import { studyProfilePayload } from "./account-model.mjs";
import "./math-account.css";

export default function MathStudyProfile({ user }: { user: MathRow }) {
  const { refresh } = useSession(),
    [form, setForm] = useState<MathRow>({}),
    [provinces, setProvinces] = useState<MathRow[]>([]),
    [schools, setSchools] = useState<string[]>([]),
    [majors, setMajors] = useState<string[]>([]),
    [busy, setBusy] = useState(true),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [nickname, setNickname] = useState(String(user.UserNick || "")),
    [avatar, setAvatar] = useState(String(user.HeadImg || "")),
    [subject, setSubject] = useState(String(user.SubjectType || "数一"));
  const stuid = String(user.StuID || "");
  useEffect(() => {
    let active = true;
    Promise.allSettled([
      mathGet("/api/sys_users_info/GetListByAll", { StuID: stuid }),
      mathCommand("GetSysProvinceList"),
      mathCommand("GetDryRunInfoList", { yuanxiao: "", neirong: "" }),
    ])
      .then((results) => {
        if (!active) return;
        const profile = results[0];
        if (profile.status === "rejected") {
          setError(profile.reason.message);
          return;
        }
        setForm({
          UserName: user.UserNick || "",
          IsCrossCourse: 1,
          IsRealizeCourse: -1,
          IsInActivities: -1,
          ...mathRows(profile.value)[0],
        });
        if (results[1].status === "fulfilled")
          setProvinces(mathRows(results[1].value));
        if (results[2].status === "fulfilled") {
          setSchools([
            ...new Set(
              mathRows(results[2].value)
                .map((r) => String(r.f_xuexiao || ""))
                .filter(Boolean),
            ),
          ]);
          setMajors([
            ...new Set(
              mathRows(results[2].value, 1)
                .map((r) => String(r.neirong || ""))
                .filter(Boolean),
            ),
          ]);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [stuid]);
  const set = (key: string, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));
  const upload = async (file?: File) => {
    if (!file) return;
    setSaving(true);
    setNotice("");
    try {
      const data = new FormData();
      data.append("file", file);
      const response = await studyFetch(
          "/api/platform/math/upload?path=/api/sys_attachment/LayuiUpImg",
          { method: "POST", credentials: "same-origin", body: data },
        ),
        result = await response.json();
      if (!response.ok) throw new Error(result.error || "头像上传失败");
      const raw = mathData(result),
        url =
          typeof raw === "string"
            ? raw
            : raw?.src || raw?.Path || raw?.path || raw?.url;
      if (typeof url !== "string" || !/^https?:\/\//.test(url))
        throw new Error("平台没有返回可用头像地址");
      setAvatar(url);
      setNotice("头像已上传，保存资料后生效。");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      await mathPost("/api/sys_users/UpdateUserNickName", {
        StuID: stuid,
        UserNick: nickname.trim(),
        HeadImg: avatar,
      });
      await mathPost("/api/sys_users/Inner_sys_users", {
        ID: user.ID,
        StuID: stuid,
        UserNick: nickname.trim(),
        HeadImg: avatar,
        SubjectType: subject,
        UpdateColumns: "ID,UserNick,HeadImg,SubjectType",
      });
      await mathPost(
        "/api/sys_users_info/Inner_sys_users_info",
        studyProfilePayload(form, stuid),
      );
      await refresh();
      setNotice(
        "个人资料与考研档案已同步。资料奖励按平台规则发放，可在积分流水查看。",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  if (busy)
    return (
      <div className="math-state">
        <LoaderCircle className="spin" />
        <p>正在读取个人档案…</p>
      </div>
    );
  if (error) return <p className="math-error-text">{error}</p>;
  const years = [
    ...new Set(
      [
        String(form.Score2 || ""),
        ...Array.from({ length: 4 }, (_, i) =>
          String(new Date().getFullYear() - 1 + i),
        ),
        "其他",
      ].filter(Boolean),
    ),
  ];
  const text = (key: string, label: string, list?: string) => (
    <label className="math-field" key={key}>
      {label}
      <input
        className="input"
        value={form[key] ?? ""}
        maxLength={key === "ElseQuestion" ? 1000 : 100}
        list={list}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );
  return (
    <form className="math-study-profile" onSubmit={save}>
      <div className="math-profile-head">
        <div className="math-connect-icon">
          {/^https?:/.test(avatar) ? (
            <img src={avatar} alt="个人头像" />
          ) : (
            <UserRound size={30} />
          )}
        </div>
        <div>
          <h4>{nickname || "数学学习者"}</h4>
          <label className="btn btn-secondary macc-upload">
            <Camera size={14} />
            更换头像
            <input
              type="file"
              accept="image/*"
              disabled={saving}
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </label>
        </div>
      </div>
      <div className="macc-grid">
        <label className="math-field">
          昵称
          <input
            className="input"
            required
            maxLength={30}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>
        <label className="math-field">
          数学类别
          <select
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            {["数一", "数二", "数三"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="math-field">
          考研年份
          <select
            className="input"
            value={form.Score2 || ""}
            onChange={(e) => set("Score2", e.target.value)}
          >
            <option value="">请选择</option>
            {years.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="math-field">
          所在省份
          <select
            className="input"
            value={form.Province || ""}
            onChange={(e) => set("Province", e.target.value)}
          >
            <option value="">请选择</option>
            {form.Province &&
              !provinces.some((r) => r.Value === form.Province) && (
                <option>{form.Province}</option>
              )}
            {provinces.map((r) => (
              <option key={r.Key} value={r.Value}>
                {r.Value}
              </option>
            ))}
          </select>
        </label>
        {text("SchoolName", "本科学校", "macc-schools")}
        {text("TargetSchool", "目标院校", "macc-schools")}
        {text("CourseName", "报考专业", "macc-majors")}
        <label className="math-field">
          备考状态
          <select
            className="input"
            value={form.IsWorkStudy || ""}
            onChange={(e) => set("IsWorkStudy", e.target.value)}
          >
            <option value="">请选择</option>
            {["在职", "应届", "脱产"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="math-field">
          开始复习月份
          <select
            className="input"
            value={form.GoOverTime || ""}
            onChange={(e) => set("GoOverTime", e.target.value)}
          >
            <option value="">请选择</option>
            {Array.from({ length: 12 }, (_, i) => `${i + 1}月`).map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <details className="macc-more">
        <summary>补充备考资料</summary>
        <div className="macc-grid">
          {text("UserName", "姓名")}
          {text("QQ", "QQ")}
          {text("TargetScore", "目标分数")}
          <label className="math-field">
            跨专业报考
            <select
              className="input"
              value={form.IsCrossCourse ?? 1}
              onChange={(e) => set("IsCrossCourse", Number(e.target.value))}
            >
              <option value={1}>是</option>
              <option value={0}>否</option>
            </select>
          </label>
          {text("UseRestsApp", "同时使用的学习应用")}
        </div>
        {text("ElseQuestion", "其他备考问题")}
      </details>
      <datalist id="macc-schools">
        {schools.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="macc-majors">
        {majors.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <button className="btn btn-primary" disabled={saving}>
        <Save size={15} />
        {saving ? "正在同步…" : "保存个人资料与档案"}
      </button>
      {notice && (
        <p role="status" className="math-account-notice">
          {notice}
        </p>
      )}
    </form>
  );
}

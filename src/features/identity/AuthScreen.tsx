import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Check, CircleAlert, GraduationCap, LoaderCircle, Settings2, ShieldCheck, Target, Users } from "lucide-react";
import { api } from "../../shared/api/client";
import type { ApiSpace, Session } from "../../shared/api/client";
import "./identity.css";

export default function AuthScreen({ onAuthenticated, space = "learning" }: { onAuthenticated: (session: Session) => void; space?: ApiSpace }) {
  const management = space === "admin";
  const [setup, setSetup] = useState<boolean>();
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const [system, registration] = await Promise.all([api<{ setupRequired: boolean }>("/api/system/setup"), management ? Promise.resolve({ registrationEnabled: false }) : api<{ registrationEnabled: boolean }>("/api/system/registration")]);
      setSetup(system.setupRequired); setRegistrationEnabled(registration.registrationEnabled);
      if (!registration.registrationEnabled) setRegistering(false);
    }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void load(); }, []);
  const initializing = setup && management;
  const needsAdministrator = setup && !management;
  return <main className={`identity-screen ${management ? "management-auth" : "learning-auth"}`}>
    <section className="identity-story">
      <a className="identity-brand" href={management ? "/admin/" : "/learn/"}><GraduationCap size={36} /><span>知序 <small>{management ? "Admin" : "Study"}</small></span></a>
      <div className="identity-story-copy">
        <p className="identity-eyebrow">{management ? "YOUR LEARNING OPERATIONS" : "LEARN WITH PURPOSE"}</p>
        <h1>{management ? <>让管理清晰，<br />让学习有序。</> : <>让知识有序，<br />让进步发生。</>}</h1>
        <p>{management ? <>连接学习者、学习平台与每一天的进步。<br />在独立的管理空间维护整个系统。</> : <>从一道题的理解，到一段完整的学习旅程。<br />在属于你的空间里，专注下一步。</>}</p>
        <div className="identity-features">
          {management ? <><span><Users size={20} />管理用户与学习账号的分配</span><span><Settings2 size={20} />配置 YYB 与两学科学习平台</span><span><ShieldCheck size={20} />独立管理登录，记录每次重要操作</span></> : <><span><BookOpen size={20} />数学与计算机，一个学习入口</span><span><Target size={20} />题目、解析和复习，放在同一张书桌</span><span><ShieldCheck size={20} />独立账号，跨设备继续计划与记录</span></>}
        </div>
      </div>
      <p className="identity-story-footer">学有所序 · 行有所至 <span>{management ? "SYSTEM MANAGEMENT" : "WEB LEARNING SPACE"}</span></p>
    </section>
    <section className="identity-form-side">
      <div className="identity-form-wrap">
        <div className="identity-form-icon"><GraduationCap size={32} /></div>
        {setup === undefined ? <>
          <h2>正在读取{management ? "管理" : "学习"}空间</h2>
          {error ? <><p className="error-banner" role="alert">{error}</p><button className="btn btn-primary" onClick={load}>重新读取</button></> : <LoaderCircle className="spin" aria-label="加载中" />}
        </> : needsAdministrator ? <>
          <p className="eyebrow">WELCOME TO STUDY</p><h2>空间即将就绪</h2><p className="identity-description">系统尚未初始化，请由管理员创建管理账号并配置学习平台。</p><a className="btn btn-primary full-width" href="/admin/">前往初始化管理空间<ArrowRight size={17} /></a>
        </> : <>
          <p className="eyebrow">{initializing ? "欢迎创建你的管理空间" : management ? "ADMINISTRATOR ACCESS" : registering ? "开始你的学习旅程" : "WELCOME BACK"}</p>
          <h2>{initializing ? "创建首位管理员" : management ? "登录管理空间" : registering ? "注册学习账号" : "登录学习空间"}</h2>
          <p className="identity-description">{initializing ? "创建后即可配置平台、管理用户和分配学习账号。" : management ? "使用管理员身份维护系统。管理与学习分别登录。" : registering ? "创建账号即可学习，计划与学习记录保存在你的账号下。" : "使用学习账号，继续学习。"}</p>
          <form onSubmit={async e => {
            e.preventDefault(); setBusy(true); setError("");
            try {
              if (registering && password !== confirmPassword) throw new Error("两次输入的密码不一致。");
              const session = await api<Session>(initializing ? "/api/system/setup" : registering ? "/api/learning/auth/register" : `/api/${space}/auth/login`, { method: "POST", body: JSON.stringify({ username, password, ...(initializing || registering ? { displayName } : {}) }) });
              setPassword(""); setConfirmPassword(""); onAuthenticated(session);
            } catch (e) { setError((e as Error).message); }
            finally { setBusy(false); }
          }}>
            {(initializing || registering) && <label className="field-label">你的称呼<input className="input" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={80} required autoComplete="name" placeholder={initializing ? "例如：学习管理员" : "希望大家怎样称呼你"} disabled={busy} /></label>}
            <label className="field-label">用户名<input className="input" value={username} onChange={e => setUsername(e.target.value)} minLength={3} maxLength={40} pattern={"[a-zA-Z0-9][a-zA-Z0-9_.\\-]{2,39}"} required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="输入用户名" disabled={busy} /></label>
            <label className="field-label">密码<input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={initializing || registering ? 10 : undefined} maxLength={256} required autoComplete={initializing || registering ? "new-password" : "current-password"} placeholder={initializing || registering ? "至少 10 位字符" : "输入密码"} disabled={busy} /></label>
            {registering && <label className="field-label">确认密码<input className="input" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} minLength={10} maxLength={256} required autoComplete="new-password" placeholder="再次输入密码" disabled={busy} /></label>}
            {error && <div className="error-banner" role="alert"><CircleAlert size={17} /><span>{error}</span></div>}
            <button className="btn btn-primary full-width" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : null}{busy ? "正在进入…" : initializing ? "创建并进入管理空间" : management ? "进入管理空间" : registering ? "注册并开始学习" : "进入学习空间"}<ArrowRight size={17} /></button>
          </form>
          {!management && registrationEnabled && <button type="button" className="identity-space-link" disabled={busy} onClick={() => { setRegistering(value => !value); setError(""); setPassword(""); setConfirmPassword(""); }}>{registering ? "已有账号？返回登录" : "还没有账号？注册学习账号"}<ArrowRight size={14} /></button>}
          <div className="identity-help"><Check size={16} /><p>{initializing ? "请在向其他人开放服务前完成初始化。创建后将关闭此入口。" : management ? "管理权限由系统管理员分配，请妥善保管登录凭据。" : registering ? "无需邮箱验证。创建后即可进入学习空间。" : registrationEnabled ? "忘记密码时，请联系学习空间管理员。" : "还没有账号或忘记密码？请联系学习空间管理员。"}</p></div>
        </>}
        <a className="identity-space-link" href={management ? "/learn/" : "/admin/"}>{management ? "前往学习空间" : "管理员登录"}<ArrowRight size={14} /></a>
      </div>
      <p className="identity-privacy">{management ? "独立管理会话 · 权限由服务端核验" : "你的计划与学习活动随账号保存"}</p>
    </section>
  </main>;
}

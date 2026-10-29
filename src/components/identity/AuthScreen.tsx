import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Check, CircleAlert, Layers3, LoaderCircle, ShieldCheck, Target } from "lucide-react";
import { api } from "../../lib/api";
import type { Session } from "../../lib/api";
import "./identity.css";

export default function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  const [setup, setSetup] = useState<boolean>();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setError("");
    try { setSetup((await api<{ setupRequired: boolean }>("/api/system/setup")).setupRequired); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void load(); }, []);
  return <main className="identity-screen">
    <section className="identity-story">
      <a className="identity-brand" href="/"><Layers3 size={30} /><span>知序 <small>Study</small></span></a>
      <div className="identity-story-copy">
        <p className="identity-eyebrow">LEARN WITH PURPOSE</p>
        <h1>让知识有序，<br />让进步发生。</h1>
        <p>从一道题的理解，到一段完整的学习旅程。<br />在属于你的空间里，专注下一步。</p>
        <div className="identity-features">
          <span><BookOpen size={20} />数学与计算机，一个学习入口</span>
          <span><Target size={20} />题目、解析和复习，放在同一张书桌</span>
          <span><ShieldCheck size={20} />独立账号，跨设备继续计划与记录</span>
        </div>
      </div>
      <p className="identity-story-footer">学有所序 · 行有所至 <span>WEB LEARNING SPACE</span></p>
    </section>
    <section className="identity-form-side">
      <div className="identity-form-wrap">
        <div className="identity-form-icon"><Layers3 size={25} /></div>
        {setup === undefined ? <>
          <h2>正在连接学习空间</h2>
          {error ? <><p className="error-banner" role="alert">{error}</p><button className="btn btn-primary" onClick={load}>重新连接</button></> : <LoaderCircle className="spin" aria-label="加载中" />}
        </> : <>
          <p className="eyebrow">{setup ? "欢迎创建你的学习空间" : "WELCOME BACK"}</p>
          <h2>{setup ? "创建首位管理员" : "登录知序"}</h2>
          <p className="identity-description">{setup ? "完成初始化后，就可以创建学习账号、分配课程连接并管理整个空间。" : "使用管理员分配的账号，继续你的学习。"}</p>
          <form onSubmit={async e => {
            e.preventDefault(); setBusy(true); setError("");
            try {
              const session = await api<Session>(setup ? "/api/system/setup" : "/api/auth/login", { method: "POST", body: JSON.stringify({ username, password, ...(setup ? { displayName } : {}) }) });
              setPassword("");
              onAuthenticated(session);
            } catch (e) { setError((e as Error).message); }
            finally { setBusy(false); }
          }}>
            {setup && <label className="field-label">你的称呼<input className="input" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={80} required autoComplete="name" placeholder="例如：学习管理员" disabled={busy} /></label>}
            <label className="field-label">用户名<input className="input" value={username} onChange={e => setUsername(e.target.value)} minLength={3} maxLength={40} pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{2,39}" required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="输入用户名" disabled={busy} /></label>
            <label className="field-label">密码<input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={setup ? 10 : undefined} maxLength={256} required autoComplete={setup ? "new-password" : "current-password"} placeholder={setup ? "至少 10 位字符" : "输入密码"} disabled={busy} /></label>
            {error && <div className="error-banner" role="alert"><CircleAlert size={17} /><span>{error}</span></div>}
            <button className="btn btn-primary full-width" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : null}{busy ? "正在进入…" : setup ? "创建并进入管理端" : "进入学习空间"}<ArrowRight size={17} /></button>
          </form>
          <div className="identity-help"><Check size={16} /><p>{setup ? "请在向其他人开放服务前完成初始化。创建后将关闭此入口。" : "还没有账号或忘记密码？请联系学习空间管理员。"}</p></div>
        </>}
      </div>
      <p className="identity-privacy">你的计划与学习活动随账号保存</p>
    </section>
  </main>;
}

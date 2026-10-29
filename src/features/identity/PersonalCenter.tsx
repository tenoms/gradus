import { Suspense, lazy, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, LoaderCircle, LogOut, UserRound } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../shared/api/client";
import { useSession } from "../../shared/auth/session";
import MathLearningPlan, { MathPreparationSettings } from "../math/preparation/MathLearningPlan";
import MathAccountTools from "../math/profile/MathAccountTools";
import MathQuestionReader from "../math/questions/MathQuestionReader";
import type { MathRow } from "../math/api/math";
import PersonalLearningAccount from "./AccountConnection";
import PasswordSettings from "./PasswordSettings";
import AccountProfile from "./AccountProfile";
import "../math/MathWorkspace.css";
import "./personal-center.css";

const ComputerLearningSettings = lazy(() => import("../computer/ComputerWorkspace").then(module => ({ default: module.ComputerLearningSettings })));
const sections = { account: "我的账号", math: "考研数学", computer: "计算机 408", settings: "学习设置", source: "小程序学习账号" };

export default function PersonalCenter({ settings }: { settings: ReactNode }) {
  const { session, refresh } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = Object.hasOwn(sections, params.get("tab") || "") ? params.get("tab") as keyof typeof sections : "account";
  const [mathTab, setMathTab] = useState("备考设置");
  const [question, setQuestion] = useState<MathRow>();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const stuid = session.user?.id || "";
  const user = { ...session.platforms.math.user, ID: stuid, StuID: stuid, UserNick: session.platforms.math.user?.UserNick || session.user?.displayName || "" };
  return <MathLearningPlan key={session.user?.id}>
    <div className="personal-center math-workspace">
      <h1 className="sr-only">个人中心</h1>
      <section className="panel personal-identity"><span className="personal-avatar">{session.user?.avatar ? <img src={session.user.avatar} alt="个人头像" /> : <UserRound size={26} />}</span><div><strong>{session.user?.displayName || session.user?.username}</strong><p>{session.user?.username} · 学习账号</p></div><button className="btn btn-secondary" disabled={loggingOut} onClick={async () => { setLoggingOut(true); try { await api("/api/auth/logout", { method: "POST" }); await refresh(); } catch (error) { setError((error as Error).message); } finally { setLoggingOut(false); } }}><LogOut size={15} />退出账号</button></section>
      <nav className="panel personal-tabs tabs" aria-label="个人中心栏目">{Object.entries(sections).map(([id, name]) => <button key={id} className={tab === id ? "active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => { setQuestion(undefined); setParams({ tab: id }); }}>{name}</button>)}</nav>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {tab === "account" ? <>
        <section className="panel settings-panel"><h2>个人资料</h2><p className="muted">用于当前 Web 学习账号，随账号保存。</p><AccountProfile userId={stuid} /></section>
        <PasswordSettings />
      </> : tab === "source" ? <PersonalLearningAccount /> : tab === "settings" ? settings : tab === "computer" ? <Suspense fallback={<p className="loading-state"><LoaderCircle className="spin" size={20} />正在读取自选科目…</p>}><ComputerLearningSettings /></Suspense> : <>
        <div className="tabs personal-math-tabs">{["备考设置", "学习记录", "学习榜单"].map(name => <button key={name} className={mathTab === name ? "active" : ""} onClick={() => { setQuestion(undefined); setMathTab(name); }}>{name}</button>)}</div>
        {mathTab === "备考设置" ? <MathPreparationSettings /> : question ? <><button className="math-back" onClick={() => setQuestion(undefined)}><ArrowLeft size={16} />返回个人中心</button><MathQuestionReader row={question} stuid={stuid} /></> : <section className="panel personal-math-content"><MathAccountTools key={`${mathTab}-${stuid}`} tab={mathTab} user={user} onQuestion={setQuestion} /></section>}
      </>}

    </div>
  </MathLearningPlan>;
}

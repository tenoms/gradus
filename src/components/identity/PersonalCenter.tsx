import { Suspense, lazy, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, LoaderCircle, LogOut, UserRound } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useSession } from "../../lib/session";
import MathLearningPlan, { MathPreparationSettings } from "../math/MathLearningPlan";
import MathAccountTools from "../math/MathAccountTools";
import MathQuestionReader from "../math/MathQuestionReader";
import type { MathRow } from "../../platforms/math";
import PersonalLearningAccount from "./AccountConnection";
import PasswordSettings from "./PasswordSettings";
import "../../pages/MathWorkspace.css";
import "./personal-center.css";

const ComputerAccount = lazy(() => import("../../pages/ComputerWorkspace").then(module => ({ default: module.ComputerAccount })));
const sections = { account: "我的账号", math: "考研数学", computer: "计算机 408", settings: "学习设置", source: "小程序学习账号" };

export default function PersonalCenter({ settings }: { settings: ReactNode }) {
  const { session, refresh } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = Object.hasOwn(sections, params.get("tab") || "") ? params.get("tab") as keyof typeof sections : "account";
  const [mathTab, setMathTab] = useState("个人资料");
  const [question, setQuestion] = useState<MathRow>();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const stuid = session.user?.id || "";
  const user = { ...session.platforms.math.user, ID: stuid, StuID: stuid, UserNick: session.platforms.math.user?.UserNick || session.user?.displayName || "" };
  return <MathLearningPlan key={session.user?.id}>
    <div className="personal-center math-workspace">
      <h1 className="sr-only">个人中心</h1>
      <section className="panel personal-identity"><span className="personal-avatar"><UserRound size={26} /></span><div><strong>{session.user?.displayName || session.user?.username}</strong><p>{session.user?.username} · 学习账号</p></div><button className="btn btn-secondary" disabled={loggingOut} onClick={async () => { setLoggingOut(true); try { await api("/api/auth/logout", { method: "POST" }); await refresh(); } catch (error) { setError((error as Error).message); } finally { setLoggingOut(false); } }}><LogOut size={15} />退出账号</button></section>
      <nav className="panel personal-tabs tabs" aria-label="个人中心栏目">{Object.entries(sections).map(([id, name]) => <button key={id} className={tab === id ? "active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => { setQuestion(undefined); setParams({ tab: id }); }}>{name}</button>)}</nav>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {tab === "account" ? <>
        <section className="panel settings-panel"><h2>学习账号</h2><div className="personal-form-grid"><div><strong>用户名</strong><p>{session.user?.username}</p></div><div><strong>显示名称</strong><p>{session.user?.displayName}</p></div></div><p className="muted">更换设备后，仍可继续当前账号的计划、答题、笔记和复习记录。</p></section>
        <PasswordSettings />
      </> : tab === "source" ? <PersonalLearningAccount /> : tab === "settings" ? settings : tab === "computer" ? <Suspense fallback={<p className="loading-state"><LoaderCircle className="spin" size={20} />正在读取计算机资料…</p>}><ComputerAccount /></Suspense> : <>
        <div className="tabs personal-math-tabs">{["个人资料", "备考设置", "学习记录", "学习榜单"].map(name => <button key={name} className={mathTab === name ? "active" : ""} onClick={() => { setQuestion(undefined); setMathTab(name); }}>{name}</button>)}</div>
        {mathTab === "备考设置" ? <MathPreparationSettings /> : question ? <><button className="math-back" onClick={() => setQuestion(undefined)}><ArrowLeft size={16} />返回个人中心</button><MathQuestionReader row={question} stuid={stuid} /></> : <section className="panel personal-math-content"><MathAccountTools key={`${mathTab}-${stuid}`} tab={mathTab} user={user} onQuestion={setQuestion} /></section>}
      </>}

    </div>
  </MathLearningPlan>;
}

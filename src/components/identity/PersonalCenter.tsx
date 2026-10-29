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
import AccountConnection from "./AccountConnection";
import "../../pages/MathWorkspace.css";
import "./personal-center.css";

const ComputerAccount = lazy(() => import("../../pages/ComputerWorkspace").then(module => ({ default: module.ComputerAccount })));
const sections = { connection: "账号与连接", math: "考研数学", computer: "计算机 408", settings: "学习设置" };

export default function PersonalCenter({ settings }: { settings: ReactNode }) {
  const { session, refresh } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = Object.hasOwn(sections, params.get("tab") || "") ? params.get("tab") as keyof typeof sections : "connection";
  const [mathTab, setMathTab] = useState("个人资料");
  const [question, setQuestion] = useState<MathRow>();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const user = session.platforms.math.user || {};
  const stuid = String(user.StuID || "");
  return <MathLearningPlan key={session.user?.id}>
    <div className="personal-center math-workspace">
      <h1 className="sr-only">个人中心</h1>
      <section className="panel personal-identity"><span className="personal-avatar"><UserRound size={26} /></span><div><strong>{session.user?.displayName || session.user?.username}</strong><p>{session.user?.username} · 学习账号</p></div><button className="btn btn-secondary" disabled={loggingOut} onClick={async () => { setLoggingOut(true); try { await api("/api/auth/logout", { method: "POST" }); await refresh(); } catch (error) { setError((error as Error).message); } finally { setLoggingOut(false); } }}><LogOut size={15} />退出账号</button></section>
      <nav className="panel personal-tabs tabs" aria-label="个人中心栏目">{Object.entries(sections).map(([id, name]) => <button key={id} className={tab === id ? "active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => { setQuestion(undefined); setParams({ tab: id }); }}>{name}</button>)}</nav>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {tab === "connection" ? <AccountConnection /> : tab === "settings" ? settings : tab === "computer" ? session.platforms.computer.connected ? <Suspense fallback={<p className="loading-state"><LoaderCircle className="spin" size={20} />正在读取计算机资料…</p>}><ComputerAccount /></Suspense> : <ConnectNotice onConnect={() => setParams({ tab: "connection" })} /> : <>
        <div className="tabs personal-math-tabs">{["个人资料", "备考设置", "学习记录", "学习榜单"].map(name => <button key={name} className={mathTab === name ? "active" : ""} onClick={() => { setQuestion(undefined); setMathTab(name); }}>{name}</button>)}</div>
        {mathTab === "备考设置" ? <MathPreparationSettings /> : !session.platforms.math.connected ? <ConnectNotice onConnect={() => setParams({ tab: "connection" })} /> : question ? <><button className="math-back" onClick={() => setQuestion(undefined)}><ArrowLeft size={16} />返回个人中心</button><MathQuestionReader row={question} stuid={stuid} /></> : <section className="panel personal-math-content"><MathAccountTools key={`${mathTab}-${stuid}`} tab={mathTab} user={user} onQuestion={setQuestion} /></section>}
      </>}
    </div>
  </MathLearningPlan>;
}

function ConnectNotice({ onConnect }: { onConnect: () => void }) {
  return <div className="panel empty-state"><UserRound size={28} /><p>连接学习平台后查看资料与记录。</p><button className="btn btn-primary" onClick={onConnect}>管理账号与连接</button></div>;
}

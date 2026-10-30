import { Suspense, lazy, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, LoaderCircle, LogOut, UserRound } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../shared/api/client";
import { useSession } from "../../shared/auth/session";
import { WorkspaceBar, WorkspaceTabs } from "../../shared/ui/workspace-bar/WorkspaceBar";
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
      <WorkspaceBar label="个人中心工具" navigation={<WorkspaceTabs label="个人中心栏目" items={Object.entries(sections).map(([value, label]) => ({value, label}))} value={tab} onChange={value => { setQuestion(undefined); setParams({tab: value}); }} />}>
        <div className="personal-toolbar-identity"><span className="personal-avatar">{session.user?.avatar ? <img src={session.user.avatar} alt="个人头像" /> : <UserRound size={19} />}</span><div><strong>{session.user?.displayName || session.user?.username}</strong><small>{session.user?.username}</small></div></div>
        <button className="btn btn-secondary" disabled={loggingOut} onClick={async () => { setLoggingOut(true); try { await api("/api/auth/logout", { method: "POST" }); await refresh(); } catch (error) { setError((error as Error).message); } finally { setLoggingOut(false); } }}><LogOut size={15} />退出账号</button>
      </WorkspaceBar>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {tab === "account" ? <>
        <section className="panel settings-panel"><h2>个人资料</h2><AccountProfile userId={stuid} /></section>
        <PasswordSettings />
      </> : tab === "source" ? <PersonalLearningAccount /> : tab === "settings" ? settings : tab === "computer" ? <Suspense fallback={<p className="loading-state"><LoaderCircle className="spin" size={20} />正在读取自选科目…</p>}><ComputerLearningSettings /></Suspense> : <>
        <WorkspaceTabs label="数学个人中心栏目" items={["备考设置", "学习记录", "学习榜单"].map(value => ({value, label: value}))} value={mathTab} onChange={value => { setQuestion(undefined); setMathTab(value); }} />
        {mathTab === "备考设置" ? <MathPreparationSettings /> : question ? <><button className="math-back" onClick={() => setQuestion(undefined)}><ArrowLeft size={16} />返回个人中心</button><MathQuestionReader row={question} stuid={stuid} /></> : <section className="panel personal-math-content"><MathAccountTools key={`${mathTab}-${stuid}`} tab={mathTab} user={user} onQuestion={setQuestion} /></section>}
      </>}

    </div>
  </MathLearningPlan>;
}

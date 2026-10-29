import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { useSession } from "../../lib/session";
import { setMathPlan, useStudyData, useStudySync } from "../../lib/store";
import { initialMathSubject, mathStages, mathSubjects } from "./learning-plan-model.mjs";

type LearningPlan = { subject: string; stage: string; setSubject: (value: string) => void; setStage: (value: string) => void };
const PlanContext = createContext<LearningPlan>({ subject: "数一", stage: "基础", setSubject: () => {}, setStage: () => {} });
export function useMathLearningPlan() { return useContext(PlanContext); }

export default function MathLearningPlan({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const account = session.platforms.math.user || {};
  const data = useStudyData();
  const sync = useStudySync();
  const plan = data.mathPlan || { subject: initialMathSubject(account.SubjectType), stage: "基础" };
  const [hydrated, setHydrated] = useState(sync.state !== "loading");
  useEffect(() => { if (sync.state !== "loading") setHydrated(true); }, [sync.state]);
  const setSubject = (subject: string) => setMathPlan({ ...plan, subject });
  const setStage = (stage: string) => setMathPlan({ ...plan, stage });
  if (!hydrated && sync.state === "loading") return <div className="math-state"><LoaderCircle className="spin" size={22} /><p>正在读取账号备考设置…</p></div>;
  return <PlanContext.Provider value={{ ...plan, setSubject, setStage }}>{children}</PlanContext.Provider>;
}

export function MathPreparationSettings() {
  const { subject, stage, setSubject, setStage } = useMathLearningPlan();
  const sync = useStudySync();
  return <section className="panel settings-panel">
    <h2>数学备考目标</h2>
    <p className="muted">随账号保存，题库、课程与测评自动沿用。</p>
    <div className="math-plan-settings">
      <label>目标科目<select className="input" value={subject} onChange={e => setSubject(e.target.value)}>{mathSubjects.map(s => <option key={s}>{s}</option>)}</select></label>
      <label>当前阶段<select className="input" value={stage} onChange={e => setStage(e.target.value)}>{mathStages.map(s => <option key={s.name}>{s.name}</option>)}</select></label>
      <p>{mathStages.find(s => s.name === stage)?.description}</p>
    </div>
    <p className="muted" role="status">{sync.state === "error" ? "同步暂未完成，连接恢复后会重试。" : sync.pending ? "正在同步备考设置…" : "备考设置已随账号保存"}</p>
  </section>;
}

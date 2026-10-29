import { useEffect, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, PlayCircle, RefreshCw } from "lucide-react";
import LearningVideo from "../LearningVideo";
import { useSession } from "../../lib/session";
import { computerRequest } from "../../platforms/computer";
import type { ComputerRecord } from "../../platforms/computer";
import { computerNextVideoCount, computerQuestionVideoAllowed, computerQuestionVideoPermission, computerQuestionVideoSource } from "./question-workflow.mjs";
import { computerKnowledgeMajorId } from "./computer-knowledge.mjs";
import "./question-workflow.css";

export default function ComputerQuestionVideo({ question, majorId, examCategory, schoolPermission }: {
  question: ComputerRecord; majorId: string; examCategory: number; schoolPermission?: unknown;
}) {
  const { session } = useSession();
  const source = computerQuestionVideoSource(question);
  const permission = computerQuestionVideoPermission({ majorId: computerKnowledgeMajorId(question, majorId), examCategory, schoolPermission });
  const [state, setState] = useState<"loading" | "allowed" | "denied" | "error">("loading");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const count = useRef<number | null>(null);
  const storageKey = `study:computer:video-count:${session.user?.id || "guest"}:${session.account?.ref || ""}`;
  useEffect(() => {
    if (!source) return;
    let active = true;
    setState("loading"); setError("");
    if (count.current === null) {
      let previous = 0;
      try { previous = Math.max(0, Number(localStorage.getItem(storageKey)) || 0); } catch {}
      // Preserve the mini-program's increment-before-check behavior and its capped counter.
      count.current = computerNextVideoCount(previous);
      try { localStorage.setItem(storageKey, String(count.current)); } catch {}
    }
    async function check() {
      try {
        const authorized = permission
          ? await computerRequest("/api/user/wx/user/isVideoAuth", { permission })
          : false;
        if (active) setState(computerQuestionVideoAllowed(count.current!, authorized) ? "allowed" : "denied");
      } catch (cause) {
        if (active) { setError(cause instanceof Error ? cause.message : "视频授权检查失败"); setState("error"); }
      }
    }
    void check();
    return () => { active = false; };
  }, [source?.url, permission, storageKey, version]);
  if (!source) return null;
  return <section className="computer-question-video-card" aria-label="视频解析">
    <h4><PlayCircle size={18} />视频解析</h4>
    {state === "loading" && <div className="computer-question-video-state" role="status"><LoaderCircle className="spin" size={20} /><span>正在检查视频权限…</span></div>}
    {state === "denied" && <div className="computer-question-video-state"><PlayCircle size={28} /><p>试看额度已用完</p><span>当前账号未开通本学科的视频讲解。</span></div>}
    {state === "error" && <div className="computer-question-video-state"><p role="alert">{error}</p><button className="btn btn-secondary" onClick={() => setVersion(value => value + 1)}><RefreshCw size={15} />重试权限检查</button></div>}
    {state === "allowed" && (source.kind === "media"
      ? <LearningVideo key={source.url} src={source.url} controls playsInline preload="none" aria-label="题目视频解析播放器" />
      : <div className="computer-question-video-state"><PlayCircle size={32} /><p>此视频由原平台页面提供</p><a className="btn btn-secondary" href={source.url} target="_blank" rel="noreferrer">打开视频页面<ExternalLink size={15} /></a></div>)}
  </section>;
}

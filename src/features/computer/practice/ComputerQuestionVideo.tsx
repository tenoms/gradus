import { ExternalLink, PlayCircle } from "lucide-react";
import LearningVideo from "../../../shared/media/LearningVideo";
import type { ComputerRecord } from "../api/computer";
import { computerQuestionVideoSource } from "./question-workflow.mjs";
import "./question-workflow.css";

export default function ComputerQuestionVideo({ question }: { question: ComputerRecord }) {
  const source = computerQuestionVideoSource(question);
  if (!source) return null;
  return <section className="computer-question-video-card" aria-label="视频解析">
    <h4><PlayCircle size={18} />视频解析</h4>
    {source.kind === "media"
      ? <LearningVideo key={source.url} src={source.url} controls playsInline preload="none" aria-label="题目视频解析播放器" />
      : <div className="computer-question-video-state"><PlayCircle size={32} /><p>此视频由原平台页面提供</p><a className="btn btn-secondary" href={source.url} target="_blank" rel="noreferrer">打开视频页面<ExternalLink size={15} /></a></div>}
  </section>;
}

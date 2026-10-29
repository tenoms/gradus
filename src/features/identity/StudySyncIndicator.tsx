import { Cloud, CloudOff, LoaderCircle, RefreshCw } from "lucide-react";
import { retryStudySync, useStudySync } from "../learning/state/store";

export default function StudySyncIndicator() {
  const sync = useStudySync();
  const busy = sync.state === "loading" || sync.state === "saving";
  const error = sync.state === "error";
  const text = error ? "待同步" : busy ? "同步中" : sync.state === "local" ? "本地记录" : "已同步";
  return <span className={`study-sync-indicator ${error ? "sync-error" : ""}`} title={error ? sync.message : "备考设置、学习计划、目标和 Web 学习活动随账号保存"} role="status">
    {busy ? <LoaderCircle size={15} className="spin" /> : error ? <CloudOff size={15} /> : <Cloud size={15} />}<span>{text}</span>
  </span>;
}

export function StudySyncNotice() {
  const sync = useStudySync();
  if (sync.state !== "error") return null;
  return <div className="error-banner study-sync-notice" role="alert"><CloudOff size={18} /><div><strong>学习记录尚未同步{sync.pending > 0 ? ` · ${sync.pending} 项更改` : ""}</strong><p>{sync.message} 未同步的更改会在连接恢复后重试，请保持页面打开。</p></div><button className="btn btn-secondary" onClick={() => void retryStudySync()}><RefreshCw size={14} />重试同步</button></div>;
}

import { useEffect, useState } from "react";
import { ArrowRight, Check, History } from "lucide-react";
import { useSession } from "../../lib/session";
import { mergeStudyData, useStudySync } from "../../lib/store";
import type { StudyData } from "../../lib/store";
import { validateStudyData } from "../../../shared/study-data.mjs";

export default function LegacyStudyImport() {
  const { session } = useSession();
  const sync = useStudySync();
  const [legacy, setLegacy] = useState<StudyData>();
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setLegacy(undefined); setDone(false); setError("");
    if (!session.account?.ref) return;
    try {
      const raw = localStorage.getItem(`study-space:v1:${session.account.ref}`);
      if (raw) {
        const data = validateStudyData(JSON.parse(raw));
        if (data.tasks.length || data.activities.length) setLegacy(data);
      }
    } catch { setError("旧版记录无法直接读取，可检查 JSON 备份后导入。"); }
  }, [session.user?.id, session.account?.ref]);
  if (!legacy && !error) return null;
  return <section className="panel settings-panel"><h2><History size={17} /> 旧版学习记录</h2><p className="muted">发现当前连接学习账号在此浏览器中的旧版记录。合并后保留当前账号已有记录和目标，原始数据仍留在浏览器。</p>{legacy && <div className="settings-row"><span>{legacy.tasks.length} 项计划 · {legacy.activities.length} 条活动</span><button className="btn btn-secondary" disabled={done || sync.state === "loading"} onClick={() => { try { mergeStudyData(legacy); setDone(true); setError(""); } catch (e) { setError((e as Error).message); } }}>{done ? <Check size={15} /> : <ArrowRight size={15} />}{done ? "已加入同步队列" : "合并到当前账号"}</button></div>}{error && <p role="alert" className="error-banner">{error}</p>}</section>;
}

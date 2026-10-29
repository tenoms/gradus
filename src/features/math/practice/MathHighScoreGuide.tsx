import { invalidateCatalogResources } from "../../../shared/api/client";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, FileText, LoaderCircle, Search } from "lucide-react";
import { mathCommand, mathGet, mathPost, mathRows, mathTitle } from "../api/math";
import type { MathRow } from "../api/math";
import MathModelTraining from "./MathModelTraining";
import { mathMenuTree } from "../preparation/learning-plan-model.mjs";
import { guideStudyPayload } from "./math-model";

function useGuideData(key: string, load: () => Promise<any>) {
  const [data, setData] = useState<any>(), [loading, setLoading] = useState(true), [error, setError] = useState(""), [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setData(undefined);
    load().then(value => { if (active) setData(value); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [key, version]);
  return { data, loading, error, reload: () => { invalidateCatalogResources(); setVersion(v => v + 1); } };
}

export default function MathHighScoreGuide({ stuid }: { stuid: string }) {
  const list = useGuideData("high-score-guides", () => mathCommand("GetBookHighscorealbumList", { IsValid: 1, BusType: "直播模块", SortDesc: "Sort" }, true));
  const progress = useGuideData(`guide-progress-${stuid}`, () => mathGet("/api/book_highscorealbum_studylog/GetListByPage", { StuID: stuid, Type: "直播模块", limit: 1, page: 1, SortDesc: "AddTime Desc" }));
  const [lesson, setLesson] = useState<MathRow>(), [query, setQuery] = useState(""), [notice, setNotice] = useState("");
  const rows = mathRows(list.data);
  const latest = rows.find(row => String(row.ID) === String(mathRows(progress.data)[0]?.BusID));
  const openLesson = (row: MathRow) => {
    setLesson(row); setNotice("");
    void (async () => {
      const current = await mathGet("/api/book_highscorealbum_studylog/GetListByPage", { StuID: stuid, Type: "直播模块", AlbumID: row.BusID, limit: 1, page: 1, SortDesc: "AddTime Desc" });
      await mathPost("/api/book_highscorealbum_studylog/Inner_book_highscorealbum_studylog", guideStudyPayload(stuid, row, mathRows(current)[0]));
      progress.reload();
    })().catch(error => setNotice(`学习位置未保存：${error.message}`));
  };
  if (lesson) return <div className="math-workspace">
    <button className="math-back" onClick={() => { setLesson(undefined); progress.reload(); }}><ArrowLeft size={16} />返回高分指南</button>
    <div className="math-guide-lesson-head"><div><span className="eyebrow">HIGH SCORE GUIDE</span><h2>{mathTitle(lesson)}</h2><p>理解解题技巧，再用配套习题检验方法。</p></div>{/^https?:\/\//.test(String(lesson.Notes || "")) && <a className="btn btn-secondary" href={lesson.Notes} target="_blank" rel="noreferrer"><FileText size={15} />配套讲义</a>}</div>
    {notice && <p className="math-error-text" role="status">{notice}</p>}
    <MathModelTraining key={lesson.ID} stuid={stuid} albumId={lesson.BusID} title={mathTitle(lesson)} />
  </div>;
  const groups = mathMenuTree(rows).map((group): MathRow => ({ ...group, children: (group.children || []).filter((row: MathRow) => !query || `${mathTitle(group)} ${mathTitle(row)}`.includes(query)) })).filter(group => group.children.length);
  return <div className="math-workspace">
    {latest && !progress.error && <div className="panel math-guide-resume"><BookOpen size={24} /><div><small>上次学到</small><strong>{mathTitle(latest)}</strong></div><button className="btn btn-primary" onClick={() => openLesson(latest)}>继续学习<ArrowRight size={15} /></button></div>}
    <div className="panel">
      <div className="math-toolbar"><h3>方法专题</h3><label className="math-search"><Search size={16} /><input aria-label="搜索高分指南" placeholder="搜索考点或解题方法…" value={query} onChange={e => setQuery(e.target.value)} /></label><span className="math-muted">{groups.reduce((sum, group) => sum + group.children.length, 0)} 节精讲</span></div>
      {list.loading ? <div className="math-state"><LoaderCircle className="spin" /><p>正在加载高分指南…</p></div> : list.error ? <div className="math-state math-error"><p>{list.error}</p><button className="btn btn-secondary" onClick={list.reload}>重新加载</button></div> : !groups.length ? <div className="math-state"><BookOpen size={26} /><p>{query ? "没有找到匹配的解题方法" : "暂时没有可用的高分指南"}</p></div> : <div className="math-guide-topics">{groups.map((group, index) => <details key={group.ID} className="math-guide-topic" open={index === 0 || !!query}><summary><span><small>{String(index + 1).padStart(2, "0")}</small>{mathTitle(group)}</span><small>{group.children.length} 节精讲</small></summary><div className="math-content-list">{group.children.map((row: MathRow) => <button key={row.ID} onClick={() => openLesson(row)} disabled={!Number(row.BusID)}><div className="math-list-icon"><BookOpen size={18} /></div><span><strong>{mathTitle(row)}</strong><small>{row.IsVideo ? "视频精讲 · " : "方法精讲 · "}配套习题{row.Notes ? " · 讲义" : ""}</small></span><ArrowRight size={17} /></button>)}</div></details>)}</div>}
    </div>
  </div>;
}

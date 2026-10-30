import { useEffect, useRef, useState } from "react";
import { BookOpen, CircleAlert, Download, Eye, LoaderCircle, RefreshCw } from "lucide-react";
import { api } from "../../shared/api/client";
import { computerSubjects } from "../computer/api/computer";
import { computerHistoryTypes } from "../computer/practice/computer-learning";
import Pagination from "../../shared/ui/pagination/Pagination";
import RichContent from "../../shared/content/RichContent";
import { errorMessage, personalScopes, personalSyncPath, platformNames, syncDate } from "./personal-sync";
import type { ImportedRecord, ImportPage, LearningPlatform, PersonalScope, PersonalSyncStatus, RefreshResult } from "./personal-sync";

type RecordsPage = { records: ImportedRecord[]; pagination: { page: number; pageSize: number; total: number }; hasMore?: boolean };
const dataOf = (record: ImportedRecord): Record<string, any> => record.data || record;
function recordTitle(record: ImportedRecord, scope: PersonalScope, index: number) {
  const data = dataOf(record);
  if (scope === "bookshelf" && ("EBookIDs" in data || "PaperIDs" in data)) return "小程序书架";
  const title = data.title || data.Name || data.name || data.BookName || data.bookName || data.QuestionTitle || data.questionTitle || data.QuestionName || data.exerciseName || data.examinationName || data.examName || data.PaperName || data.paperName || data.CourseName || data.courseName;
  if (title) return String(title).replace(/<[^>]*>/g, " ").trim();
  const questionId = data.QuestionID || data.questionId || data.exerciseId;
  return questionId ? `${personalScopes[scope]} · 题目 ${questionId}` : `${personalScopes[scope]}记录 ${index + 1}`;
}
const unsupported = (result: ImportPage) => result.status === "unsupported" || result.status === "needs_context";

export default function PersonalImportedRecords({ status, onChanged, disabled }: { status: PersonalSyncStatus; onChanged: () => Promise<unknown>; disabled: boolean }) {
  const [platform, setPlatform] = useState<LearningPlatform>("math");
  const [scope, setScope] = useState<PersonalScope>("bookshelf");
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<RecordsPage>();
  const [preview, setPreview] = useState<ImportPage>();
  const [nextSourcePage, setNextSourcePage] = useState<number>();
  const [major, setMajor] = useState(computerSubjects[0].id);
  const [dateFlag, setDateFlag] = useState("1");
  const [examType, setExamType] = useState(3);
  const [mathSubject, setMathSubject] = useState("数一");
  const [mathMode, setMathMode] = useState("章节模式");
  const [mathExam, setMathExam] = useState("真题模式");
  const [historyType, setHistoryType] = useState("books");
  const [contextId, setContextId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lastSelection = useRef<{ key: string; pending: Promise<RefreshResult> | null }>({ key: "", pending: null });
  const canRefresh = !!status.binding && status.settings.enabled && status.settings.scopes.includes(scope);
  const blocked = disabled || !!busy;
  const context = platform === "computer"
    ? { majorId: major, dateFlag, examCategory: 1, examType, ...(scope === "answers" && contextId ? { examRecordId: contextId } : {}) }
    : { BusValue: mathSubject, BusType: mathSubject, Type: mathMode, ExanType: mathExam, historyType, ...(scope === "answers" && contextId ? { QuestionID: contextId } : {}) };
  const scopesKey = status.settings.scopes.slice().sort().join(",");

  async function readRecords(targetPage = page) {
    const query = new URLSearchParams({ platform, scope, page: String(targetPage), pageSize: "20" });
    const result = await api<RecordsPage>(`${personalSyncPath}/records?${query}`);
    setRecords(result);
    return result;
  }
  useEffect(() => {
    let active = true;
    const selection = JSON.stringify([platform, scope, major, dateFlag, examType, mathSubject, mathMode, mathExam, historyType, status.binding?.id, status.settings.enabled, scopesKey]);
    if (lastSelection.current.key !== selection) {
      lastSelection.current = { key: selection, pending: canRefresh && scope !== "answers" ? api<RefreshResult>(`${personalSyncPath}/refresh`, { method: "POST", body: JSON.stringify({ platform, scope, context, page: 1, pageSize: 20 }) }) : null };
    }
    const pendingUpdate = lastSelection.current.pending;
    setBusy("records"); setError(""); setPreview(undefined); setNextSourcePage(undefined); setNotice(""); setRecords(undefined);
    const load = async () => {
      if (pendingUpdate) {
        try {
          const result = await pendingUpdate;
          if (active) {
            if (unsupported(result)) setError(result.message || "暂不支持读取此类记录，请选择其他范围。");
            else { setNextSourcePage(result.hasMore ? result.nextPage || 2 : undefined); setNotice(`当前范围已更新：新增 ${result.added || 0} 条，更新 ${result.updated || 0} 条。`); }
            await onChanged();
          }
        } catch (cause) { if (active) setError(`本次更新未完成：${errorMessage(cause)}。下方继续显示已导入记录。`); }
        finally { if (active && lastSelection.current.key === selection) lastSelection.current.pending = null; }
      }
      const query = new URLSearchParams({ platform, scope, page: String(page), pageSize: "20" });
      const result = await api<RecordsPage>(`${personalSyncPath}/records?${query}`);
      if (active) setRecords(result);
    };
    load().catch(cause => { if (active) setError(errorMessage(cause)); }).finally(() => { if (active) setBusy(""); });
    return () => { active = false; };
  }, [platform, scope, page, major, dateFlag, examType, mathSubject, mathMode, mathExam, historyType, status.binding?.id, status.settings.enabled, scopesKey]);

  async function action(name: string, work: () => Promise<void>) {
    setBusy(name); setError(""); setNotice("");
    try { await work(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(""); }
  }
  async function refresh(sourcePage = 1) {
    await action("refresh", async () => {
      const result = await api<RefreshResult>(`${personalSyncPath}/refresh`, { method: "POST", body: JSON.stringify({ platform, scope, context, page: sourcePage, pageSize: 20 }) });
      if (unsupported(result)) { setError(result.message || "暂不支持导入此类记录，请选择其他范围。"); return; }
      setNextSourcePage(result.hasMore ? result.nextPage || sourcePage + 1 : undefined);
      setPreview(undefined);
      setNotice(`本次新增 ${result.added || 0} 条，更新 ${result.updated || 0} 条，未变化 ${result.unchanged || 0} 条。${result.hasMore ? "还有更多历史，可继续导入下一页。" : ""}`);
      await Promise.all([readRecords(), onChanged()]);
    });
  }

  return <section className="panel settings-panel personal-imports">
    <div className="personal-section-heading"><div><h2>查看与导入我的记录</h2><p className="muted">选择学科和记录范围，预览后导入。历史较多时，可继续导入下一页。</p></div></div>
    <div className="personal-import-filters">
      <label>学科<select className="input" value={platform} disabled={blocked} onChange={event => { setPlatform(event.target.value as LearningPlatform); setPage(1); setContextId(""); }}>{Object.entries(platformNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>记录范围<select className="input" value={scope} disabled={blocked} onChange={event => { setScope(event.target.value as PersonalScope); setPage(1); setContextId(""); }}>{Object.entries(personalScopes).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      {platform === "computer" && scope !== "bookshelf" && <label>计算机科目<select className="input" value={major} disabled={blocked} onChange={event => { setMajor(event.target.value); setPage(1); }}>{computerSubjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>}
      {platform === "computer" && ["favorites", "mistakes", "notes"].includes(scope) && <label>记录时间<select className="input" value={dateFlag} disabled={blocked} onChange={event => { setDateFlag(event.target.value); setPage(1); }}>{["本周", "上周", "两周前", "一个月前"].map((name, index) => <option key={index} value={index + 1}>{name}</option>)}</select></label>}
      {platform === "computer" && ["reports", "progress"].includes(scope) && <label>练习类型<select className="input" value={examType} disabled={blocked} onChange={event => { setExamType(Number(event.target.value)); setPage(1); }}>{computerHistoryTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>}
      {platform === "math" && ["favorites", "mistakes", "notes", "reports"].includes(scope) && <label>数学科目<select className="input" value={mathSubject} disabled={blocked} onChange={event => { setMathSubject(event.target.value); setPage(1); }}>{[["数一", "数学一"], ["数二", "数学二"], ["数三", "数学三"]].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
      {platform === "math" && scope === "reports" && <><label>练习模式<select className="input" value={mathMode} disabled={blocked} onChange={event => { setMathMode(event.target.value); setPage(1); }}>{["章节模式", "精选10题"].map(name => <option key={name} value={name}>{name}</option>)}</select></label><label>题目范围<select className="input" value={mathExam} disabled={blocked} onChange={event => { setMathExam(event.target.value); setPage(1); }}>{["真题模式", "非真题模式"].map(name => <option key={name} value={name}>{name}</option>)}</select></label></>}
      {platform === "math" && scope === "progress" && <label>阅读记录类型<select className="input" value={historyType} disabled={blocked} onChange={event => { setHistoryType(event.target.value); setPage(1); }}><option value="books">教辅阅读</option><option value="paper">真题阅读</option><option value="photo">拍照搜题</option></select></label>}
      {scope === "answers" && <label>{platform === "math" ? "题目编号" : "小程序练习记录编号"}<input className="input" value={contextId} onChange={event => setContextId(event.target.value)} disabled={blocked} placeholder={platform === "math" ? "输入小程序中的题目编号" : "输入小程序中的练习记录编号"} /></label>}
    </div>
    {platform === "math" && scope === "reports" && <p className="muted">请选择与小程序中一致的科目和练习模式。</p>}
    {platform === "computer" && scope === "bookshelf" && <p className="muted">暂不支持导入计算机书架，请选择收藏、错题等记录。</p>}
    <div className="personal-sync-actions"><button className="btn btn-secondary" disabled={blocked || !status.binding || (scope === "answers" && !contextId.trim())} onClick={() => void action("preview", async () => {
      const result = await api<ImportPage>(`${personalSyncPath}/preview`, { method: "POST", body: JSON.stringify({ platform, scope, context, page: 1, pageSize: 20 }) });
      if (unsupported(result)) { setError(result.message || "暂不支持读取此类记录，请选择其他范围。"); return; }
      setPreview(result);
    })}>{busy === "preview" ? <LoaderCircle size={15} className="spin" /> : <Eye size={15} />}预览小程序记录</button><button className="btn btn-primary" disabled={blocked || !canRefresh || (scope === "answers" && !contextId.trim())} onClick={() => void refresh()}>{busy === "refresh" ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}导入并更新当前范围</button>{nextSourcePage && <button className="btn btn-secondary" disabled={blocked || !canRefresh} onClick={() => void refresh(nextSourcePage)}><Download size={15} />继续导入下一页</button>}</div>
    {!status.binding ? <p className="muted">关联自己的小程序账号后，可预览和导入记录。</p> : !status.settings.enabled ? <p className="muted">请先开启自动更新并保存设置，再导入记录。已有记录仍可查看。</p> : !status.settings.scopes.includes(scope) ? <p className="muted">请先在上方勾选“{personalScopes[scope]}”，保存后即可更新。</p> : null}
    {error && <div className="error-banner" role="alert"><CircleAlert size={16} /><span>{error}</span></div>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {preview && <div className="personal-import-preview"><div><strong>小程序记录预览</strong><span>尚未导入</span></div><p>本页共 {preview.count ?? preview.records?.length ?? 0} 条{preview.hasMore ? "，后续还有更多历史" : ""}。</p>{(preview.samples || preview.records || []).slice(0, 3).map((record, index) => <p className="personal-import-sample" key={record.id || index}>{recordTitle(record, scope, index)}</p>)}</div>}
    <div className="personal-import-list-heading"><h3>已导入的{personalScopes[scope]}</h3><button className="text-link" disabled={blocked} onClick={() => void action("records", async () => { await readRecords(); })}>刷新已导入记录</button></div>
    {busy === "records" && !records ? <p className="loading-state" role="status"><LoaderCircle size={18} className="spin" />正在读取已导入记录…</p> : records?.records.length ? <>
      <div className="personal-import-list">{records.records.map((record, index) => <ImportedRecordCard key={record.id || index} record={record} scope={scope} index={index} />)}</div>
      <Pagination label="已导入学习记录" page={records.pagination.page} pageSize={records.pagination.pageSize} total={records.pagination.total} onPageChange={setPage} disabled={blocked} />
    </> : <div className="personal-import-empty"><BookOpen size={27} /><p>当前范围还没有导入记录。</p><small>可先预览小程序记录，再选择导入。</small></div>}
  </section>;
}

function ImportedRecordCard({ record, scope, index }: { record: ImportedRecord; scope: PersonalScope; index: number }) {
  const data = dataOf(record);
  const content = data.Content || data.content || data.noteContent || data.exerciseNote || data.Note || data.note || data.QuestionTitle || data.questionTitle;
  const answer = data.MyAnswer ?? data.myAnswer ?? data.userAnswer ?? data.answerContent ?? data.answer;
  const score = data.Score ?? data.score ?? data.totalScore;
  const sourceDate = record.sourceUpdatedAt || data.AddTime || data.addTime || data.createDate || data.createTime || data.createdAt || data.answerTime;
  const sourcePage = data.QuestionPage ?? data.questionPage;
  const sourceQuestion = data.QuestionSort ?? data.questionSort;
  const progressCount = data.finishedCount ?? data.correctNumber ?? data.finishedNumber;
  const isShelf = scope === "bookshelf" && ("EBookIDs" in data || "PaperIDs" in data);
  const shelfCount = (value: unknown) => String(value || "").split(",").filter(part => part.trim()).length;
  return <details className="personal-import-record"><summary><span className="personal-import-record-icon"><BookOpen size={18} /></span><span><strong>{recordTitle(record, scope, index)}</strong><small>小程序导入{sourceDate ? ` · ${syncDate(String(sourceDate))}` : ""}{scope === "reports" ? " · 历史报告" : ""}</small></span></summary><div className="personal-import-record-content">
    {content && <RichContent content={content} />}
    {isShelf && <p>教辅 {shelfCount(data.EBookIDs)} 份 · 真题 {shelfCount(data.PaperIDs)} 份 · 专辑 {shelfCount(data.AlbumIDs)} 份</p>}
    {answer !== undefined && <p><strong>当时作答：</strong>{typeof answer === "string" ? answer : JSON.stringify(answer)}</p>}
    {score !== undefined && <p><strong>记录得分：</strong>{String(score)}</p>}
    {data.StudentCount !== undefined && <p>已学 {String(data.StudentCount)}{data.QuestionSearchCount !== undefined ? ` / ${data.QuestionSearchCount}` : ""} 题</p>}
    {data.lastStudyTime && <p>最近学习：{syncDate(String(data.lastStudyTime))}</p>}
    {(sourcePage !== undefined || sourceQuestion !== undefined) && <p>阅读位置：{sourcePage !== undefined ? `第 ${sourcePage} 页` : ""}{sourceQuestion !== undefined ? ` · 第 ${sourceQuestion} 题` : ""}</p>}
    {scope === "progress" && progressCount !== undefined && <p>已记录 {String(progressCount)}{data.totalNumber !== undefined ? ` / ${data.totalNumber}` : ""} 题</p>}
    {!content && !isShelf && answer === undefined && score === undefined && data.StudentCount === undefined && !data.lastStudyTime && sourcePage === undefined && sourceQuestion === undefined && progressCount === undefined && <p>记录已导入，可在对应学习页面查看。</p>}
    {record.importedAt && <small className="muted">导入时间：{syncDate(record.importedAt)}</small>}
  </div></details>;
}

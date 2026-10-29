import { ArrowDownToLine, ArrowRight, BookOpen, ChartNoAxesCombined, CheckCircle2, Clock3, Code2, Sigma } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Platform } from "../../../shared/api/client";
import Pagination from "../../../shared/ui/pagination/Pagination";
import { usePagination } from "../../../shared/ui/pagination/use-pagination";
import WeeklyChart from "../dashboard/WeeklyChart";
import { exportStudyData, useStudyData } from "../state/store";
import { platformLabel as label } from "../study-format";
import { filterStudyActivities, formatStudyDuration, studyDurationValue, studyPeriodRange, studySummary, studyTimeBreakdown } from "../study-summary.mjs";
import "./study-insights.css";

type Scope = "all" | Platform;
type Period = 7 | 30 | "all";
const subjects: { key: Scope; label: string }[] = [{ key: "all", label: "全部科目" }, { key: "math", label: "考研数学" }, { key: "computer", label: "计算机 408" }];
const activityKind = (activity: { total?: number; type: string }) => Number(activity.total) > 0 ? "practice" : activity.type === "analysis" ? "analysis" : ["video", "course"].includes(activity.type) ? "media" : "other";
const activityLabel = (activity: { total?: number; type: string }) => ({ practice: "练习与测评", analysis: "解析阅读", media: "课程与视频", other: "学习活动" })[activityKind(activity)];
const practiceResult = (activity: { total?: number; correct?: number; graded?: number }) => {
  const graded = activity.graded ?? (activity.correct !== undefined ? activity.total || 0 : 0);
  const pending = Math.max(0, (activity.total || 0) - graded);
  return graded ? `${activity.correct || 0}/${graded} 题正确${pending ? ` · ${pending} 题待批改` : ""}` : "待批改";
};

export default function StudyInsights({ platform = "math", onPlatformChange }: { platform?: Platform; onPlatformChange?: (platform: Platform) => void } = {}) {
  const { activities } = useStudyData();
  const listRef = useRef<HTMLElement>(null);
  const [params, setParams] = useSearchParams();
  const subjectParam = params.get("subject"), periodParam = params.get("period");
  const scope: Scope = subjectParam === "math" || subjectParam === "computer" ? subjectParam : "all";
  const period: Period = periodParam === "all" ? "all" : periodParam === "30" ? 30 : 7;
  const [activitySearch, setActivitySearch] = useState("");
  const [kind, setKind] = useState("all");
  const periodActivities = filterStudyActivities(activities, studyPeriodRange(period));
  const scopedActivities = filterStudyActivities(periodActivities, scope === "all" ? {} : { platform: scope });
  const summary = studySummary(scopedActivities);
  const { events } = summary;
  const duration = studyDurationValue(summary.durationSeconds);
  const pending = Math.max(0, summary.questions - summary.graded);
  const scopeLabel = scope === "all" ? "全部科目" : label(scope);
  const periodLabel = period === "all" ? "全部记录" : `最近 ${period} 天`;
  const breakdown = studyTimeBreakdown(scopedActivities).filter(row => row.durationSeconds > 0);
  const visibleActivities = events.filter(activity =>
    (kind === "all" || activityKind(activity) === kind) &&
    activity.title.toLowerCase().includes(activitySearch.trim().toLowerCase()),
  );
  const pagination = usePagination({ total: visibleActivities.length, resetKey: `${scope}:${period}:${activitySearch}:${kind}` });
  function selectScope(next: Scope) {
    setParams(previous => { const nextParams = new URLSearchParams(previous); nextParams.set("subject", next); return nextParams; }, { replace: true });
    if (next !== "all") onPlatformChange?.(next);
  }
  return (
    <div className="study-report">
      <div className="page-heading report-heading">
        <div>
          <span className="report-eyebrow">看见每一次积累</span>
          <h1>学习报告</h1>
          <p>分科回看投入与掌握，让下一步更有方向。</p>
        </div>
        <button className="btn btn-secondary" onClick={exportStudyData}><ArrowDownToLine size={16} />导出全部记录</button>
      </div>
      <div className="report-controls">
        <div className="report-scope-control" role="group" aria-label="学习报告统计科目">
          {subjects.map(subject => <button key={subject.key} className={scope === subject.key ? "is-active" : ""} aria-pressed={scope === subject.key} onClick={() => selectScope(subject.key)}>{subject.key === "math" ? <Sigma size={16} /> : subject.key === "computer" ? <Code2 size={16} /> : <ChartNoAxesCombined size={16} />}{subject.label}</button>)}
        </div>
        <label className="report-period">统计范围<select className="input" aria-label="学习报告统计时间范围" value={period} onChange={event => setParams(previous => { const nextParams = new URLSearchParams(previous); nextParams.set("period", event.target.value); return nextParams; }, { replace: true })}><option value={7}>最近 7 天</option><option value={30}>最近 30 天</option><option value="all">全部记录</option></select></label>
      </div>
      <p className="report-scope-caption">{scopeLabel}<span>·</span>{periodLabel}<span>·</span>{events.length} 次学习活动</p>
      <div className="stat-grid insights-stats report-stats">
        <div className="stat-card"><div className="stat-top"><span>练习题次</span><BookOpen size={17} /></div><div className="stat-number">{summary.questions}<small>题</small></div><span className="stat-note">按实际提交的练习与测评统计</span></div>
        <div className="stat-card"><div className="stat-top"><span>已批改正确率</span><CheckCircle2 size={17} /></div><div className="stat-number">{summary.graded ? Math.round(summary.correct / summary.graded * 100) : "—"}{summary.graded > 0 && <small>%</small>}</div><span className="stat-note">{summary.graded ? `已批改 ${summary.graded} 题` : "暂无已批改题目"}{pending > 0 ? ` · 待批改 ${pending} 题` : ""}</span></div>
        <div className="stat-card"><div className="stat-top"><span>学习时长</span><Clock3 size={17} /></div><div className="stat-number" title={formatStudyDuration(summary.durationSeconds)}>{duration.value}<small>{duration.unit}</small></div><span className="stat-note">{formatStudyDuration(summary.durationSeconds)} · 按有效学习时间累计</span></div>
        <div className="stat-card"><div className="stat-top"><span>学习天数</span><ChartNoAxesCombined size={17} /></div><div className="stat-number">{summary.days}<small>天</small></div><span className="stat-note">有学习活动或有效时长的日期</span></div>
      </div>
      <section className="panel report-subjects">
        <div className="section-heading"><h2>分科学习明细</h2><span className="subtle">同一时段，分别查看两科进展</span></div>
        <div className="report-subject-grid">
          {(["math", "computer"] as Platform[]).map(subject => {
            const stats = studySummary(periodActivities, { platform: subject });
            const subjectPending = Math.max(0, stats.questions - stats.graded);
            return <article className={`report-subject ${subject}${scope === subject ? " is-selected" : ""}`} key={subject}>
              <div className="report-subject-heading"><span className={`path-icon ${subject === "math" ? "violet" : "mint"}`}>{subject === "math" ? <Sigma size={21} /> : <Code2 size={21} />}</span><div><h3>{label(subject)}</h3><p>{stats.events.length} 次学习活动{subjectPending > 0 ? ` · ${subjectPending} 题待批改` : ""}</p></div></div>
              <dl className="report-subject-metrics"><div><dt>学习时长</dt><dd>{formatStudyDuration(stats.durationSeconds)}</dd></div><div><dt>练习题次</dt><dd>{stats.questions}<small>题</small></dd></div><div><dt>已批改正确率</dt><dd>{stats.graded ? `${Math.round(stats.correct / stats.graded * 100)}%` : "暂无批改"}</dd></div><div><dt>学习天数</dt><dd>{stats.days}<small>天</small></dd></div></dl>
              <button className="text-link" onClick={() => selectScope(subject)}>查看{subject === "math" ? "数学" : "408"}报告<ArrowRight size={14} /></button>
            </article>;
          })}
        </div>
      </section>
      <div className="report-detail-grid">
        <section className="panel report-trend">
          <div className="section-heading"><h2>近 {period === "all" ? 7 : period} 天学习时长</h2><span className="subtle">{scopeLabel}{period === "all" ? " · 近期趋势" : ""}</span></div>
          <WeeklyChart activities={scopedActivities} rangeDays={period === "all" ? 7 : period} metric="duration" />
        </section>
        <section className="panel report-modes">
          <div className="section-heading"><h2>学习方式</h2><span className="subtle">{scopeLabel} · {periodLabel}</span></div>
          {breakdown.length ? <div className="report-mode-list">{breakdown.map(row => <div className={`report-mode ${row.key}`} key={row.key}><div><span>{row.label}</span><strong>{formatStudyDuration(row.durationSeconds)}</strong></div><div className="report-mode-track"><i style={{ width: `${summary.durationSeconds ? row.durationSeconds / summary.durationSeconds * 100 : 0}%` }} /></div></div>)}</div> : <div className="report-small-empty"><Clock3 size={25} /><p>当前范围还没有记录学习时长</p><span>阅读题目或观看视频后会自动累计。</span></div>}
          {breakdown.some(row => row.key === "unclassified") && <p className="report-mode-note">部分历史记录未区分学习方式，保留在未分类时长中。</p>}
        </section>
      </div>
      <section className="panel pagination-content report-records" ref={listRef}>
        <div className="section-heading"><h2>学习足迹</h2><span className="subtle">{scopeLabel} · {periodLabel} · {events.length} 条活动</span></div>
        <div className="records-filters"><input className="input" aria-label="搜索学习足迹" placeholder="搜索学习内容" value={activitySearch} onChange={event => setActivitySearch(event.target.value)} /><select className="input" aria-label="按活动类型筛选学习足迹" value={kind} onChange={event => setKind(event.target.value)}><option value="all">全部学习活动</option><option value="practice">练习与测评</option><option value="analysis">解析阅读</option><option value="media">课程与视频</option><option value="other">其他学习活动</option></select></div>
        {visibleActivities.length ? <div className="table-scroll"><table className="records-table"><thead><tr><th>学习内容</th><th>科目与类型</th><th>练习与结果</th><th>时间</th></tr></thead><tbody>{visibleActivities.slice(pagination.start, pagination.end).map(activity => <tr key={activity.id}><td><Link to={activity.path || "/study/practice"} onClick={() => onPlatformChange?.(activity.platform)}>{activity.title}</Link></td><td><span className={`report-subject-tag ${activity.platform}`}>{label(activity.platform)}</span><small className="report-record-type">{activityLabel(activity)}</small></td><td>{activity.total ? <><span>{activity.total} 题</span><small className={`report-record-result ${activity.correct === undefined ? "is-pending" : ""}`}>{practiceResult(activity)}</small></> : "—"}</td><td className="report-record-date">{new Date(activity.at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</td></tr>)}</tbody></table></div> : <div className="empty-state"><ChartNoAxesCombined size={35} /><h3>{activitySearch || kind !== "all" ? "没有符合条件的学习活动" : `${scopeLabel}在${periodLabel}暂无学习活动`}</h3><p>{activitySearch || kind !== "all" ? "调整关键词或活动类型后再试。" : "开始一组练习，或打开解析继续积累。"}</p><Link className="btn btn-primary" to="/study/practice" onClick={() => onPlatformChange?.(scope === "all" ? platform : scope)}>开始练习<ArrowRight size={16} /></Link></div>}
        <Pagination page={pagination.page} pageSize={pagination.pageSize} total={visibleActivities.length} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} label="学习足迹" contentRef={listRef} />
      </section>
      <p className="footnote">学习时长按前台阅读和视频实际播放统计；后台不计时，阅读连续 5 分钟无操作后暂停。未批改题目不计入正确率，计时更新不计为额外学习活动。</p>
    </div>
  );
}

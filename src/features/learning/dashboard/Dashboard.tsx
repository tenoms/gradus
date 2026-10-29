import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  CalendarDays,
  CheckCheck,
  Clock3,
  Code2,
  ListChecks,
  Plus,
  Sigma,
  Target,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import type { Platform } from "../../../shared/api/client";
import { WorkspaceTabs } from "../../../shared/ui/workspace-bar/WorkspaceBar";
import Announcements from "../../identity/Announcements";
import TaskRow from "../plans/TaskRow";
import { useStudyData } from "../state/store";
import { platformLabel as label, today } from "../study-format";
import { formatStudyDuration, studyDurationValue, studySummary } from "../study-summary.mjs";
import WeeklyChart from "./WeeklyChart";
import "./study-statistics.css";

export default function Dashboard({
  platform,
  onAdd,
  onPlatformChange,
}: {
  platform: Platform;
  onAdd: () => void;
  onPlatformChange: (platform: Platform) => void;
}) {
  const { tasks, activities, goalMinutes } = useStudyData();
  const [scope, setScope] = useState<Platform | "all">(platform);
  const [metric, setMetric] = useState<"duration" | "questions">("duration");
  useEffect(() => setScope(platform), [platform]);
  const activePlatform = scope === "all" ? undefined : scope;
  const scopeLabel = activePlatform ? label(activePlatform) : "全部科目";
  function selectScope(value: Platform | "all") {
    setScope(value);
    if (value !== "all") onPlatformChange(value);
  }
  const todaysTasks = tasks.filter((t) => t.date === today() && (!activePlatform || t.platform === activePlatform));
  const completed = todaysTasks.filter((t) => t.done).length;
  const summary = studySummary(activities, { date: today(), platform: activePlatform });
  const { events } = studySummary(activities, { platform: activePlatform, toDate: today() });
  const duration = studyDurationValue(summary.durationSeconds);
  const recent = events[0];
  return (
    <>
      <h1 className="sr-only">学习概览</h1>
      <Announcements />
      <div className="dashboard-grid">
        <div className="main-column">
          <section className="hero-card">
            <div className="hero-copy">
              <span className="hero-kicker">
                <span />
                让热爱，有迹可循
              </span>
              <h2>
                每一次专注，
                <br />
                都在靠近理想。
              </h2>
              <p>
                把复杂的知识，化成一步一步的进步。
                <br />
                你的数学与计算机学习，都在这里。
              </p>
              <Link
                className="btn hero-button"
                to={recent?.path || "/study/question-bank"}
                onClick={() => onPlatformChange(recent?.platform || activePlatform || platform)}
              >
                {recent ? "回看最近学习" : "开始今天的学习"}
                <ArrowRight size={17} />
              </Link>
            </div>
            <div className="learning-art" aria-hidden="true">
              <div className="art-orbit orbit-one" />
              <div className="art-orbit orbit-two" />
              <span className="art-star star-one">✧</span>
              <span className="art-star star-two">✧</span>
              <div className="art-card art-code">
                <div className="art-card-title">
                  <Code2 size={12} />
                  learn.js
                </div>
                <pre className="art-code-snippet"><code><span className="art-code-keyword">const</span>{" "}<span className="art-code-name">learn</span>{" = n =>\n  n + "}<span className="art-code-value">1</span>{";\n\n"}<span className="art-code-name">learn</span>{"("}<span className="art-code-value">1</span>{");"}</code></pre>
              </div>
              <div className="art-card art-math">
                <div className="art-card-title">
                  <Sigma size={10} />
                  MATHEMATICS
                </div>
                <div className="formula">
                  ∫ <span>f(x)</span> dx
                </div>
              </div>
              <div className="art-float">
                <CheckCheck size={18} />
              </div>
              <span className="art-dot dot-one" />
              <span className="art-dot dot-two" />
            </div>
          </section>
          <div className="study-overview-heading">
            <div><span className="study-section-kicker">TODAY'S PROGRESS</span><h2>今天的学习</h2></div>
            <WorkspaceTabs label="概览统计科目" value={scope} onChange={value => selectScope(value as Platform | "all")} items={(["all", "math", "computer"] as const).map(value => ({value, label: value === "all" ? "全部科目" : label(value)}))} />
          </div>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-top">
                <span>今日作答</span>
                <span className="mini-icon violet">
                  <Target size={17} />
                </span>
              </div>
              <div className="stat-number">
                {summary.questions}
                <small>题</small>
              </div>
              <span className="stat-note">{scopeLabel} · {summary.graded} 题已批改{summary.questions > summary.graded ? `，${summary.questions - summary.graded} 题待批改` : ""}</span>
            </div>
            <div className="stat-card">
              <div className="stat-top">
                <span>今日学习时长</span>
                <span className="mini-icon mint">
                  <Clock3 size={17} />
                </span>
              </div>
              <div className="stat-number" title={formatStudyDuration(summary.durationSeconds)}>
                {duration.value}
                <small>{duration.unit}</small>
              </div>
              <span className="stat-note">
                两科每日总目标 {goalMinutes} 分钟 <Link to="/profile?tab=settings">调整</Link>
              </span>
            </div>
            <div className="stat-card">
              <div className="stat-top">
                <span>计划完成</span>
                <span className="mini-icon peach">
                  <ListChecks size={17} />
                </span>
              </div>
              <div className="stat-number">
                {completed}
                <small>/ {todaysTasks.length} 项</small>
              </div>
              <span className="stat-note">{scopeLabel} · 今日计划</span>
            </div>
          </div>
          <section className="study-subject-overview" aria-label="数学与408今日统计">
            <div className="section-heading"><h2>两科学习概况</h2><span className="subtle">今日 · 分别累计</span></div>
            <div className="study-subject-grid">
              {(["math", "computer"] as const).map(subject => {
                const subjectSummary = studySummary(activities, { date: today(), platform: subject });
                const plans = tasks.filter(task => task.date === today() && task.platform === subject);
                const pending = Math.max(0, subjectSummary.questions - subjectSummary.graded);
                return <article key={subject} className={`study-subject-card is-${subject} ${scope === subject ? "is-selected" : ""}`}>
                  <button className="study-subject-title" aria-label={`查看${label(subject)}今日统计`} onClick={() => selectScope(subject)}>
                    <span className={`path-icon ${subject === "math" ? "violet" : "mint"}`}>{subject === "math" ? <Sigma size={20} /> : <Code2 size={20} />}</span>
                    <strong>{label(subject)}</strong><ArrowUpRight size={16} />
                  </button>
                  <dl className="study-subject-numbers">
                    <div><dt>今日作答</dt><dd>{subjectSummary.questions}<small>题</small></dd></div>
                    <div><dt>已批改正确率</dt><dd>{subjectSummary.graded ? `${Math.round(subjectSummary.correct / subjectSummary.graded * 100)}%` : "—"}</dd></div>
                  </dl>
                  <div className="study-subject-time"><Clock3 size={14} /><span>{formatStudyDuration(subjectSummary.durationSeconds)}</span><small>学习时长</small></div>
                  <p className="study-subject-note">计划 {plans.filter(task => task.done).length}/{plans.length} 已完成 · {pending ? `${pending} 题待批改` : subjectSummary.graded ? `${subjectSummary.graded} 题已批改` : "暂无已批改作答"}</p>
                  <Link className="study-subject-report" to={`/insights?subject=${subject}&period=7`} onClick={() => onPlatformChange(subject)}>查看分科报告<ArrowRight size={14} /></Link>
                </article>;
              })}
            </div>
          </section>
          <section className="panel learning-entrances">
            <div className="section-heading">
              <h2>选择你的学习路径</h2>
              <span className="subtle">循序而进，学有所获</span>
            </div>
            <div className="path-grid">
              <Link to="/study/question-bank" className="path-card">
                <span className="path-icon violet">
                  <BookOpen size={22} />
                </span>
                <h3>章节与真题</h3>
                <p>构建体系，逐个击破</p>
                <span className="path-arrow">
                  <ArrowUpRight size={18} />
                </span>
              </Link>
              <Link to="/study/practice" className="path-card">
                <span className="path-icon mint">
                  <Zap size={22} />
                </span>
                <h3>专项练习</h3>
                <p>聚焦知识，巩固理解</p>
                <span className="path-arrow">
                  <ArrowUpRight size={18} />
                </span>
              </Link>
              <Link to="/study/review" className="path-card">
                <span className="path-icon peach">
                  <Bookmark size={22} />
                </span>
                <h3>温故知新</h3>
                <p>整理错题，收获新知</p>
                <span className="path-arrow">
                  <ArrowUpRight size={18} />
                </span>
              </Link>
            </div>
          </section>
        </div>
        <aside className="right-column">
          <section className="panel plan-panel">
            <div className="section-heading">
              <h2>今日计划</h2>
              <button
                className="icon-button small-add"
                onClick={onAdd}
                aria-label="添加学习计划"
              >
                <Plus size={19} />
              </button>
            </div>
            <div className="plan-progress">
              <span>
                <b>{completed}</b> / {todaysTasks.length} 已完成
              </span>
              <strong>
                {todaysTasks.length
                  ? Math.round((completed / todaysTasks.length) * 100)
                  : 0}
                %
              </strong>
            </div>
            <div className="progress-track">
              <i
                style={{
                  width: `${todaysTasks.length ? (completed / todaysTasks.length) * 100 : 0}%`,
                }}
              />
            </div>
            {todaysTasks.length ? (
              <div>
                {todaysTasks.slice(0, 4).map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            ) : (
              <div className="plan-empty">
                <CalendarDays size={29} />
                <p>为今天安排一个小目标</p>
                <button className="text-link" onClick={onAdd}>
                  添加第一项计划
                  <Plus size={13} />
                </button>
              </div>
            )}
            <Link className="plan-footer" to="/plan">
              查看学习计划
              <ArrowUpRight size={15} />
            </Link>
          </section>
          <section className="panel activity-panel">
            <div className="section-heading">
              <h2>学习节奏</h2>
              <span className="subtle">{scopeLabel} · 近 7 天</span>
            </div>
            <div className="study-trend-toggle" role="group" aria-label="概览趋势指标"><button aria-pressed={metric === "duration"} onClick={() => setMetric("duration")}>学习时长</button><button aria-pressed={metric === "questions"} onClick={() => setMetric("questions")}>作答量</button></div>
            <WeeklyChart platform={activePlatform} metric={metric} />
            <div className="chart-foot">
              <span className="legend-dot" />
              每一次投入，都值得被记录
            </div>
          </section>
          <section className="panel recent-panel">
            <div className="section-heading">
              <h2>
                最近学习
                <span className="heading-dot" />
              </h2>
              <Link to={`/insights?subject=${scope}&period=all`} className="text-link">
                全部记录
                <ArrowRight size={14} />
              </Link>
            </div>
            {events.length ? (
              <div className="recent-history">
                <div className="recent-list" role="region" aria-label="最近学习记录" tabIndex={0}>
                  {events.slice(0, 8).map((a) => (
                    <Link
                      to={a.path || "/study/practice"}
                      className="recent-item"
                      key={a.id}
                      onClick={() => onPlatformChange(a.platform)}
                    >
                      <span
                        className={`recent-icon ${a.platform === "math" ? "violet" : "mint"}`}
                      >
                        {a.platform === "math" ? (
                          <Sigma size={21} />
                        ) : (
                          <Code2 size={21} />
                        )}
                      </span>
                      <div>
                        <h3>{a.title}</h3>
                        <p>
                          {label(a.platform)}
                          <span>·</span>
                          {new Date(a.at).toLocaleString("zh-CN", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Asia/Shanghai",
                          })}
                        </p>
                      </div>
                      <ArrowRight size={17} />
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <div className="inline-empty">
                <div className="empty-line-art">
                  <BookOpen size={25} />
                </div>
                <div>
                  <h3>{scopeLabel}，从这一步开始</h3>
                  <p>完成作答或查看解析后，这里会记录你的学习轨迹。</p>
                </div>
                <Link className="btn btn-secondary" to="/study/practice">
                  去练习
                  <ArrowRight size={15} />
                </Link>
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

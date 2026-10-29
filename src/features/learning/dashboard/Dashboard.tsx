import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  CalendarDays,
  CheckCheck,
  Clock3,
  Code2,
  Layers3,
  ListChecks,
  Plus,
  Sigma,
  Target,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { Platform } from "../../../shared/api/client";
import { useSession } from "../../../shared/auth/session";
import Announcements from "../../identity/Announcements";
import TaskRow from "../plans/TaskRow";
import { useStudyData } from "../state/store";
import { platformLabel as label, today } from "../study-format";
import WeeklyChart from "./WeeklyChart";

export default function Dashboard({
  platform,
  onAdd,
}: {
  platform: Platform;
  onAdd: () => void;
}) {
  const { session, openLogin } = useSession();
  const { tasks, activities, goalMinutes } = useStudyData();
  const todaysTasks = tasks.filter((t) => t.date === today());
  const completed = todaysTasks.filter((t) => t.done).length;
  const todaysActivities = activities.filter(
    (a) =>
      new Date(a.at).toLocaleDateString("sv-SE", {
        timeZone: "Asia/Shanghai",
      }) === today(),
  );
  const questions = todaysActivities.reduce((n, a) => n + (a.total || 0), 0);
  const minutes = Math.floor(
    todaysActivities.reduce((n, a) => n + (a.durationSeconds || 0), 0) / 60,
  );
  const recent = activities[0];
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
              <div className="art-card art-math">
                <div className="art-card-title">
                  <Sigma size={14} />
                  MATHEMATICS
                </div>
                <div className="formula">
                  ∫ <span>f(x)</span> dx
                </div>
                <div className="art-lines">
                  <i />
                  <i />
                </div>
                <span className="art-badge">探索无限可能</span>
              </div>
              <div className="art-card art-code">
                <Code2 size={21} />
                <div>
                  <i />
                  <i />
                  <i />
                </div>
                <span className="code-cursor" />
              </div>
              <div className="art-float">
                <CheckCheck size={18} />
              </div>
              <span className="art-dot dot-one" />
              <span className="art-dot dot-two" />
            </div>
          </section>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-top">
                <span>今日练习</span>
                <span className="mini-icon violet">
                  <Target size={17} />
                </span>
              </div>
              <div className="stat-number">
                {questions}
                <small>题</small>
              </div>
              <span className="stat-note">每一题，都算数</span>
            </div>
            <div className="stat-card">
              <div className="stat-top">
                <span>本日记录时长</span>
                <span className="mini-icon mint">
                  <Clock3 size={17} />
                </span>
              </div>
              <div className="stat-number">
                {minutes}
                <small>分钟</small>
              </div>
              <span className="stat-note">
                目标 {goalMinutes} 分钟 <Link to="/profile?tab=settings">调整</Link>
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
              <span className="stat-note">一点点积累，大大的进步</span>
            </div>
          </div>
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
          <section className="panel">
            <div className="section-heading">
              <h2>
                最近学习
                <span className="heading-dot" />
              </h2>
              <Link to="/insights" className="text-link">
                全部记录
                <ArrowRight size={14} />
              </Link>
            </div>
            {activities.length ? (
              <div className="recent-list">
                {activities.slice(0, 3).map((a) => (
                  <Link
                    to={a.path || "/study/practice"}
                    className="recent-item"
                    key={a.id}
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
            ) : (
              <div className="inline-empty">
                <div className="empty-line-art">
                  <BookOpen size={25} />
                </div>
                <div>
                  <h3>新的积累，从今天开始</h3>
                  <p>完成练习后，你的学习轨迹会出现在这里。</p>
                </div>
                <Link className="btn btn-secondary" to="/study/practice">
                  去练习
                  <ArrowRight size={15} />
                </Link>
              </div>
            )}
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
              <span className="subtle">近 7 天</span>
            </div>
            <WeeklyChart />
            <div className="chart-foot">
              <span className="legend-dot" />
              每一次投入，都值得被记录
            </div>
          </section>
          <section className="connection-card">
            <div className="connection-icon">
              <Layers3 size={22} />
            </div>
            <h3>两个学科，一个学习空间</h3>
            <p>
              从本地题库继续学习，
              <br />
              让每一次进步保存在你的账号里。
            </p>
            <div className="connection-status">
              <span
                className={
                  session.authenticated ? "is-ready" : ""
                }
              >
                <i />
                数学 · 可学习
              </span>
              <span
                className={
                  session.authenticated ? "is-ready" : ""
                }
              >
                <i />
                计算机 · 可学习
              </span>
            </div>
            <Link className="text-link" to="/study/question-bank">
              进入题库
              <ArrowRight size={14} />
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}

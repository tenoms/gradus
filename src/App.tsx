import { Component, Suspense, lazy, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  NavLink,
  Route,
  Routes,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Code2,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Layers3,
  ListChecks,
  LoaderCircle,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sigma,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Video,
  X,
  Zap,
} from "lucide-react";
import { api, emptySession, getSession } from "./lib/api";
import type { Platform, Session } from "./lib/api";
import { SessionContext, useSession } from "./lib/session";
import { useDialogFocus } from "./lib/focus";
import {
  addTask,
  deleteTask,
  exportStudyData,
  importStudyData,
  setGoal,
  setUserScope,
  toggleTask,
  useStudyData,
} from "./lib/store";
import type { StudyTask } from "./lib/store";
const MathWorkspace = lazy(() => import("./pages/MathWorkspace"));
const ComputerWorkspace = lazy(() => import("./pages/ComputerWorkspace"));
const navItems = [
  { to: "/", label: "学习概览", icon: LayoutDashboard },
  { to: "/study/question-bank", label: "题库与真题", icon: BookOpen },
  { to: "/study/practice", label: "专项练习", icon: Target },
  { to: "/study/exams", label: "模拟测评", icon: FileText },
  { to: "/study/courses", label: "我的课程", icon: Video },
];
const libraryItems = [
  { to: "/study/review", label: "错题与收藏", icon: Bookmark },
  { to: "/study/notes", label: "学习笔记", icon: FileText },
  { to: "/plan", label: "学习计划", icon: CalendarDays },
  { to: "/insights", label: "学习报告", icon: ChartNoAxesCombined },
];
const extraItems = [
  { to: "/study/schools", label: "院校与专业", icon: GraduationCap },
  { to: "/study/community", label: "学习社区", icon: MessageCircle },
  { to: "/study/resources", label: "资讯与资料", icon: Layers3 },
];
const sectionTitles: Record<string, [string, string]> = {
  "question-bank": ["题库与真题", "从章节到真题，找到当下要解决的问题。"],
  practice: ["专项练习", "把知识点学透，把每一步练扎实。"],
  exams: ["模拟测评", "以一次完整作答，检验学习成果。"],
  courses: ["我的课程", "继续学习，让每个知识点都有来处。"],
  review: ["错题与收藏", "回看曾经的疑问，把薄弱处变成优势。"],
  notes: ["学习笔记", "记录理解发生的瞬间。"],
  schools: ["院校与专业", "了解目标，让选择更清晰。"],
  community: ["学习社区", "在交流与分享中一起进步。"],
  resources: ["资讯与资料", "收好有用的信息，留给需要的时候。"],
};
export function today() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
}
const label = (p: Platform) => (p === "math" ? "考研数学" : "计算机 408");
function Spinner({ text = "正在加载学习内容…" }: { text?: string }) {
  return (
    <div className="loading-state">
      <LoaderCircle className="spin" size={25} />
      <span>{text}</span>
    </div>
  );
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div className="panel empty-state">
        <CircleAlert />
        <h3>这部分内容暂时无法显示</h3>
        <p>请重新加载后重试。如持续出现，可稍后再访问。</p>
        <button className="btn btn-primary" onClick={() => location.reload()}>
          重新加载
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function PlatformGate({
  platform,
  children,
}: {
  platform: Platform;
  children: ReactNode;
}) {
  const { session, openLogin } = useSession();
  const s = session.platforms?.[platform];
  return !s?.connected ? (
    <div className="panel connect-empty">
      <div className="icon-tile">
        <BookOpen size={30} />
      </div>
      <p className="eyebrow">连接你的学习世界</p>
      <h2>
        {session.authenticated
          ? `${label(platform)} 暂未连接`
          : "登录后，接着上一次的学习"}
      </h2>
      <p>
        {s?.error ||
          "通过 yyb 连接原小程序账号，即可读取题库、课程和个人学习记录。"}
      </p>
      <button className="btn btn-primary" onClick={openLogin}>
        {session.authenticated ? "管理账号连接" : "连接学习账号"}
        <ArrowRight size={16} />
      </button>
      <div className="connect-features">
        <span>
          <Check size={15} /> 数学与计算机统一入口
        </span>
        <span>
          <Check size={15} /> 保留原账号内容权限
        </span>
        <span>
          <Check size={15} /> 题库、课程和复习记录
        </span>
      </div>
    </div>
  ) : (
    children
  );
}
function StudyPage({ platform }: { platform: Platform }) {
  const { session } = useSession();
  const location = useLocation();
  const section = location.pathname.split("/")[2] || "question-bank";
  const title = sectionTitles[section];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{label(platform)} · 学习中心</p>
          <h1>{title?.[0] || "学习空间"}</h1>
          <p>{title?.[1]}</p>
        </div>
        <span className="pill">
          <span className="status-dot" />
          原平台内容
        </span>
      </div>
      <PlatformGate platform={platform}>
        <ErrorBoundary
          key={`${platform}-${section}-${session.account?.ref || "guest"}`}
        >
          <Suspense fallback={<Spinner />}>
            {platform === "math" ? (
              <MathWorkspace section={section} />
            ) : (
              <ComputerWorkspace section={section} />
            )}
          </Suspense>
        </ErrorBoundary>
      </PlatformGate>
    </>
  );
}
function TaskModal({
  platform,
  onClose,
}: {
  platform: Platform;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [subject, setSubject] = useState(platform);
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={dialogRef}
        className="modal small-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <button
          className="icon-button modal-close"
          aria-label="关闭"
          onClick={onClose}
        >
          <X />
        </button>
        <div className="icon-tile">
          <CalendarDays />
        </div>
        <h2 id="task-title">为下一步，留个计划</h2>
        <p className="muted">小而具体的目标，更容易坚持。</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            addTask({ title: title.trim(), date, platform: subject });
            onClose();
          }}
        >
          <label className="field-label">
            学习任务
            <input
              ref={input}
              className="input"
              maxLength={160}
              placeholder="例如：完成高等数学第一章练习"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <div className="form-row">
            <label className="field-label">
              科目
              <select
                className="input"
                value={subject}
                onChange={(e) => setSubject(e.target.value as Platform)}
              >
                <option value="math">考研数学</option>
                <option value="computer">计算机 408</option>
              </select>
            </label>
            <label className="field-label">
              计划日期
              <input
                className="input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
          </div>
          <button className="btn btn-primary full-width" type="submit">
            <Plus size={17} />
            添加计划
          </button>
        </form>
      </section>
    </div>
  );
}
function TaskRow({ task }: { task: StudyTask }) {
  return (
    <div className={`task-row ${task.done ? "is-done" : ""}`}>
      <button
        className="task-check"
        aria-label={`${task.done ? "取消完成" : "完成"} ${task.title}`}
        aria-pressed={task.done}
        onClick={() => toggleTask(task.id)}
      >
        {task.done && <Check size={14} />}
      </button>
      <div>
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          {label(task.platform)}
          <span>·</span>
          {task.date}
        </span>
      </div>
      <button
        className="icon-button task-delete"
        aria-label={`删除 ${task.title}`}
        onClick={() => deleteTask(task.id)}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
function WeeklyChart() {
  const { activities } = useStudyData();
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  });
  const counts = dates.map((d) =>
    activities
      .filter(
        (a) =>
          new Date(a.at).toLocaleDateString("sv-SE", {
            timeZone: "Asia/Shanghai",
          }) === d,
      )
      .reduce((n, a) => n + (a.total || 1), 0),
  );
  const max = Math.max(5, ...counts);
  return (
    <div
      className="weekly-chart"
      role="img"
      aria-label={`最近7天学习活动：${dates.map((date, i) => `${date} ${counts[i]}次`).join("，")}`}
    >
      <div className="chart-grid">
        <span>次数</span>
        <div />
        <div />
        <div />
      </div>
      <div className="bars">
        {dates.map((date, i) => (
          <div className="bar-col" key={date}>
            <div
              className={`bar ${i === 6 ? "current" : ""}`}
              style={{
                height: `${Math.max(counts[i] ? 5 : 2, (counts[i] / max) * 100)}%`,
              }}
              title={`${date}：${counts[i]} 次学习活动`}
            >
              <span>{counts[i]}</span>
            </div>
            <small>{date.slice(5).replace("-", "/")}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
function Dashboard({
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
  const displayName =
    session.account?.nickname || session.account?.name || "同学";
  const recent = activities[0];
  const date = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Shanghai",
  }).format(new Date());
  return (
    <>
      <div className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">YOUR LEARNING SPACE</p>
          <h1>
            你好，{displayName}
            <span className="wave">☀</span>
          </h1>
          <p>学习是一场积累，今天也向前一步。</p>
        </div>
        <span className="date-label">
          <CalendarDays size={16} />
          {date}
        </span>
      </div>
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
                目标 {goalMinutes} 分钟 <Link to="/settings">调整</Link>
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
              连接原小程序账号，
              <br />
              让知识和学习记录在这里相遇。
            </p>
            <div className="connection-status">
              <span
                className={
                  session.platforms?.math?.connected ? "connected" : ""
                }
              >
                <i />
                数学
              </span>
              <span
                className={
                  session.platforms?.computer?.connected ? "connected" : ""
                }
              >
                <i />
                计算机
              </span>
            </div>
            <button className="text-link" onClick={openLogin}>
              {session.authenticated ? "管理账号连接" : "连接学习账号"}
              <ArrowRight size={14} />
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}
function Plan({ platform, onAdd }: { platform: Platform; onAdd: () => void }) {
  const { tasks } = useStudyData();
  const [filter, setFilter] = useState("all");
  const [date, setDate] = useState("");
  const visible = tasks
    .filter(
      (t) =>
        (filter === "all" || (filter === "done" ? t.done : !t.done)) &&
        (!date || t.date === date),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">一步一步，成为想成为的人</p>
          <h1>学习计划</h1>
          <p>安排你的时间，把想法变成行动。</p>
        </div>
        <button className="btn btn-primary" onClick={onAdd}>
          <Plus size={16} />
          添加计划
        </button>
      </div>
      <section className="panel">
        <div className="filter-bar">
          <div className="tabs">
            {[
              ["all", "全部计划"],
              ["pending", "待完成"],
              ["done", "已完成"],
            ].map(([id, text]) => (
              <button
                className={filter === id ? "active" : ""}
                key={id}
                onClick={() => setFilter(id)}
              >
                {text}
              </button>
            ))}
          </div>
          <label className="date-filter">
            <span>日期</span>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            {date && (
              <button
                className="icon-button"
                onClick={() => setDate("")}
                aria-label="清除日期"
              >
                <X size={15} />
              </button>
            )}
          </label>
        </div>
        {visible.length ? (
          visible.map((t) => <TaskRow task={t} key={t.id} />)
        ) : (
          <div className="empty-state">
            <CalendarDays size={38} />
            <h3>{tasks.length ? "没有符合条件的计划" : "给学习一些方向"}</h3>
            <p>从一个具体的小目标开始，完成后记得给自己打个勾。</p>
            <button className="btn btn-secondary" onClick={onAdd}>
              <Plus size={16} />
              创建学习计划
            </button>
          </div>
        )}
      </section>
      <p className="footnote">
        计划保存在此浏览器，并按连接的账号分别记录。可在设置中导出备份。
      </p>
    </>
  );
}
function Insights() {
  const { activities, tasks } = useStudyData();
  const total = activities.reduce((n, a) => n + (a.total || 0), 0);
  const correct = activities.reduce((n, a) => n + (a.correct || 0), 0);
  const graded = activities
    .filter((a) => a.correct !== undefined)
    .reduce((n, a) => n + (a.total || 0), 0);
  const days = new Set(
    activities.map((a) =>
      new Date(a.at).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }),
    ),
  ).size;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">看得见的努力</p>
          <h1>学习报告</h1>
          <p>回看自己的节奏，让下一步更有方向。</p>
        </div>
        <button className="btn btn-secondary" onClick={exportStudyData}>
          <ArrowDownToLine size={16} />
          导出记录
        </button>
      </div>
      <div className="stat-grid insights-stats">
        {[
          ["累计练习", total, "题"],
          [
            "已批改正确率",
            graded ? Math.round((correct / graded) * 100) : 0,
            "%",
          ],
          ["学习天数", days, "天"],
          ["完成计划", tasks.filter((t) => t.done).length, "项"],
        ].map(([name, num, unit]) => (
          <div className="stat-card" key={name}>
            <span className="muted">{name}</span>
            <div className="stat-number">
              {num}
              <small>{unit}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="insights-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>本周学习节奏</h2>
            <span className="subtle">按真实学习活动统计</span>
          </div>
          <WeeklyChart />
        </section>
        <section className="panel subject-summary">
          <h2>学科分布</h2>
          {(["math", "computer"] as Platform[]).map((p) => (
            <div className="subject-row" key={p}>
              <span className={`path-icon ${p === "math" ? "violet" : "mint"}`}>
                {p === "math" ? <Sigma /> : <Code2 />}
              </span>
              <div>
                <strong>{label(p)}</strong>
                <span>
                  {activities.filter((a) => a.platform === p).length} 次学习活动
                </span>
              </div>
            </div>
          ))}
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>学习足迹</h2>
          <span className="subtle">
            最近 {Math.min(activities.length, 100)} 条
          </span>
        </div>
        {activities.length ? (
          <div className="table-scroll">
            <table className="records-table">
              <thead>
                <tr>
                  <th>学习内容</th>
                  <th>科目</th>
                  <th>题目数</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {activities.slice(0, 100).map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link to={a.path || "/study/practice"}>{a.title}</Link>
                    </td>
                    <td>{label(a.platform)}</td>
                    <td>{a.total ?? "—"}</td>
                    <td>
                      {new Date(a.at).toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <ChartNoAxesCombined size={35} />
            <h3>积累，正在发生</h3>
            <p>完成你的第一组练习，开始记录学习进步。</p>
            <Link className="btn btn-primary" to="/study/practice">
              开始练习
              <ArrowRight size={16} />
            </Link>
          </div>
        )}
      </section>
      <p className="footnote">
        此报告汇总在 Web
        中产生的学习活动；原平台历史记录可在对应题库或复习页查看。
      </p>
    </>
  );
}
function Settings() {
  const { session, refresh, openLogin } = useSession();
  const { goalMinutes } = useStudyData();
  const [notice, setNotice] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">适合自己的，才是好节奏</p>
          <h1>学习设置</h1>
          <p>管理账号连接、学习目标和本地记录。</p>
        </div>
      </div>
      <section className="panel settings-panel">
        <h2>学习账号</h2>
        <div className="settings-row">
          <div>
            <h3>
              {session.authenticated
                ? session.account?.nickname ||
                  session.account?.name ||
                  "已连接 yyb 账号"
                : "尚未连接账号"}
            </h3>
            <p>通过 yyb 读取微信会话，连接原平台学习内容。</p>
          </div>
          <button className="btn btn-secondary" onClick={openLogin}>
            {session.authenticated ? "管理连接" : "连接账号"}
          </button>
        </div>
        {(["math", "computer"] as Platform[]).map((p) => (
          <div className="settings-row" key={p}>
            <span>{label(p)}</span>
            <span
              className={`pill ${session.platforms?.[p]?.connected ? "success" : ""}`}
            >
              {session.platforms?.[p]?.connected ? "已连接" : "未连接"}
            </span>
          </div>
        ))}
        {session.authenticated && (
          <button
            className="btn btn-secondary"
            disabled={loggingOut}
            onClick={async () => {
              setLoggingOut(true);
              try {
                await api("/api/auth/logout", { method: "POST" });
                await refresh();
              } catch (e) {
                setNotice((e as Error).message);
              } finally {
                setLoggingOut(false);
              }
            }}
          >
            <LogOut size={16} />
            退出当前账号
          </button>
        )}
      </section>
      <section className="panel settings-panel">
        <h2>每日学习目标</h2>
        <div className="settings-row">
          <div>
            <h3>专注时长</h3>
            <p>设定一个容易坚持的目标，逐步积累。</p>
          </div>
          <select
            className="input goal-select"
            value={goalMinutes}
            onChange={(e) => {
              setGoal(Number(e.target.value));
              setNotice("每日目标已保存");
            }}
          >
            {[15, 30, 45, 60, 90, 120, 180, 240].map((n) => (
              <option value={n} key={n}>
                {n} 分钟 / 天
              </option>
            ))}
          </select>
        </div>
      </section>
      <section className="panel settings-panel">
        <h2>学习记录备份</h2>
        <p className="muted">
          导出此浏览器中的学习计划和 Web 学习活动，也可以从备份文件恢复。
        </p>
        <div className="button-row">
          <button className="btn btn-secondary" onClick={exportStudyData}>
            <ArrowDownToLine size={16} />
            导出备份
          </button>
          <label className="btn btn-secondary file-button">
            <Upload size={16} />
            导入备份
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  importStudyData(JSON.parse(await f.text()));
                  setNotice("学习记录已恢复");
                } catch (error) {
                  setNotice((error as Error).message);
                }
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </section>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button
            className="icon-button"
            onClick={() => setNotice("")}
            aria-label="关闭提示"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
function LoginModal({
  onClose,
  refresh,
}: {
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const { session } = useSession();
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api("/api/auth/accounts");
      const list = Array.isArray(result)
        ? result
        : result.accounts || result.data || [];
      setAccounts(list);
      setSelected(
        String(
          list.find((a: any) => a.status === "alive")?.ref ||
            list[0]?.ref ||
            "",
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="modal-backdrop" onClick={() => !connecting && onClose()}>
      <section
        ref={dialogRef}
        className="modal login-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && !connecting && onClose()}
      >
        <button
          className="icon-button modal-close"
          disabled={connecting}
          aria-label="关闭登录窗口"
          onClick={onClose}
        >
          <X />
        </button>
        <div className="login-brand">
          <Layers3 size={28} />
        </div>
        <p className="eyebrow">WELCOME TO YOUR NEXT CHAPTER</p>
        <h2 id="login-title">把学习，连接起来</h2>
        <p className="login-description">
          使用 yyb 微信会话连接数学与计算机小程序，
          <br />
          继续使用你原有的学习内容和权限。
        </p>
        {loading ? (
          <Spinner text="正在读取可用账号…" />
        ) : success ? (
          <div className="login-result">
            <CheckCheck size={34} />
            <h3>学习账号已连接</h3>
            <p>现在可以开始浏览题库、课程与个人记录。</p>
          </div>
        ) : (
          <>
            <label className="field-label">
              选择微信账号
              <select
                className="input account-select"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={connecting || !accounts.length}
              >
                <option value="" disabled>
                  {accounts.length ? "请选择账号" : "未找到可用账号"}
                </option>
                {accounts.map((a: any) => (
                  <option value={a.ref} key={a.ref}>
                    {a.nickname || a.nickName || a.name || "微信账号"}
                    {a.alive === false ? "（会话失效）" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="platform-connection-list">
              {(["math", "computer"] as Platform[]).map((p) => (
                <div key={p}>
                  <span
                    className={`mini-icon ${p === "math" ? "violet" : "mint"}`}
                  >
                    {p === "math" ? <Sigma size={18} /> : <Code2 size={18} />}
                  </span>
                  <strong>{label(p)}</strong>
                  <span>
                    {connecting ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : session.platforms?.[p]?.connected ? (
                      <span className="green-text">已连接</span>
                    ) : (
                      "将同步连接"
                    )}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <CircleAlert size={17} />
            <span>{error}</span>
          </div>
        )}
        {success ? (
          <button className="btn btn-primary full-width" onClick={onClose}>
            进入学习空间
            <ArrowRight size={17} />
          </button>
        ) : (
          <button
            className="btn btn-primary full-width"
            disabled={connecting || loading || !selected}
            onClick={async () => {
              setConnecting(true);
              setError("");
              try {
                const result = await api("/api/auth/connect", {
                  method: "POST",
                  body: JSON.stringify({ ref: selected }),
                });
                await refresh();
                if (
                  result.platforms &&
                  !result.platforms.math?.connected &&
                  !result.platforms.computer?.connected
                )
                  throw new Error("账号暂未连接成功，请检查 yyb 会话后重试");
                setSuccess(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setConnecting(false);
              }
            }}
          >
            {connecting ? (
              <>
                <LoaderCircle size={17} className="spin" />
                正在连接两个平台…
              </>
            ) : (
              <>
                连接学习账号
                <ArrowRight size={17} />
              </>
            )}
          </button>
        )}
        {!loading && !connecting && !success && (
          <button className="text-link refresh-accounts" onClick={load}>
            <RefreshCw size={13} />
            刷新可用账号
          </button>
        )}
        <p className="login-note">
          登录会话由服务端管理。内容访问遵循原账号权限。
        </p>
      </section>
    </div>
  );
}
export default function App() {
  const [platform, setPlatform] = useState<Platform>(() =>
    localStorage.getItem("study-platform") === "computer" ? "computer" : "math",
  );
  const [session, setSession] = useState<Session>(emptySession);
  const [loginOpen, setLoginOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(
    () => matchMedia("(max-width:800px)").matches,
  );
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const media = matchMedia("(max-width:800px)");
    const change = () => setIsCompact(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const [search, setSearch] = useState("");
  const [serverError, setServerError] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  async function refresh() {
    try {
      const value = await getSession();
      const normalized = {
        ...emptySession,
        ...value,
        platforms: { ...emptySession.platforms, ...value.platforms },
      };
      setSession(normalized);
      setUserScope(
        normalized.authenticated ? normalized.account?.ref : undefined,
      );
      setServerError("");
    } catch (e) {
      setServerError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    const expired = () => {
      void refresh();
    };
    window.addEventListener("study-session-expired", expired);
    return () => window.removeEventListener("study-session-expired", expired);
  }, []);
  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  function changePlatform(p: Platform) {
    setPlatform(p);
    localStorage.setItem("study-platform", p);
  }
  const activeTitle =
    location.pathname === "/"
      ? "学习概览"
      : location.pathname === "/plan"
        ? "学习计划"
        : location.pathname === "/insights"
          ? "学习报告"
          : location.pathname === "/settings"
            ? "学习设置"
            : sectionTitles[location.pathname.split("/")[2]]?.[0] || "学习空间";
  return (
    <SessionContext.Provider
      value={{ session, refresh, openLogin: () => setLoginOpen(true) }}
    >
      <div className="app-shell" inert={loginOpen || taskOpen}>
        <a className="skip-link" href="#main-content">
          跳到学习内容
        </a>
        {mobileOpen && (
          <div
            className="sidebar-backdrop"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <aside
          id="learning-sidebar"
          inert={isCompact && !mobileOpen}
          className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}
        >
          <Link className="brand" to="/">
            <span className="brand-mark">
              <Layers3 size={24} />
            </span>
            <div>
              <strong>
                知序<span>Study</span>
              </strong>
              <small>学有所序，行有所至</small>
            </div>
          </Link>
          <div className="workspace-label">
            我的学习空间<span>WEB</span>
          </div>
          <nav aria-label="主导航">
            <div className="nav-group">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  end={to === "/"}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? "active" : ""}`
                  }
                  to={to}
                  key={to}
                >
                  <Icon size={19} />
                  <span>{label}</span>
                  {to === "/study/practice" && <i className="nav-new" />}
                </NavLink>
              ))}
            </div>
            <p className="nav-group-label">积累与成长</p>
            <div className="nav-group">
              {libraryItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  className={({ isActive }) =>
                    `nav-item ${isActive ? "active" : ""}`
                  }
                  to={to}
                  key={to}
                >
                  <Icon size={19} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
            <p className="nav-group-label">探索更多</p>
            <div className="nav-group">
              {extraItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  className={({ isActive }) =>
                    `nav-item ${isActive ? "active" : ""}`
                  }
                  to={to}
                  key={to}
                >
                  <Icon size={19} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          </nav>
          <div className="sidebar-bottom">
            <div className="study-quote">
              <span>✧</span>
              <p>
                不必急于求成，
                <br />
                每一步都有意义。
              </p>
            </div>
            <NavLink className="nav-item" to="/settings">
              <Settings2 size={19} />
              <span>学习设置</span>
            </NavLink>
            <div className="sidebar-footer">
              知序学习空间 <span>v1.0</span>
            </div>
          </div>
        </aside>
        <div className="app-body">
          <header className="topbar">
            <div className="topbar-left">
              <button
                className="icon-button menu-toggle"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label={mobileOpen ? "收起导航" : "展开导航"}
                aria-expanded={mobileOpen}
                aria-controls="learning-sidebar"
              >
                <Menu size={22} />
              </button>
              <span className="breadcrumb">
                学习空间<span>/</span>
                <strong>{activeTitle}</strong>
              </span>
            </div>
            <div className="topbar-right">
              <form
                className={`global-search ${searchExpanded ? "expanded" : ""}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (search.trim()) {
                    navigate(
                      `/study/question-bank?q=${encodeURIComponent(search.trim())}`,
                    );
                    setSearch("");
                    setSearchExpanded(false);
                  }
                }}
              >
                <button
                  type="button"
                  className="search-trigger"
                  aria-label="展开搜索"
                  onClick={() => {
                    setSearchExpanded(true);
                    requestAnimationFrame(() => searchInput.current?.focus());
                  }}
                >
                  <Search size={17} />
                </button>
                <input
                  ref={searchInput}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setSearchExpanded(false);
                      searchInput.current?.blur();
                    }
                  }}
                  aria-label="搜索题目或学习内容"
                  placeholder="搜索题目、知识点…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <kbd>↵</kbd>
              </form>
              <div className="subject-switch">
                <span className={`subject-symbol ${platform}`}>
                  {platform === "math" ? (
                    <Sigma size={17} />
                  ) : (
                    <Code2 size={17} />
                  )}
                </span>
                <select
                  aria-label="选择学习科目"
                  value={platform}
                  onChange={(e) => changePlatform(e.target.value as Platform)}
                >
                  <option value="math">考研数学</option>
                  <option value="computer">计算机 408</option>
                </select>
                <ChevronDown size={13} />
              </div>
              <button
                className={`avatar ${session.authenticated ? "signed-in" : ""}`}
                title={session.authenticated ? "管理学习账号" : "连接学习账号"}
                onClick={() => setLoginOpen(true)}
                aria-label={
                  session.authenticated ? "管理学习账号" : "连接学习账号"
                }
              >
                {session.authenticated ? (
                  <GraduationCap size={23} />
                ) : (
                  <span>知</span>
                )}
                <i className={session.authenticated ? "online" : ""} />
              </button>
            </div>
          </header>
          <main className="main-content" id="main-content" tabIndex={-1}>
            {serverError && (
              <div className="error-banner">
                <CircleAlert size={17} />
                <span>学习服务连接失败：{serverError}</span>
                <button className="text-link" onClick={refresh}>
                  重试
                </button>
              </div>
            )}
            <Routes>
              <Route
                path="/"
                element={
                  <Dashboard
                    platform={platform}
                    onAdd={() => setTaskOpen(true)}
                  />
                }
              />
              <Route
                path="/study/:section"
                element={<StudyPage platform={platform} />}
              />
              <Route
                path="/plan"
                element={
                  <Plan platform={platform} onAdd={() => setTaskOpen(true)} />
                }
              />
              <Route path="/insights" element={<Insights />} />
              <Route path="/settings" element={<Settings />} />
              <Route
                path="*"
                element={
                  <div className="empty-state">
                    <h1>这个页面还没有内容</h1>
                    <Link className="btn btn-primary" to="/">
                      回到学习概览
                    </Link>
                  </div>
                }
              />
            </Routes>
            <footer className="page-footer">
              <span>学有所序 · 行有所至</span>
              <span>
                保持好奇，继续向前 <Sparkles size={12} />
              </span>
            </footer>
          </main>
        </div>
      </div>
      {loginOpen && (
        <LoginModal onClose={() => setLoginOpen(false)} refresh={refresh} />
      )}{" "}
      {taskOpen && (
        <TaskModal platform={platform} onClose={() => setTaskOpen(false)} />
      )}
    </SessionContext.Provider>
  );
}

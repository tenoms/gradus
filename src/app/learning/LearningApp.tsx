import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  CircleAlert,
  Code2,
  GraduationCap,
  Layers3,
  LoaderCircle,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sigma,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import AuthScreen from "../../features/identity/AuthScreen";
import StudySyncIndicator, { StudySyncNotice } from "../../features/identity/StudySyncIndicator";
import Dashboard from "../../features/learning/dashboard/Dashboard";
import StudyPlan from "../../features/learning/plans/StudyPlan";
import TaskEditor from "../../features/learning/plans/TaskEditor";
import StudyInsights from "../../features/learning/reports/StudyInsights";
import StudySettings from "../../features/learning/settings/StudySettings";
import LearningAppearance from "../../features/learning/settings/LearningAppearance";
import { setUserScope } from "../../features/learning/state/store";
import StudyTimeProvider from "../../features/learning/time/StudyTimeProvider";
import type { Platform, Session } from "../../shared/api/client";
import { emptySession, getSession, setApiIdentity } from "../../shared/api/client";
import { SessionContext, useSession } from "../../shared/auth/session";
import { configureBrowserConfig } from "../../shared/config/public.mjs";
import { useSpaceTheme } from "../../shared/theme/use-space-theme";
import { extraItems, libraryItems, navItems, sectionTitles } from "./navigation";
const PersonalCenter = lazy(() => import("../../features/identity/PersonalCenter"));
const MathWorkspace = lazy(() => import("../../features/math/MathWorkspace"));
const ComputerWorkspace = lazy(() => import("../../features/computer/ComputerWorkspace"));

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
function PlatformGate({ children }: { platform: Platform; children: ReactNode }) {
  const { session, openLogin } = useSession();
  return session.authenticated ? children : <div className="panel connect-empty">
    <div className="icon-tile"><BookOpen size={30} /></div>
    <h2>登录后，接着上一次的学习</h2>
    <p>使用你的学习账号查看内容，继续计划与个人记录。</p>
    <button className="btn btn-primary" onClick={openLogin}>登录学习空间<ArrowRight size={16} /></button>
  </div>;
}
function StudyPage({ platform }: { platform: Platform }) {
  const { session } = useSession();
  const location = useLocation();
  const section = location.pathname.split("/")[2] || "question-bank";
  const title = sectionTitles[section];
  const learnerIdentity = session.user?.id || "guest";
  return (
    <>
      <h1 className="sr-only">{title?.[0] || "学习空间"}</h1>
      <PlatformGate platform={platform}>
        <ErrorBoundary
          key={`${platform}-${section}-${learnerIdentity}`}
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

export default function LearningApp() {
  const [platform, setPlatform] = useState<Platform>(() =>
    localStorage.getItem("study-platform") === "computer" ? "computer" : "math",
  );
  const theme = useSpaceTheme(platform);
  const [session, setSession] = useState<Session>(emptySession);
  const activeIdentity = useRef<string | undefined>(undefined);
  const [booting, setBooting] = useState(true);
  const [taskOpen, setTaskOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("study-sidebar-collapsed") === "1");
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
  function acceptSession(value: Session) {
      configureBrowserConfig(value.browserConfig);
      const normalized = {
        ...emptySession,
        ...value,
        platforms: { ...emptySession.platforms, ...value.platforms },
      };
      const nextIdentity = normalized.authenticated ? normalized.user?.id : undefined;
      if (activeIdentity.current !== nextIdentity) {
        setTaskOpen(false);
        activeIdentity.current = nextIdentity;
      }
      setApiIdentity(nextIdentity);
      setSession(normalized);
      setUserScope(
        normalized.authenticated ? normalized.user?.id : undefined,
      );
      setServerError("");
  }
  async function refresh() {
    try {
      acceptSession(await getSession());
    } catch (e) {
      setServerError((e as Error).message);
    } finally { setBooting(false); }
  }
  useEffect(() => {
    void refresh();
    const expired = () => {
      void refresh();
    };
    window.addEventListener("study-session-expired", expired);
    window.addEventListener("study-identity-changed", expired);
    return () => {
      window.removeEventListener("study-session-expired", expired);
      window.removeEventListener("study-identity-changed", expired);
    };
  }, []);
  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname, session.user?.id]);
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
          : location.pathname === "/profile" || location.pathname === "/settings"
            ? "个人中心"
            : sectionTitles[location.pathname.split("/")[2]]?.[0] || "学习空间";
  if (booting) return <div className="app-starting"><Spinner text="正在打开你的学习空间…" /></div>;
  if (!session.authenticated) return <AuthScreen space="learning" onAuthenticated={acceptSession} />;
  return (
    <SessionContext.Provider
      value={{ session, refresh, openLogin: () => navigate("/profile") }}
    >
    <StudyTimeProvider key={session.user?.id}>
      <div key={session.user?.id || "guest"} className={`app-shell ${sidebarCollapsed ? "nav-collapsed" : ""}`} inert={taskOpen}>
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
          <Link className="brand" to="/" aria-label="知序学习概览" title="知序学习概览">
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
            {session.user?.displayName || "我的学习空间"}<span>LEARN</span>
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
                  aria-label={label}
                  title={label}
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
                  aria-label={label}
                  title={label}
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
                  aria-label={label}
                  title={label}
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
            <NavLink className="nav-item" to="/profile" aria-label="个人中心" title="个人中心">
              <UserRound size={19} />
              <span>个人中心</span>
            </NavLink>
            <div className="sidebar-footer">
              知序学习空间 <span>v2.0</span>
            </div>
          </div>
        </aside>
        <div className="app-body">
          <header className="topbar">
            <div className="topbar-left">
              <button className="icon-button desktop-sidebar-toggle" aria-label={sidebarCollapsed ? "展开侧边导航" : "收起侧边导航"} aria-expanded={!sidebarCollapsed} aria-controls="learning-sidebar" onClick={() => { setSidebarCollapsed(!sidebarCollapsed); localStorage.setItem("study-sidebar-collapsed", sidebarCollapsed ? "0" : "1"); }}>{sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}</button>
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
              <StudySyncIndicator />
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
              <LearningAppearance theme={theme} />
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
                title="个人中心"
                onClick={() => navigate("/profile")}
                aria-label="个人中心"
              >
                {session.user?.avatar ? <img src={session.user.avatar} alt="" /> : session.authenticated ? (
                  <GraduationCap size={23} />
                ) : (
                  <span>知</span>
                )}
                <i className={session.authenticated ? "online" : ""} />
              </button>
            </div>
          </header>
          <main className="main-content" id="main-content" tabIndex={-1}>
            <StudySyncNotice />
            {serverError && (
              <div className="error-banner">
                <CircleAlert size={17} />
                <span>学习服务暂不可用：{serverError}</span>
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
                    onPlatformChange={changePlatform}
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
                  <StudyPlan platform={platform} onAdd={() => setTaskOpen(true)} />
                }
              />
              <Route path="/insights" element={<StudyInsights platform={platform} onPlatformChange={changePlatform} />} />
              <Route path="/profile" element={<Suspense fallback={<Spinner />}><PersonalCenter settings={<StudySettings />} /></Suspense>} />
              <Route path="/settings" element={<Navigate to="/profile?tab=settings" replace />} />
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
      {taskOpen && (
        <TaskEditor platform={platform} onClose={() => setTaskOpen(false)} />
      )}
    </StudyTimeProvider>
    </SessionContext.Provider>
  );
}

import { Suspense, lazy, useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { Activity, ArrowUpRight, Bell, CircleAlert, Database, FolderOpen, GraduationCap, LayoutDashboard, LoaderCircle, LogOut, Menu, Palette, Settings2, ShieldCheck, Users, X } from "lucide-react";
import { api, emptySession, getSession, setApiIdentity } from "../../shared/api/client";
import type { Session } from "../../shared/api/client";
import { SessionContext } from "../../shared/auth/session";
import { configureBrowserConfig } from "../../shared/config/public.mjs";
import { useSpaceTheme } from "../../shared/theme/use-space-theme";
import AuthScreen from "../../features/identity/AuthScreen";
import PasswordSettings from "../../features/identity/PasswordSettings";
import "../../features/admin/admin.css";
const AdminWorkspace = lazy(() => import("../../features/admin/AdminWorkspace"));
const navigation = [
  { to: "/", label: "管理总览", icon: LayoutDashboard, end: true },
  { to: "/users", label: "用户与账号", icon: Users },
  { to: "/data", label: "账号与服务", icon: Database },
  { to: "/resources", label: "资源中心", icon: FolderOpen },
  { to: "/appearance", label: "主题与外观", icon: Palette },
  { to: "/configuration", label: "平台集成配置", icon: Settings2 },
  { to: "/announcements", label: "学习公告", icon: Bell },
  { to: "/audit", label: "操作审计", icon: Activity },
  { to: "/operations", label: "运行诊断", icon: Activity },
];
function Loading() { return <div className="management-loading" role="status"><LoaderCircle size={23} className="spin" /><span>正在打开管理空间…</span></div>; }

export default function AdminApp() {
  useSpaceTheme("admin");
  const [session, setSession] = useState<Session>(emptySession);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(() => matchMedia("(max-width: 850px)").matches);
  const location = useLocation();
  function accept(value: Session) {
    configureBrowserConfig(value.browserConfig);
    const normalized = { ...emptySession, ...value, platforms: { ...emptySession.platforms, ...value.platforms } };
    setApiIdentity(value.authenticated ? value.user?.id : undefined);
    setSession(normalized); setError("");
  }
  async function refresh() {
    try { accept(await getSession()); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBooting(false); }
  }
  async function logout() {
    setLoggingOut(true); setError("");
    try { await api("/api/auth/logout", { method: "POST" }); accept(emptySession); }
    catch (cause) { setError((cause as Error).message); }
    finally { setLoggingOut(false); }
  }
  useEffect(() => {
    void refresh();
    const changed = () => { void refresh(); };
    window.addEventListener("study-session-expired", changed);
    window.addEventListener("study-identity-changed", changed);
    return () => { window.removeEventListener("study-session-expired", changed); window.removeEventListener("study-identity-changed", changed); };
  }, []);
  useEffect(() => {
    const media = matchMedia("(max-width: 850px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => { setMobileOpen(false); window.scrollTo(0, 0); }, [location.pathname, session.user?.id]);
  if (booting) return <Loading />;
  if (!session.authenticated) return <AuthScreen space="admin" onAuthenticated={accept} />;
  if (session.user?.role !== "admin") return <div className="management-loading"><ShieldCheck size={30} /><h1>当前账号没有管理权限</h1><p>请使用管理员身份登录管理空间。</p><button className="btn btn-primary" disabled={loggingOut} onClick={() => void logout()}>返回管理登录</button></div>;
  const activePage = navigation.find(item => item.end ? location.pathname === "/" : location.pathname.startsWith(item.to));
  const activeLabel = activePage?.label || "管理账号";
  const PageIcon = activePage?.icon || ShieldCheck;
  return <SessionContext.Provider value={{ session, refresh, openLogin: () => { void logout(); } }}>
    <div className="management-shell" key={session.user.id}>
      <a className="skip-link" href="#management-content">跳到管理内容</a>
      {mobileOpen && <button className="management-backdrop" aria-label="收起管理导航" onClick={() => setMobileOpen(false)} />}
      <aside id="management-sidebar" className={`management-sidebar ${mobileOpen ? "is-open" : ""}`} inert={compact && !mobileOpen}>
        <Link className="management-brand" to="/"><span><GraduationCap size={32} /></span><div>知序 <small>Admin</small><p>学习系统管理空间</p></div></Link>
        <p className="management-nav-caption">空间管理</p>
        <nav aria-label="管理空间导航">{navigation.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end}><Icon size={19} /><span>{label}</span></NavLink>)}</nav>
        <div className="management-sidebar-bottom"><a className="management-space-switch" href="/learn/"><span>进入学习空间<small>使用独立的学习登录</small></span><ArrowUpRight size={17} /></a><p><ShieldCheck size={14} /> 独立管理会话</p></div>
      </aside>
      <div className="management-body">
        <header className="management-header">
          <div className="management-header-context">
            <button className="icon-button management-menu" aria-label={mobileOpen ? "收起管理导航" : "展开管理导航"} aria-controls="management-sidebar" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X size={21} /> : <Menu size={21} />}</button>
            <span className="management-space-label">管理空间</span>
            <span className="management-location"><PageIcon size={17} aria-hidden="true" /><strong>{activeLabel}</strong></span>
          </div>
          <div className="management-header-actions">
            <NavLink className="management-account" to="/account" aria-label="管理账号" title={session.user.displayName}><ShieldCheck size={16} /><span>{session.user.displayName}</span></NavLink>
            <button className="management-logout" aria-label="退出管理" onClick={() => void logout()} disabled={loggingOut}><LogOut size={16} /><span>{loggingOut ? "退出中…" : "退出"}</span></button>
          </div>
        </header>
        <main id="management-content" className="management-content" tabIndex={-1}>
          {error && <div className="error-banner" role="alert"><CircleAlert size={17} /><span>{error}</span><button className="text-link" onClick={() => void refresh()}>重试</button></div>}
          <Suspense fallback={<Loading />}><Routes><Route path="/account" element={<><h1 className="sr-only">管理账号</h1><PasswordSettings /></>} /><Route path="/*" element={<AdminWorkspace />} /></Routes></Suspense>
          <footer className="management-footer">知序 · 学习系统管理 <span>配置平台，连接学习</span></footer>
        </main>
      </div>
    </div>
  </SessionContext.Provider>;
}

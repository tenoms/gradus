import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { BookOpen, Check, ChevronRight, CircleAlert, Code2, GraduationCap, LoaderCircle, Monitor, Moon, Palette, RefreshCw, RotateCcw, Save, Sigma, Sun } from "lucide-react";
import { appearanceModes, appearancePalettes } from "../../../../shared/appearance.mjs";
import type { AppearanceTheme, ThemeMode } from "../../../../shared/appearance.mjs";
import { themeVariables } from "../../../shared/theme/theme-tokens.mjs";
import { useAppearanceSettings } from "./use-appearance-settings";
import "./appearance-settings.css";

const modeIcons = { system: Monitor, light: Sun, dark: Moon };
const platforms = [
  { id: "math" as const, label: "考研数学", description: "教辅阅读、课程与专项练习", icon: Sigma },
  { id: "computer" as const, label: "计算机 408", description: "四科知识、课程与章节练习", icon: Code2 },
];
const savedTime = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "使用推荐主题";

function ThemePreview({ platform, theme, systemDark }: { platform: "math" | "computer"; theme: AppearanceTheme; systemDark: boolean }) {
  const dark = theme.mode === "system" ? systemDark : theme.mode === "dark";
  const scheme = dark ? "dark" : "light";
  const label = platform === "math" ? "考研数学" : "计算机 408";
  return <section className="appearance-preview" aria-label={`${label}主题预览`} data-preview-mode={scheme} style={{ ...themeVariables(theme.palette, scheme), colorScheme: scheme } as CSSProperties}>
    <div className="appearance-preview-bar"><span><i /><i /><i /></span><small>{label} · {dark ? "深色" : "浅色"}预览</small></div>
    <div className="appearance-preview-layout">
      <aside><span className="appearance-preview-brand"><GraduationCap size={20} />知序</span><span className="is-active"><BookOpen size={12} />学习内容</span><span className="appearance-preview-nav-line" /><span className="appearance-preview-nav-line short" /></aside>
      <div className="appearance-preview-content"><div className="appearance-preview-eyebrow">接着上一次的学习</div><strong>{platform === "math" ? "高等数学 · 极限与连续" : "数据结构 · 线性表"}</strong><p>{platform === "math" ? "循序理解每一个知识点" : "构建清晰的知识框架"}</p><div className="appearance-preview-progress"><span /></div><div className="appearance-preview-card"><span><i /><span>今日学习计划<small>已完成 2 / 3 项</small></span></span><Check size={14} /></div><span className="appearance-preview-action">继续学习<ChevronRight size={13} /></span></div>
    </div>
  </section>;
}

export default function AppearanceSettings() {
  const settings = useAppearanceSettings();
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const change = () => setSystemDark(media.matches);
    change(); media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const busy = settings.loading || settings.pending;
  return <div className="appearance-settings">
    <header className="appearance-heading"><span className="appearance-heading-icon"><Palette size={24} /></span><div><h2>主题与外观</h2><p>统一切换明暗外观，分别设置数学与 408 的主题色。</p></div><span className="appearance-system-state"><Monitor size={14} />系统当前为{systemDark ? "深色" : "浅色"}</span></header>
    <div className="appearance-explanation"><span><Check size={16} />两科学习空间独立配色</span><span><Monitor size={16} />统一明暗模式与系统自适应</span><span><Palette size={16} />调整后可立即预览</span></div>
    {settings.error && <div className="appearance-message is-error" role="alert"><CircleAlert size={18} /><div><p>{settings.error}</p>{(settings.refreshRequired || !settings.saved) && <button type="button" className="text-link" disabled={busy} onClick={settings.reload}>{settings.refreshRequired ? "读取最新设置并重新调整" : "重新读取设置"}</button>}</div></div>}
    {settings.notice && <div className="appearance-message is-success" role="status"><Check size={18} /><p>{settings.notice}</p></div>}
    {settings.loading && !settings.draft ? <section className="panel appearance-loading" role="status"><LoaderCircle size={25} className="spin" /><p>正在读取空间主题…</p></section> : settings.draft && <>
      <section className="panel appearance-global-mode" aria-labelledby="appearance-global-mode-title">
        <header><span className="appearance-platform-symbol"><Monitor size={23} /></span><div><h3 id="appearance-global-mode-title">统一明暗模式</h3><p>为管理端和两科学习空间设置默认外观。</p></div></header>
        <fieldset className="appearance-mode-field" disabled={busy}><legend className="sr-only">明暗模式</legend><div className="appearance-mode-options">{appearanceModes.map(mode => {
          const ModeIcon = modeIcons[mode.value];
          return <label className={`appearance-mode ${settings.draft!.mode === mode.value ? "is-selected" : ""}`} key={mode.value}><input type="radio" name="appearance-mode" aria-label={`明暗模式：${mode.label}`} checked={settings.draft!.mode === mode.value} onChange={() => settings.setMode(mode.value as ThemeMode)} /><ModeIcon size={17} /><span>{mode.label}</span>{settings.draft!.mode === mode.value && <Check size={14} />}</label>;
        })}</div><p>{settings.draft.mode === "system" ? `将随系统自动切换，当前预览为${systemDark ? "深色" : "浅色"}。` : `将统一使用${settings.draft.mode === "dark" ? "深色" : "浅色"}外观。`}</p></fieldset>
      </section>
      <div className="appearance-platforms">{platforms.map(({ id, label, description, icon: Icon }) => {
        const theme = { ...settings.draft![id], mode: settings.draft!.mode };
        const preview = themeVariables(theme.palette, theme.mode === "dark" || theme.mode === "system" && systemDark ? "dark" : "light");
        return <section className="panel appearance-platform" aria-labelledby={`appearance-${id}-title`} key={id}>
          <header><span className="appearance-platform-symbol" style={{ color: preview["--accent"], background: preview["--accent-soft"] }}><Icon size={23} /></span><div><h3 id={`appearance-${id}-title`}>{label}</h3><p>{description}</p></div></header>
          <fieldset className="appearance-palette-field" disabled={busy}><legend>{label}主题色</legend><div className="appearance-palette-options">{appearancePalettes.map(palette => <label className={`appearance-palette ${theme.palette === palette.value ? "is-selected" : ""}`} key={palette.value}><input type="radio" name={`${id}-palette`} aria-label={`${label}主题色：${palette.label}`} checked={theme.palette === palette.value} onChange={() => settings.setTheme(id, { palette: palette.value })} /><span className="appearance-palette-swatch" style={{ background: themeVariables(palette.value, "light")["--accent"], color: themeVariables(palette.value, "light")["--on-accent"] }}>{theme.palette === palette.value && <Check size={17} />}</span><strong>{palette.label}</strong></label>)}</div></fieldset>
          <ThemePreview platform={id} theme={theme} systemDark={systemDark} />
        </section>;
      })}</div>
      <div className="appearance-save-bar" aria-busy={settings.pending}><div><div className="appearance-save-status"><strong><span className={settings.dirty ? "is-dirty" : ""} />{settings.pending ? "正在保存主题…" : settings.dirty ? "更改尚未保存" : "主题设置已同步"}</strong><button type="button" className="icon-button admin-inline-refresh" aria-label="重新读取设置" title="重新读取最新的空间主题设置" aria-busy={settings.loading} disabled={busy || settings.dirty} onClick={settings.reload}><RefreshCw size={14} className={settings.loading ? "spin" : ""} /></button></div><p>{settings.dirty ? "保存后应用到对应的学习空间。" : savedTime(settings.saved?.updatedAt)}</p></div><div className="appearance-save-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={settings.restoreDefaults}><RotateCcw size={15} />恢复推荐设置</button><button type="button" className="btn btn-secondary" disabled={busy || !settings.dirty} onClick={settings.discard}>放弃更改</button><button type="button" className="btn btn-primary" disabled={busy || !settings.dirty || settings.refreshRequired} onClick={() => void settings.save()}>{settings.pending ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}保存主题</button></div></div>

    </>}
  </div>;
}

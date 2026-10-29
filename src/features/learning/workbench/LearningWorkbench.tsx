import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Focus, Minimize2, Type } from "lucide-react";
import "./learning-workbench.css";

interface Preferences { focused: boolean; fontSize: number }
const PreferenceContext = createContext<{
  preferences: Preferences;
  update: (preferences: Preferences) => void;
} | null>(null);

/** Keeps reading preferences while a question's answer state is reset on navigation. */
export function LearningWorkbenchScope({ children }: { children: ReactNode }) {
  const [preferences, update] = useState<Preferences>({ focused: false, fontSize: 16 });
  return <PreferenceContext.Provider value={{ preferences, update }}>{children}</PreferenceContext.Provider>;
}

export default function LearningWorkbench({
  children,
  title,
  previous,
  next,
  disabled = false,
  tools,
}: {
  children: ReactNode;
  title: string;
  previous?: () => void;
  next?: () => void;
  disabled?: boolean;
  tools?: ReactNode;
}) {
  const scope = useContext(PreferenceContext);
  const [localPreferences, updateLocal] = useState<Preferences>({ focused: false, fontSize: 16 });
  const preferences = scope?.preferences || localPreferences;
  const update = scope?.update || updateLocal;
  const { focused, fontSize } = preferences;
  const setFocused = (focused: boolean) => update({ ...preferences, focused });
  const setFontSize = (fontSize: number) => update({ ...preferences, fontSize });
  const region = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focused) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    region.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = overflow; };
  }, [focused]);
  return (
    <section
      ref={region}
      className={`learning-workbench ${focused ? "is-focused" : ""}`}
      style={{ "--reading-size": `${fontSize}px` } as CSSProperties}
      aria-label={title}
      role={focused ? "dialog" : "region"}
      aria-modal={focused || undefined}
      tabIndex={-1}
      onPointerDown={(event) => {
        if (!(event.target as HTMLElement).closest("button, a, input, textarea, select, [contenteditable=true], [role=dialog]"))
          region.current?.focus({ preventScroll: true });
      }}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        const dialog = target.closest("[role=dialog]");
        if (event.defaultPrevented || (dialog && dialog !== region.current)) return;
        if (focused && event.key === "Tab") {
          const elements = Array.from(region.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]') || [])
            .filter((element) => element.offsetParent !== null);
          if (event.shiftKey && (document.activeElement === elements[0] || document.activeElement === region.current)) {
            event.preventDefault();
            elements.at(-1)?.focus();
          } else if (!event.shiftKey && document.activeElement === elements.at(-1)) {
            event.preventDefault();
            elements[0]?.focus();
          }
        }
        if (target.closest("input, textarea, select, [contenteditable=true]")) return;
        if (event.key === "Escape" && focused) {
          event.preventDefault();
          event.stopPropagation();
          setFocused(false);
        }
        if (!event.altKey || event.ctrlKey || event.metaKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const navigate = event.key === "ArrowLeft" ? previous : next;
        if (!disabled) navigate?.();
      }}
    >
      <div className="learning-workbench-toolbar">
        <div className="learning-workbench-caption">
          <strong>{title}</strong>
          <span title="先点击学习区域或工具栏，再使用快捷键">Alt + ← / → 切题</span>
        </div>
        <div className="learning-workbench-controls">
          {tools}
          <label className="learning-font-control">
            <Type size={15} aria-hidden="true" />
            <span className="sr-only">阅读字号</span>
            <select aria-label="阅读字号" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))}>
              <option value={16}>标准字号</option>
              <option value={18}>大字号</option>
              <option value={20}>特大字号</option>
            </select>
          </label>
          <button
            type="button"
            aria-pressed={focused}
            className="learning-tool-button"
            onClick={() => {
              setFocused(!focused);
              region.current?.focus({ preventScroll: true });
            }}
          >
            {focused ? <Minimize2 size={15} /> : <Focus size={15} />}
            {focused ? "退出专注" : "专注学习"}
          </button>
        </div>
      </div>
      {children}
    </section>
  );
}

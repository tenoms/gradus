import { useEffect, useRef, useState } from "react";
import { appearanceDefaults } from "../../../../shared/appearance.mjs";
import type { AppearanceConfig, AppearanceState, ThemeMode } from "../../../../shared/appearance.mjs";
import { api, ApiError } from "../../../shared/api/client";

const message = (cause: unknown) => cause instanceof Error ? cause.message : "请稍后重试";
const copy = (config: AppearanceConfig) => structuredClone(config);

export function useAppearanceSettings() {
  const [saved, setSaved] = useState<AppearanceState>();
  const [draft, setDraft] = useState<AppearanceConfig>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pendingRef = useRef(false);
  const dirty = !!saved && !!draft && JSON.stringify(saved.config) !== JSON.stringify(draft);
  function accept(value: AppearanceState) {
    setSaved(value); setDraft(copy(value.config)); setRefreshRequired(false);
  }
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    api<AppearanceState>("/api/admin/appearance").then(value => { if (active) accept(value); })
      .catch(cause => { if (active) setError(`主题设置读取失败：${message(cause)}`); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  function setTheme(platform: "math" | "computer", value: Partial<AppearanceConfig["math"]>) {
    if (pendingRef.current || loading) return;
    setDraft(current => current ? { ...current, [platform]: { ...current[platform], ...value } } : current);
    setNotice(""); if (!refreshRequired) setError("");
  }
  function setMode(mode: ThemeMode) {
    if (pendingRef.current || loading) return;
    setDraft(current => current ? { ...current, mode } : current);
    setNotice(""); if (!refreshRequired) setError("");
  }
  function discard() {
    if (!saved || pendingRef.current) return;
    setDraft(copy(saved.config)); setNotice(""); if (!refreshRequired) setError("");
  }
  function restoreDefaults() {
    if (pendingRef.current || loading) return;
    setDraft(appearanceDefaults()); setNotice("推荐设置已填入，保存后应用到学习空间。");
    if (!refreshRequired) setError("");
  }
  async function save() {
    if (!saved || !draft || !dirty || pendingRef.current || loading || refreshRequired) return;
    pendingRef.current = true; setPending(true); setError(""); setNotice("");
    try {
      const value = await api<AppearanceState>("/api/admin/appearance", { method: "PUT", body: JSON.stringify({ revision: saved.revision, config: copy(draft) }) });
      accept(value);
      window.dispatchEvent(new CustomEvent("study-appearance-updated", { detail: value }));
      setNotice("主题设置已保存，两科将使用统一明暗模式与各自配色。");
    } catch (cause) {
      const conflict = cause instanceof ApiError && cause.status === 409;
      const unknown = !(cause instanceof ApiError) || cause.status >= 500;
      setRefreshRequired(conflict || unknown);
      setError(conflict ? "主题设置已在其他页面更新，请读取最新设置后重新调整。" : unknown ? `未能确认是否保存成功，请重新读取设置后核实。${message(cause)}` : message(cause));
    } finally { pendingRef.current = false; setPending(false); }
  }
  return { saved, draft, loading, pending, error, notice, refreshRequired, dirty, setTheme, setMode, discard, restoreDefaults, save,
    reload: () => { if (!pendingRef.current) { setNotice(""); setAttempt(value => value + 1); } } };
}

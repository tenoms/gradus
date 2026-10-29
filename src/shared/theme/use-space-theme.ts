import { useEffect, useLayoutEffect, useState } from 'react';
import { appearanceDefaults, normalizeAppearanceConfig, validateAppearanceConfig } from '../../../shared/appearance.mjs';
import type { AppearanceConfig, AppearanceState } from '../../../shared/appearance.mjs';
import { api } from '../api/client';
import { resolvedScheme, themeVariables } from './theme-tokens.mjs';
import { effectiveTheme, parseThemePreference, readThemePreference, themePreferenceDefaults, themePreferenceEvent, themePreferenceKey, validateThemePreference, writeThemePreference } from './preferences.mjs';
import type { ThemePreference } from './preferences.mjs';

const cacheKey = 'study-appearance';
function cachedAppearance(): AppearanceConfig {
  try { return normalizeAppearanceConfig(JSON.parse(localStorage.getItem(cacheKey) || 'null').config); }
  catch { return appearanceDefaults(); }
}

export function useSpaceTheme(space: 'math' | 'computer' | 'admin') {
  const [configuration, setConfiguration] = useState(cachedAppearance);
  const [preferences, setPreferences] = useState(readThemePreference);
  const [preferencePersisted, setPreferencePersisted] = useState(true);
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const changed = () => setSystemDark(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    const changed = (event: Event) => {
      try {
        const value = (event as CustomEvent<{ preferences: ThemePreference; persisted: boolean }>).detail;
        setPreferences(validateThemePreference(value.preferences)); setPreferencePersisted(value.persisted);
      } catch { /* Ignore incomplete local preference events. */ }
    };
    const storage = (event: StorageEvent) => {
      if (event.key === themePreferenceKey || event.key === null) {
        setPreferences(event.key === null ? themePreferenceDefaults() : parseThemePreference(event.newValue));
        setPreferencePersisted(true);
      }
    };
    window.addEventListener(themePreferenceEvent, changed);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener(themePreferenceEvent, changed); window.removeEventListener('storage', storage); };
  }, []);
  useEffect(() => {
    let active = true;
    function accept(state: AppearanceState, save = true) {
      try {
        const config = validateAppearanceConfig(state.config);
        if (!active) return;
        setConfiguration(config);
        if (save) { try { localStorage.setItem(cacheKey, JSON.stringify({ ...state, config })); } catch { /* Theme still works when browser storage is unavailable. */ } }
      } catch { /* Keep the current theme if a configuration response is invalid. */ }
    }
    const refresh = () => { void api<AppearanceState>('/api/appearance').then(value => accept(value)).catch(() => {}); };
    const changed = (event: Event) => accept((event as CustomEvent<AppearanceState>).detail);
    const storage = (event: StorageEvent) => {
      if (event.key === cacheKey && event.newValue) { try { accept(JSON.parse(event.newValue), false); } catch { /* Ignore incomplete browser cache values. */ } }
    };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    window.addEventListener('study-appearance-updated', changed);
    window.addEventListener('storage', storage);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; window.removeEventListener('study-appearance-updated', changed); window.removeEventListener('storage', storage); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);
  function setPreference(change: Partial<ThemePreference>) {
    const next = validateThemePreference({ ...preferences, ...change });
    const persisted = writeThemePreference(next);
    setPreferences(next); setPreferencePersisted(persisted);
    window.dispatchEvent(new CustomEvent(themePreferenceEvent, { detail: { preferences: next, persisted } }));
  }
  const resetPreference = () => setPreference(themePreferenceDefaults());
  const theme = effectiveTheme(configuration, space, preferences);
  const scheme = resolvedScheme(theme.mode, systemDark);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = scheme; root.dataset.palette = theme.palette; root.dataset.space = space;
    root.style.colorScheme = scheme;
    for (const [name, value] of Object.entries(themeVariables(theme.palette, scheme))) root.style.setProperty(name, value);
  }, [space, scheme, theme.palette]);
  return { configuration, scheme, palette: theme.palette, preferences, setPreference, resetPreference, preferencePersisted, systemDark };
}

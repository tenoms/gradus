import { useEffect, useLayoutEffect, useState } from 'react';
import { appearanceDefaults, validateAppearanceConfig } from '../../../shared/appearance.mjs';
import type { AppearanceConfig, AppearanceState } from '../../../shared/appearance.mjs';
import { api } from '../api/client';
import { resolvedScheme, themeVariables } from './theme-tokens.mjs';

const cacheKey = 'study-appearance';
function cachedAppearance(): AppearanceConfig {
  try { return validateAppearanceConfig(JSON.parse(localStorage.getItem(cacheKey) || 'null').config); }
  catch { return appearanceDefaults(); }
}

export function useSpaceTheme(space: 'math' | 'computer' | 'admin') {
  const [configuration, setConfiguration] = useState(cachedAppearance);
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const changed = () => setSystemDark(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
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
  const theme = space === 'admin' ? { palette: 'violet' as const, mode: 'system' as const } : configuration[space];
  const scheme = resolvedScheme(theme.mode, systemDark);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = scheme; root.dataset.palette = theme.palette; root.dataset.space = space;
    root.style.colorScheme = scheme;
    for (const [name, value] of Object.entries(themeVariables(theme.palette, scheme))) root.style.setProperty(name, value);
  }, [space, scheme, theme.palette]);
  return { configuration, scheme, palette: theme.palette };
}

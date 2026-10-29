import type { ThemePalette, ThemeMode } from '../../../shared/appearance.mjs';
export function themeVariables(palette?: ThemePalette, scheme?: 'light' | 'dark'): Record<string, string>;
export function resolvedScheme(mode: ThemeMode, systemDark: boolean): 'light' | 'dark';

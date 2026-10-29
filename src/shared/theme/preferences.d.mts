import type { AppearanceConfig, AppearanceTheme, ThemeMode, ThemePalette } from '../../../shared/appearance.mjs';
export interface SubjectThemePreference { palette: 'managed' | ThemePalette }
export interface ThemePreference { mode: 'managed' | ThemeMode; math: SubjectThemePreference; computer: SubjectThemePreference }
export const themePreferenceKey: string;
export const themePreferenceEvent: string;
export function themePreferenceDefaults(): ThemePreference;
export function validateThemePreference(input: unknown): ThemePreference;
export function parseThemePreference(value?: string | null): ThemePreference;
export function readThemePreference(storage?: Pick<Storage, 'getItem'>): ThemePreference;
export function writeThemePreference(preference: ThemePreference, storage?: Pick<Storage, 'setItem' | 'removeItem'>): boolean;
export function effectiveTheme(configuration: AppearanceConfig, space: 'math' | 'computer' | 'admin', preference?: ThemePreference): AppearanceTheme;

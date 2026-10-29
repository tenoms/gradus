export type ThemePalette = 'violet' | 'blue' | 'teal' | 'amber' | 'rose';
export type ThemeMode = 'system' | 'light' | 'dark';
export interface AppearanceTheme { palette: ThemePalette; mode: ThemeMode }
export interface AppearanceConfig { math: AppearanceTheme; computer: AppearanceTheme }
export interface AppearanceState { revision: number; config: AppearanceConfig; updatedAt: string | null }
export const appearancePalettes: readonly { readonly value: ThemePalette; readonly label: string }[];
export const appearanceModes: readonly { readonly value: ThemeMode; readonly label: string }[];
export function appearanceDefaults(): AppearanceConfig;
export function validateAppearanceConfig(input: unknown): AppearanceConfig;

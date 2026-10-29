import { appearanceModes, appearancePalettes } from '../../../shared/appearance.mjs';

export const themePreferenceKey = 'study-theme-preference';
export const themePreferenceEvent = 'study-theme-preference-updated';
export const themePreferenceDefaults = () => ({ palette: 'managed', mode: 'managed' });

export function validateThemePreference(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 2
    || !['managed', ...appearancePalettes.map(item => item.value)].includes(input.palette)
    || !['managed', ...appearanceModes.map(item => item.value)].includes(input.mode)) throw new Error('主题偏好格式不正确');
  return { palette: input.palette, mode: input.mode };
}

export function parseThemePreference(value) {
  try { return validateThemePreference(JSON.parse(value)); }
  catch { return themePreferenceDefaults(); }
}

export function readThemePreference(storage) {
  try { return parseThemePreference((storage || globalThis.localStorage)?.getItem(themePreferenceKey)); }
  catch { return themePreferenceDefaults(); }
}

/** Browser preferences contain only appearance choices and never use a learning API. */
export function writeThemePreference(preference, storage) {
  const value = validateThemePreference(preference);
  try {
    const target = storage || globalThis.localStorage;
    if (!target) return false;
    if (value.palette === 'managed' && value.mode === 'managed') target.removeItem(themePreferenceKey);
    else target.setItem(themePreferenceKey, JSON.stringify(value));
    return true;
  } catch { return false; }
}

export function effectiveTheme(configuration, space, preference = themePreferenceDefaults()) {
  if (space === 'admin') return { palette: 'violet', mode: configuration.mode };
  return {
    palette: preference.palette === 'managed' ? configuration[space].palette : preference.palette,
    mode: preference.mode === 'managed' ? configuration.mode : preference.mode,
  };
}

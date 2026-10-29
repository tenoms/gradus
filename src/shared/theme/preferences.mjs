import { appearanceModes, appearancePalettes } from '../../../shared/appearance.mjs';

export const themePreferenceKey = 'study-theme-preference';
export const themePreferenceEvent = 'study-theme-preference-updated';
export const themePreferenceDefaults = () => ({ mode: 'managed', math: { palette: 'managed' }, computer: { palette: 'managed' } });
const palettes = ['managed', ...appearancePalettes.map(item => item.value)];
const modes = ['managed', ...appearanceModes.map(item => item.value)];
const subjectPreference = value => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === 1 && palettes.includes(value.palette);

export function validateThemePreference(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 3
    || !modes.includes(input.mode) || !subjectPreference(input.math)
    || !subjectPreference(input.computer)) throw new Error('主题偏好格式不正确');
  return { mode: input.mode, math: { palette: input.math.palette }, computer: { palette: input.computer.palette } };
}

export function parseThemePreference(value) {
  try {
    const input = JSON.parse(value);
    // The former shared palette must not override both subjects after this fix.
    if (input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).length === 2
      && palettes.includes(input.palette) && modes.includes(input.mode)) return { ...themePreferenceDefaults(), mode: input.mode };
    return validateThemePreference(input);
  }
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
    if (value.math.palette === 'managed' && value.computer.palette === 'managed' && value.mode === 'managed') target.removeItem(themePreferenceKey);
    else target.setItem(themePreferenceKey, JSON.stringify(value));
    return true;
  } catch { return false; }
}

export function effectiveTheme(configuration, space, preference = themePreferenceDefaults()) {
  if (space === 'admin') return { palette: 'violet', mode: configuration.mode };
  return {
    palette: preference[space].palette === 'managed' ? configuration[space].palette : preference[space].palette,
    mode: preference.mode === 'managed' ? configuration.mode : preference.mode,
  };
}

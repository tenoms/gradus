export const appearancePalettes = Object.freeze([
  { value: 'violet', label: '鸢尾紫' },
  { value: 'blue', label: '晴空蓝' },
  { value: 'teal', label: '松石绿' },
  { value: 'amber', label: '琥珀橙' },
  { value: 'rose', label: '蔷薇粉' },
].map(Object.freeze));

export const appearanceModes = Object.freeze([
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
].map(Object.freeze));

export function appearanceDefaults() {
  return { mode: 'system', math: { palette: 'violet' }, computer: { palette: 'teal' } };
}

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export function validateAppearanceConfig(input) {
  if (!object(input) || Object.keys(input).length !== 3 || !Object.hasOwn(input, 'math') || !Object.hasOwn(input, 'computer') || !appearanceModes.some(item => item.value === input.mode))
    fail('主题配置需要包含统一明暗模式及数学和 408 的配色');
  const result = { mode: input.mode };
  for (const platform of ['math', 'computer']) {
    const theme = input[platform];
    if (!object(theme) || Object.keys(theme).length !== 1 || !appearancePalettes.some(item => item.value === theme.palette))
      fail(`${platform === 'math' ? '数学' : '408'}空间的主题色不正确`);
    result[platform] = { palette: theme.palette };
  }
  return result;
}

/** Read previously saved settings without changing their revision or the subject colors. */
export function normalizeAppearanceConfig(input) {
  if (object(input) && !Object.hasOwn(input, 'mode') && Object.keys(input).length === 2 && ['math', 'computer'].every(platform => object(input[platform]) && Object.keys(input[platform]).length === 2 && appearanceModes.some(item => item.value === input[platform].mode))) {
    return validateAppearanceConfig({ mode: input.math.mode === input.computer.mode ? input.math.mode : 'system', math: { palette: input.math.palette }, computer: { palette: input.computer.palette } });
  }
  return validateAppearanceConfig(input);
}

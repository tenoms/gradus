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
  return { math: { palette: 'violet', mode: 'system' }, computer: { palette: 'teal', mode: 'system' } };
}

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export function validateAppearanceConfig(input) {
  if (!object(input) || Object.keys(input).length !== 2 || !Object.hasOwn(input, 'math') || !Object.hasOwn(input, 'computer'))
    fail('主题配置需要包含数学和 408 两个空间');
  const result = {};
  for (const platform of ['math', 'computer']) {
    const theme = input[platform];
    if (!object(theme) || Object.keys(theme).length !== 2 || !appearancePalettes.some(item => item.value === theme.palette) || !appearanceModes.some(item => item.value === theme.mode))
      fail(`${platform === 'math' ? '数学' : '408'}空间的主题色或明暗模式不正确`);
    result[platform] = { palette: theme.palette, mode: theme.mode };
  }
  return result;
}

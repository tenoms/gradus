const palettes = {
  violet: { light: ['#6750c8', '#5940b5', '#f0ecfb', '#d6ccf2'], dark: ['#b7a5f3', '#cbbbf9', '#29253f', '#554674'] },
  blue: { light: ['#2563b8', '#1d5099', '#eaf2ff', '#bfd4f3'], dark: ['#8bb9f7', '#afcffb', '#1c2d44', '#365777'] },
  teal: { light: ['#0f766e', '#0b615b', '#e7f5f1', '#b0dace'], dark: ['#71ccbc', '#94ddcf', '#19342f', '#386457'] },
  amber: { light: ['#966015', '#7e4c0c', '#fff4df', '#ebd09c'], dark: ['#edc075', '#f5d59c', '#382f20', '#705a36'] },
  rose: { light: ['#a83769', '#8d2857', '#fcebf2', '#eebdd0'], dark: ['#ee9ebf', '#f5bdd5', '#3a2531', '#75465d'] },
};
const surfaces = {
  light: {
    '--page-bg': '#f5f6fa', '--surface': '#ffffff', '--surface-soft': '#f5f7fa', '--surface-raised': '#ffffff',
    '--ink': '#202b3b', '--text-secondary': '#526174', '--muted': '#5f6e82', '--border': '#e2e7ef', '--border-strong': '#c7d0de',
    '--on-accent': '#ffffff', '--success': '#18724c', '--success-soft': '#eaf6ef', '--success-border': '#bddfc9',
    '--warning': '#8a5a12', '--warning-soft': '#fff5df', '--warning-border': '#ecd39f',
    '--danger': '#b53646', '--danger-soft': '#fff0f1', '--danger-border': '#edc2c7',
    '--info': '#2768a7', '--info-soft': '#edf5ff', '--info-border': '#c1d8f0',
    '--shadow': '0 3px 16px rgb(28 43 65 / 4%)', '--shadow-overlay': '0 22px 80px rgb(20 30 50 / 20%)',
    '--overlay': 'rgb(20 28 44 / 44%)',
  },
  dark: {
    '--page-bg': '#111821', '--surface': '#1a2431', '--surface-soft': '#202d3b', '--surface-raised': '#243242',
    '--ink': '#edf2f8', '--text-secondary': '#c0ccdb', '--muted': '#9cacc0', '--border': '#344354', '--border-strong': '#53657a',
    '--on-accent': '#121a25', '--success': '#82d4aa', '--success-soft': '#203a2e', '--success-border': '#3c6650',
    '--warning': '#edc47b', '--warning-soft': '#3b3222', '--warning-border': '#6d5933',
    '--danger': '#f1a1ab', '--danger-soft': '#402932', '--danger-border': '#77505a',
    '--info': '#99c7f3', '--info-soft': '#21354b', '--info-border': '#425e7e',
    '--shadow': '0 3px 18px rgb(0 0 0 / 12%)', '--shadow-overlay': '0 24px 90px rgb(0 0 0 / 40%)',
    '--overlay': 'rgb(3 8 15 / 65%)',
  },
};

const blend = (base, tint, weight) => `#${[1, 3, 5].map(index => Math.round(parseInt(base.slice(index, index + 2), 16) * (1 - weight) + parseInt(tint.slice(index, index + 2), 16) * weight).toString(16).padStart(2, '0')).join('')}`;
const neutral = color => {
  const gray = Math.round([.2126, .7152, .0722].reduce((sum, weight, index) => sum + parseInt(color.slice(1 + index * 2, 3 + index * 2), 16) * weight, 0)).toString(16).padStart(2, '0');
  return `#${gray.repeat(3)}`;
};

export function themeVariables(palette = 'violet', scheme = 'light') {
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const [accent, hover, soft, border] = (palettes[palette] || palettes.violet)[mode];
  return {
    ...surfaces[mode], '--accent': accent, '--accent-hover': hover, '--accent-soft': soft, '--accent-border': border,
    '--nav-foreground': blend(neutral(surfaces[mode]['--text-secondary']), accent, .25),
    '--success-solid': surfaces[mode]['--success'], '--danger-solid': surfaces[mode]['--danger'],
    '--warning-solid': surfaces[mode]['--warning'], '--info-solid': surfaces[mode]['--info'],
    '--focus-ring': accent, '--media-bg': '#10151f', '--on-media': '#ffffff', '--mint': surfaces[mode]['--success'],
    '--radius-sm': '8px', '--radius-md': '12px', '--radius-lg': '16px', '--motion-fast': '140ms',
  };
}

export function resolvedScheme(mode, systemDark) {
  return mode === 'dark' || (mode !== 'light' && systemDark) ? 'dark' : 'light';
}

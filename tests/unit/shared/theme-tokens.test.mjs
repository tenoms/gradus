import test from 'node:test';
import assert from 'node:assert/strict';
import { appearanceDefaults, appearancePalettes } from '../../../shared/appearance.mjs';
import { themeVariables, resolvedScheme } from '../../../src/shared/theme/theme-tokens.mjs';

const luminance = value => {
  const rgb = [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
};
const contrast = (a, b) => { const values = [luminance(a), luminance(b)].sort((a, b) => b - a); return (values[0] + .05) / (values[1] + .05); };

test('every subject palette keeps text, controls and status feedback readable in both schemes', () => {
  for (const { value } of appearancePalettes) for (const scheme of ['light', 'dark']) {
    const tokens = themeVariables(value, scheme);
    for (const color of ['--ink', '--text-secondary', '--muted', '--nav-foreground', '--accent', '--success', '--warning', '--danger', '--info']) {
      for (const background of ['--surface', '--surface-soft', '--surface-raised']) assert.ok(contrast(tokens[color], tokens[background]) >= 4.5, `${value} ${scheme} ${color} on ${background} must meet normal-text contrast`);
    }
    assert.ok(contrast(tokens['--on-accent'], tokens['--accent']) >= 4.5, `${value} ${scheme} primary action contrast`);
    for (const status of ['success', 'warning', 'danger', 'info']) assert.ok(contrast(tokens['--on-accent'], tokens[`--${status}-solid`]) >= 4.5, `${scheme} filled ${status} contrast`);
    assert.ok(contrast(tokens['--focus-ring'], tokens['--surface']) >= 3, `${scheme} focus indicator contrast`);
    assert.equal(tokens['--media-bg'], '#10151f');
    assert.equal(tokens['--on-media'], '#ffffff');
  }
});

test('the global scheme resolves immediately while subject palettes remain independent', () => {
  const config = appearanceDefaults();
  assert.equal(resolvedScheme(config.mode, false), 'light');
  assert.equal(resolvedScheme(config.mode, true), 'dark');
  assert.equal(resolvedScheme('light', true), 'light');
  assert.equal(resolvedScheme('dark', false), 'dark');
  assert.notEqual(themeVariables(config.math.palette)['--accent'], themeVariables(config.computer.palette)['--accent']);
});

test('resting navigation follows each palette softly and keeps its own hierarchy below active links', () => {
  for (const scheme of ['light', 'dark']) {
    const colors = appearancePalettes.map(({ value }) => {
      const tokens = themeVariables(value, scheme);
      assert.notEqual(tokens['--nav-foreground'], tokens['--accent']);
      assert.notEqual(tokens['--nav-foreground'], tokens['--text-secondary']);
      const channels = key => [1, 3, 5].map(index => parseInt(tokens[key].slice(index, index + 2), 16));
      const resting = channels('--nav-foreground'), active = channels('--accent');
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.equal(Math.sign(resting[i] - resting[j]), Math.sign(active[i] - active[j]), 'resting navigation must retain its palette hue rather than inherit a fixed blue cast');
      return tokens['--nav-foreground'];
    });
    assert.equal(new Set(colors).size, appearancePalettes.length);
  }
});

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
    for (const color of ['--ink', '--text-secondary', '--muted', '--accent', '--success', '--warning', '--danger', '--info']) {
      for (const background of ['--surface', '--surface-soft', '--surface-raised']) assert.ok(contrast(tokens[color], tokens[background]) >= 4.5, `${value} ${scheme} ${color} on ${background} must meet normal-text contrast`);
    }
    assert.ok(contrast(tokens['--on-accent'], tokens['--accent']) >= 4.5, `${value} ${scheme} primary action contrast`);
    for (const status of ['success', 'warning', 'danger', 'info']) assert.ok(contrast(tokens['--on-accent'], tokens[`--${status}-solid`]) >= 4.5, `${scheme} filled ${status} contrast`);
    assert.ok(contrast(tokens['--focus-ring'], tokens['--surface']) >= 3, `${scheme} focus indicator contrast`);
    assert.equal(tokens['--media-bg'], '#10151f');
    assert.equal(tokens['--on-media'], '#ffffff');
  }
});

test('system scheme resolves immediately while explicit subject choices remain independent', () => {
  const config = appearanceDefaults();
  assert.equal(resolvedScheme(config.math.mode, false), 'light');
  assert.equal(resolvedScheme(config.math.mode, true), 'dark');
  assert.equal(resolvedScheme('light', true), 'light');
  assert.equal(resolvedScheme('dark', false), 'dark');
  assert.notEqual(themeVariables(config.math.palette)['--accent'], themeVariables(config.computer.palette)['--accent']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { appearanceDefaults, appearanceModes, appearancePalettes, normalizeAppearanceConfig, validateAppearanceConfig } from '../../../shared/appearance.mjs';

test('every offered palette and appearance mode round-trips without sharing mutable defaults', () => {
  for (const palette of appearancePalettes) for (const mode of appearanceModes) {
    const config = appearanceDefaults(); config.math.palette = palette.value; config.mode = mode.value;
    const normalized = validateAppearanceConfig(config);
    assert.deepEqual(normalized, config);
    normalized.mode = mode.value === 'dark' ? 'light' : 'dark'; normalized.math.palette = 'rose';
    assert.equal(config.mode, mode.value, 'validated state owns its own global mode');
    assert.equal(config.math.palette, palette.value, 'validated state owns its own subject palette');
  }
  const changed = appearanceDefaults(); changed.computer.palette = 'rose';
  assert.equal(appearanceDefaults().computer.palette, 'teal');
});


test('previously saved per-subject modes normalize to one global choice without accepting the old write contract', () => {
  const prior = { math: { palette: 'rose', mode: 'dark' }, computer: { palette: 'blue', mode: 'dark' } };
  assert.deepEqual(normalizeAppearanceConfig(prior), { mode: 'dark', math: { palette: 'rose' }, computer: { palette: 'blue' } });
  assert.deepEqual(normalizeAppearanceConfig({ ...prior, computer: { palette: 'blue', mode: 'light' } }), { mode: 'system', math: { palette: 'rose' }, computer: { palette: 'blue' } });
  assert.throws(() => validateAppearanceConfig(prior), { status: 400 });
  assert.throws(() => normalizeAppearanceConfig({ ...prior, math: { palette: 'rose', mode: 'unrecognized' } }), { status: 400 });
  assert.deepEqual(normalizeAppearanceConfig(appearanceDefaults()), appearanceDefaults());
});

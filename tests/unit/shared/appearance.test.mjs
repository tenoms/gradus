import test from 'node:test';
import assert from 'node:assert/strict';
import { appearanceDefaults, appearanceModes, appearancePalettes, validateAppearanceConfig } from '../../../shared/appearance.mjs';

test('every offered palette and appearance mode round-trips without sharing mutable defaults', () => {
  for (const palette of appearancePalettes) for (const mode of appearanceModes) {
    const config = appearanceDefaults(); config.math = { palette: palette.value, mode: mode.value };
    const normalized = validateAppearanceConfig(config);
    assert.deepEqual(normalized, config);
    normalized.math.mode = 'dark';
    assert.equal(config.math.mode, mode.value, 'validated state owns its own subject settings');
  }
  const changed = appearanceDefaults(); changed.computer.palette = 'rose';
  assert.equal(appearanceDefaults().computer.palette, 'teal');
});

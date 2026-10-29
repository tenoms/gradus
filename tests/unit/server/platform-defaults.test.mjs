import test from 'node:test';
import assert from 'node:assert/strict';
import configuration from '../../../config/system.json' with { type: 'json' };
import { initialPlatformConfig } from '../../../server/integrations/platform-config.mjs';

test('initial platform configuration contains public presets and starts every credential empty', () => {
  const config = initialPlatformConfig();
  const publicPresets = structuredClone(config);
  for (const [section, fields] of Object.entries({ yyb: ['apiKey'], math: ['ocrUsername', 'ocrPassword'], computer: ['oauthClientSecret', 'videoKey', 'videoIv'] })) {
    for (const field of fields) {
      assert.equal(config[section][field], '', `${section}.${field} is entered through management`);
      assert.equal(Object.hasOwn(configuration.initialPlatforms[section], field), false, `${section}.${field} has no configuration file entry`);
      delete publicPresets[section][field];
    }
  }
  assert.deepEqual(publicPresets, configuration.initialPlatforms);
  config.math.stationId = 999;
  assert.equal(initialPlatformConfig().math.stationId, configuration.initialPlatforms.math.stationId);
});

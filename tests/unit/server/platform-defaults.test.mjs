import test from 'node:test';
import assert from 'node:assert/strict';
import configuration from '../../../config/system.json' with { type: 'json' };
import { initialPlatformConfig } from '../../../server/integrations/platform-config.mjs';

test('new installations leave providers unconfigured and disabled until management or environment supplies them', () => {
  const config = initialPlatformConfig();
  assert.equal(Object.hasOwn(configuration, 'initialPlatforms'), false);
  assert.equal(config.math.enabled, false);
  assert.equal(config.computer.enabled, false);
  for (const [section, fields] of Object.entries({
    yyb: ['baseUrl', 'apiKey'],
    math: ['baseUrl', 'appId', 'ocrUrl', 'ocrUsername', 'ocrPassword'],
    computer: ['baseUrl', 'appId', 'oauthClientId', 'oauthClientSecret', 'videoKey', 'videoIv'],
  })) for (const field of fields) assert.equal(config[section][field], '', `${section}.${field} has no provider preset`);
  assert.equal(config.math.stationId, 1);
  assert.equal(config.math.loginId, 1);
  assert.equal(config.computer.tenantCode, '1');
  config.math.stationId = 999;
  assert.equal(initialPlatformConfig().math.stationId, 1, 'configuration factories do not share mutable objects');
});

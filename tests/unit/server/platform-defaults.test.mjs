import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readPlatformDefaults } from '../../../server/integrations/platform-config.mjs';

const defaults = JSON.parse(readFileSync(new URL('../../../config/defaults.json', import.meta.url), 'utf8')).platforms;
function withFile(value, work) {
  const directory = mkdtempSync(path.join(tmpdir(), 'study-platform-config-'));
  const file = path.join(directory, 'deployment.json');
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  try { return work(file, directory); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

test('public platform defaults come from the checked-in configuration with no implicit credentials', () => {
  const config = readPlatformDefaults({ env: {}, configFile: false });
  assert.deepEqual(config, defaults);
  for (const [section, fields] of Object.entries({ yyb: ['apiKey'], math: ['ocrUsername', 'ocrPassword'], computer: ['oauthClientSecret', 'videoKey', 'videoIv'] })) {
    for (const field of fields) assert.equal(config[section][field], '', `${section}.${field} has no hidden credential fallback`);
  }
  config.math.stationId = 999;
  assert.equal(readPlatformDefaults({ env: {}, configFile: false }).math.stationId, defaults.math.stationId);
});

test('one deployment file overlays public defaults and explicit environment values win', () => withFile({ platforms: {
  yyb: { baseUrl: 'https://deployment.test/', apiKey: 'fixture-file-key' },
  math: { enabled: false, stationId: 7, baseUrl: 'https://math.deployment.test/', ocrUrl: 'https://ocr.deployment.test/', ocrPassword: 'fixture-ocr-password' },
  computer: { tenantCode: 'deployment-tenant' },
} }, file => {
  const config = readPlatformDefaults({ configFile: file, env: {
    YYB_BASE_URL: '', YYB_API_KEY: '', MATH_ENABLED: 'true', MATH_STATION_ID: '8',
    MATH_BASE_URL: '', MATH_OCR_URL: '', MATH_OCR_PASSWORD: '', COMPUTER_TENANT_CODE: 'environment-tenant',
  } });
  assert.equal(config.yyb.baseUrl, '');
  assert.equal(config.yyb.apiKey, '');
  assert.equal(config.math.enabled, true);
  assert.equal(config.math.stationId, 8);
  assert.equal(config.math.baseUrl, 'https://math.deployment.test');
  assert.equal(config.math.ocrUrl, '');
  assert.equal(config.math.ocrPassword, '');
  assert.equal(config.math.appId, defaults.math.appId);
  assert.equal(config.computer.tenantCode, 'environment-tenant');
}));

test('explicit file selection replaces the default local source and configFile false disables file overrides', () => withFile({ platforms: { math: { stationId: 6 } } }, file => {
  assert.equal(readPlatformDefaults({ env: { STUDY_CONFIG_FILE: file } }).math.stationId, 6);
  assert.equal(readPlatformDefaults({ env: { STUDY_CONFIG_FILE: '/missing-deployment.json' }, configFile: file }).math.stationId, 6);
  assert.equal(readPlatformDefaults({ env: { STUDY_CONFIG_FILE: file }, configFile: false }).math.stationId, defaults.math.stationId);
}));

test('invalid platform overrides fail before use without including supplied credential contents', () => {
  for (const env of [
    { MATH_STATION_ID: 'not-an-integer' }, { MATH_LOGIN_ID: '0' }, { MATH_ENABLED: 'sometimes' },
    { COMPUTER_VIDEO_KEY: 'fixture-private-short-key' }, { COMPUTER_APP_ID: 'invalid' }, { MATH_BASE_URL: 'file:///not-a-service' },
  ]) {
    assert.throws(() => readPlatformDefaults({ env, configFile: false }), error => {
      assert.equal(error.status, 400);
      assert.equal(error.message.includes('fixture-private-short-key'), false);
      return true;
    });
  }
  withFile({ platforms: { math: { unexpected: 'fixture-private-value' } } }, file => {
    assert.throws(() => readPlatformDefaults({ env: {}, configFile: file }), /未知配置字段/);
  });
  withFile({ platforms: { computer: { enabled: 'false' } } }, file => {
    assert.throws(() => readPlatformDefaults({ env: {}, configFile: file }), /启用状态/);
  });
});

test('explicit unreadable and invalid JSON configuration cannot silently fall back to development assets', () => {
  assert.throws(() => readPlatformDefaults({ env: {}, configFile: '/missing-platform-deployment.json' }), /无法读取配置文件/);
  withFile('{"platforms":{"yyb":{"apiKey":"fixture-private-content"}', file => {
    assert.throws(() => readPlatformDefaults({ env: {}, configFile: file }), error => {
      assert.match(error.message, /有效 JSON/);
      assert.equal(error.message.includes('fixture-private-content'), false);
      return true;
    });
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readBrowserConfig } from '../../../server/infrastructure/browser-config.mjs';

test('browser endpoints have no provider defaults and expose only the deployment allowlist', () => {
  assert.deepEqual(readBrowserConfig({ env: {} }), {
    math: { externalUrl: '', printStationId: 1 }, media: { polyvSdkUrl: '' },
  });
  assert.deepEqual(readBrowserConfig({ env: {
    MATH_EXTERNAL_URL: 'https://print.example.test/External/', MATH_PRINT_STATION_ID: '9',
    POLYV_SDK_URL: 'https://player.example.test/sdk.js',
    DATABASE_URL: 'postgresql://private:secret@localhost/test',
    YYB_API_KEY: 'server-private-key', COMPUTER_OAUTH_CLIENT_SECRET: 'server-private-oauth',
  } }), {
    math: { externalUrl: 'https://print.example.test/External/', printStationId: 9 },
    media: { polyvSdkUrl: 'https://player.example.test/sdk.js' },
  });
});

test('invalid browser endpoints and print station IDs fail with the deployment field name', () => {
  for (const [field, values] of Object.entries({
    MATH_EXTERNAL_URL: ['not-a-url', 'javascript:alert(1)', 'https://private:secret@print.example.test'],
    POLYV_SDK_URL: ['data:text/javascript,alert(1)', 'https://player.example.test/sdk.js?secret=value'],
    MATH_PRINT_STATION_ID: ['0', '-1', '1.5', 'invalid'],
  })) {
    for (const value of values) assert.throws(() => readBrowserConfig({ env: { [field]: value } }), new RegExp(field));
  }
});

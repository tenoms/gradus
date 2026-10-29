import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpstreamClient } from '../../../server/integrations/upstream.mjs';

test('computer login preserves a source avatar and sends no invented avatar when it is absent', async () => {
  const config = {
    yyb: { baseUrl: 'https://yyb.example.test', apiKey: '' },
    computer: { enabled: true, baseUrl: 'https://computer.example.test', appId: 'fixture-app', tenantCode: '1', oauthClientId: 'fixture-client', oauthClientSecret: 'fixture-secret' },
  };
  let sent;
  const client = createUpstreamClient(config, { requestTimeoutMs: 5000, requestJson: async (input, options) => {
    const pathname = new URL(input).pathname;
    if (pathname === '/wxapp/getCode') return { code: 0, data: { code: 'fixture-code' } };
    if (pathname === '/api/auth/wx/token') { sent = JSON.parse(options.body); return { access_token: 'fixture-token' }; }
    if (pathname === '/api/user/wx/user/detail') return { code: 200, data: { userId: 'fixture-user' } };
    throw new Error('Unexpected request');
  } });
  for (const [avatar, expected] of [
    ['https://source.example.test/avatar.png', 'https://source.example.test/avatar.png'],
    [undefined, ''],
    ['data:image/png;base64,fixture', ''],
  ]) {
    await client.loginPlatform('computer', { ref: 'fixture-ref', avatar });
    assert.equal(sent.previewUrl, expected);
  }
});

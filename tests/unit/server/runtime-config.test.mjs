import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuntimeConfig, validateRuntimeConfig } from '../../../server/infrastructure/runtime-config.mjs';
import { requestJson, createUpstreamClient } from '../../../server/integrations/upstream.mjs';
import { platformConfigFixture } from '../../support/platform-config.mjs';

test('runtime defaults preserve the existing listener, session and resource lifetimes', () => {
  const runtime = readRuntimeConfig({ env: {} });
  assert.equal(runtime.http.port, 3001);
  assert.equal(runtime.session.lifetimeMs, 24 * 60 * 60 * 1000);
  assert.equal(runtime.resources.publicTtlMs, 6 * 60 * 60 * 1000);
  assert.equal(runtime.accounts.directoryCacheTtlMs, 30_000);
  assert.equal(runtime.upstream.requestTimeoutMs, 25_000);
});

test('deployment environment supplies the connection and listener without mutating release defaults', () => {
  const defaults = readRuntimeConfig({ env: {} });
  const env = { HOST: '0.0.0.0', PORT: '4200', DATABASE_URL: 'postgresql://env-user:env-secret@localhost/env-db', STUDY_SCHEMA_PREFIX: 'environment', COOKIE_SECURE: '1' };
  const runtime = readRuntimeConfig({ env });
  assert.equal(runtime.http.host, '0.0.0.0');
  assert.equal(runtime.http.port, 4200);
  assert.equal(runtime.database.url, env.DATABASE_URL);
  assert.equal(runtime.database.schemaPrefix, 'environment');
  assert.equal(runtime.session.secureCookies, true);
  assert.equal(runtime.http.uploadBodyLimit, defaults.http.uploadBodyLimit);
  assert.equal(defaults.http.port, 3001);
  assert.equal(defaults.database.url, '');
  runtime.upstream.requestTimeoutMs = 1;
  assert.equal(readRuntimeConfig({ env: {} }).upstream.requestTimeoutMs, 25_000);
});

for (const [runtime, field] of [
  [{ http: { port: -1 } }, 'http.port'],
  [{ http: { jsonBodyLimit: 'unlimited' } }, 'http.jsonBodyLimit'],
  [{ database: { url: 'https://user:hidden-password@example.test/db' } }, 'database.url'],
  [{ database: { schemaPrefix: 'Invalid' } }, 'database.schemaPrefix'],
  [{ database: { maxConnections: 0 } }, 'database.maxConnections'],
  [{ session: { lifetimeMs: 0 } }, 'session.lifetimeMs'],
  [{ session: { secureCookies: 'true' } }, 'session.secureCookies'],
  [{ upstream: { requestTimeoutMs: 0 } }, 'upstream.requestTimeoutMs'],
  [{ diagnostics: { recentRequests: -1 } }, 'diagnostics.recentRequests'],
]) {
  test(`invalid runtime ${field} is rejected without echoing configuration values`, () => {
    const settings = readRuntimeConfig({ env: {} });
    for (const [section, values] of Object.entries(runtime)) Object.assign(settings[section], values);
    assert.throws(() => validateRuntimeConfig(settings), error => error.message.includes(field) && !error.message.includes('hidden-password'));
  });
}

test('invalid environment values are rejected rather than silently ignored', () => {
  assert.throws(() => readRuntimeConfig({ env: { PORT: 'not-a-port' } }), /http\.port/);
  assert.throws(() => readRuntimeConfig({ env: { COOKIE_SECURE: 'sometimes' } }), /secureCookies/);
});

test('the default transport and upstream client honor configured request deadlines', async () => {
  const originalFetch = globalThis.fetch;
  let aborted = 0;
  globalThis.fetch = async (_url, options) => new Promise((resolve, reject) => {
    const delayed = setTimeout(() => resolve(new Response(JSON.stringify({ code: 200, data: [] }))), 200);
    options.signal.addEventListener('abort', () => { aborted++; clearTimeout(delayed); reject(options.signal.reason); }, { once: true });
  });
  try {
    await assert.rejects(requestJson('https://transport.example', {}, 5), /上游请求超时/);
    const client = createUpstreamClient(platformConfigFixture(), { requestTimeoutMs: 5 });
    await assert.rejects(client.computerRequest('/api/exam/wx/course/courseList', {}, { token: 'fixture' }), /上游请求超时/);
    assert.equal(aborted, 2);
  } finally { globalThis.fetch = originalFetch; }
});

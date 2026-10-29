import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readRuntimeConfig } from '../../../server/infrastructure/runtime-config.mjs';
import { requestJson, createUpstreamClient } from '../../../server/integrations/upstream.mjs';
import { readPlatformDefaults } from '../../../server/integrations/platform-config.mjs';

function withConfiguration(runtime, work) {
  const directory = mkdtempSync(path.join(tmpdir(), 'study-runtime-config-'));
  const configFile = path.join(directory, 'deployment.json');
  writeFileSync(configFile, JSON.stringify({ runtime }));
  try { return work(configFile); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

test('runtime defaults preserve the existing listener, session and resource lifetimes', () => {
  const runtime = readRuntimeConfig({ env: {}, configFile: false });
  assert.equal(runtime.http.port, 3001);
  assert.equal(runtime.session.lifetimeMs, 24 * 60 * 60 * 1000);
  assert.equal(runtime.resources.publicTtlMs, 6 * 60 * 60 * 1000);
  assert.equal(runtime.accounts.directoryCacheTtlMs, 30_000);
  assert.equal(runtime.upstream.requestTimeoutMs, 25_000);
});

test('deployment files provide runtime settings and existing environment variables override them', () => {
  withConfiguration({
    http: { host: 'localhost', port: 4100, uploadBodyLimit: '2mb' },
    database: { url: 'postgresql://file-user:file-secret@localhost/file-db', schemaPrefix: 'file', maxConnections: 4 },
    session: { secureCookies: true, lifetimeMs: 45_000 },
  }, configFile => {
    const configured = readRuntimeConfig({ env: {}, configFile });
    assert.equal(configured.http.port, 4100);
    assert.equal(configured.database.maxConnections, 4);
    assert.equal(configured.session.lifetimeMs, 45_000);
    const env = { STUDY_CONFIG_FILE: configFile, HOST: '0.0.0.0', PORT: '4200', DATABASE_URL: 'postgresql://env-user:env-secret@localhost/env-db', STUDY_SCHEMA_PREFIX: 'environment', COOKIE_SECURE: '0' };
    const overridden = readRuntimeConfig({ env });
    assert.equal(overridden.http.host, '0.0.0.0');
    assert.equal(overridden.http.port, 4200);
    assert.equal(overridden.database.url, env.DATABASE_URL);
    assert.equal(overridden.database.schemaPrefix, 'environment');
    assert.equal(overridden.session.secureCookies, false);
    assert.equal(overridden.http.uploadBodyLimit, '2mb');
    assert.equal(configured.http.port, 4100, 'reading overrides does not mutate earlier configuration snapshots');
  });
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
    withConfiguration(runtime, configFile => assert.throws(() => readRuntimeConfig({ env: {}, configFile }), error => error.message.includes(field) && !error.message.includes('hidden-password')));
  });
}

test('invalid environment values are rejected rather than silently ignored', () => {
  assert.throws(() => readRuntimeConfig({ env: { PORT: 'not-a-port' }, configFile: false }), /http\.port/);
  assert.throws(() => readRuntimeConfig({ env: { COOKIE_SECURE: 'sometimes' }, configFile: false }), /secureCookies/);
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
    const client = createUpstreamClient(readPlatformDefaults({ env: {}, configFile: false }), { requestTimeoutMs: 5 });
    await assert.rejects(client.computerRequest('/api/exam/wx/course/courseList', {}, { token: 'fixture' }), /上游请求超时/);
    assert.equal(aborted, 2);
  } finally { globalThis.fetch = originalFetch; }
});

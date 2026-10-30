import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { createApp } from '../../server/app.mjs';
import { readRuntimeConfig } from '../../server/infrastructure/runtime-config.mjs';
import { requestJson } from '../../server/integrations/upstream.mjs';
import { playbackUrl } from '../../server/modules/resources/playback.mjs';
import { createTestDatabase } from '../../tests/support/database.mjs';
import { readLivePlatformConfig } from './managed-config.mjs';

const results = [], calls = [];
const report = { checkedAt: new Date().toISOString(), results, sourceRequests: calls, sourceLearningWrites: 0, businessDatabaseWrites: 0 };
const cleanError = error => String(error?.message || error).replace(/https?:\/\/\S+/g, '[URL omitted]');
const record = (name, evidence = {}) => {
  const result = { name, passed: true, ...evidence };
  results.push(result);
  console.log(JSON.stringify(result));
};

// Read the existing application's media snapshot without creating or changing its tables.
async function savedPlayback(config) {
  const { url, schemaPrefix, connectionTimeoutMs } = readRuntimeConfig().database;
  assert.match(schemaPrefix, /^[a-z][a-z0-9_]{0,53}$/);
  const database = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: connectionTimeoutMs });
  try {
    await database.query('BEGIN READ ONLY');
    const rows = (await database.query(`SELECT r.source_id,r.scope,r.kind,r.request,r.response,r.context,r.synced_at,s.metadata
      FROM "${schemaPrefix}_upstream".resources r JOIN "${schemaPrefix}_upstream".resource_sources s ON s.id=r.source_id
      WHERE r.platform='computer' AND r.kind='computer.media' AND r.request->>'path'='/api/exam/wx/course/get_play_info/v2'
        AND rtrim(s.metadata->>'baseUrl','/')=$1 AND s.metadata->>'appId' IS NOT DISTINCT FROM $2
        AND s.metadata->>'tenantCode' IS NOT DISTINCT FROM $3
      ORDER BY r.synced_at DESC LIMIT 20`, [String(config.computer.baseUrl).replace(/\/+$/, ''), config.computer.appId ?? null, config.computer.tenantCode == null ? null : String(config.computer.tenantCode)])).rows;
    await database.query('COMMIT');
    const saved = rows.find(row => playbackUrl(row.response));
    assert.ok(saved, '需要业务库中已保存且与当前平台配置匹配的真实计算机课程播放地址');
    return saved;
  } finally {
    await database.end();
  }
}

// Read only the small HLS manifest, never the complete video or an unbounded response.
async function checkPlaylist(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const reader = response.body?.getReader(), chunks = [];
  let bytes = 0, truncated = false;
  if (reader) try {
    while (bytes < 262144) {
      const next = await reader.read();
      if (next.done) break;
      const part = next.value.slice(0, 262144 - bytes);
      chunks.push(Buffer.from(part));
      bytes += part.byteLength;
      if (part.byteLength < next.value.byteLength || bytes === 262144) {
        truncated = true;
        await reader.cancel();
        break;
      }
    }
  } finally { reader.releaseLock(); }
  const isHls = Buffer.concat(chunks).toString('utf8').trimStart().startsWith('#EXTM3U');
  assert.ok(response.status === 200 && isHls, `真实课程播放清单应可读取，HTTP ${response.status}，HLS=${isHls}`);
  return { status: response.status, contentType: response.headers.get('content-type'), bytes, truncated, isHls };
}

let app, server, database;
try {
  const configurationDefaults = await readLivePlatformConfig();
  const saved = await savedPlayback(configurationDefaults);
  database = await createTestDatabase();
  const yybBase = configurationDefaults.yyb.baseUrl.replace(/\/+$/, '');
  app = await createApp({ database, configurationDefaults, configurationEnv: {}, requestJson: async (url, options = {}) => {
    const target = String(url), isYyb = target.startsWith(`${yybBase}/`);
    const path = isYyb ? target.slice(yybBase.length).split('?')[0] : new URL(target).pathname;
    const method = String(options.method || 'GET').toUpperCase();
    const allowed = isYyb
      ? method === 'GET' && ['/accounts', '/health'].includes(path) || method === 'POST' && path === '/wxapp/getCode'
      : method === 'GET' && ['/api/user/wx/user/detail', '/api/auth/wx/refreshToken', '/api/exam/wx/course/get_play_info/v2'].includes(path) || method === 'POST' && path === '/api/auth/wx/token';
    assert.ok(allowed, `课程验收禁止源学习写入：${method} ${path}`);
    const call = { service: isYyb ? 'yyb' : 'computer', path, method };
    calls.push(call);
    try { return await requestJson(url, options); }
    catch (error) { call.status = Number(error.status) || 502; throw error; }
  } });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`, password = randomBytes(20).toString('base64url');
  async function api(path, { auth, body, method = body === undefined ? 'GET' : 'POST', expected = 200 } = {}) {
    const response = await fetch(base + path, { method, signal: AbortSignal.timeout(60000),
      headers: { 'content-type': 'application/json', ...(auth ? { cookie: auth.cookie, 'X-Study-User': auth.id } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await response.json();
    if (expected !== null) assert.ok(response.status === expected, `${path}: HTTP ${response.status} ${cleanError(value.error || '')}`);
    return { value, response };
  }
  const credentials = result => ({ id: result.value.user.id, cookie: result.response.headers.get('set-cookie').split(';')[0] });
  const admin = credentials(await api('/api/system/setup', { expected: 201, body: { username: 'playback.admin', displayName: '课程地址验收', password } }));
  for (const username of ['playback.first', 'playback.second']) await api('/api/admin/users', { auth: admin, expected: 201, body: { username, displayName: username, password } });
  const first = credentials(await api('/api/learning/auth/login', { body: { username: 'playback.first', password } }));
  const second = credentials(await api('/api/learning/auth/login', { body: { username: 'playback.second', password } }));
  const settings = (await api('/api/admin/resource-sync', { auth: admin })).value.settings;
  await api('/api/admin/resource-sync', { auth: admin, method: 'PUT', body: { revision: settings.revision, enabled: true, refreshAfterDays: 30 } });
  await app.locals.resourceStore.save({ ...saved.metadata, id: saved.source_id, platform: 'computer' },
    { request: saved.request, context: saved.context, kind: saved.kind, scope: saved.scope }, saved.response, { scope: saved.scope });
  assert.equal(calls.length, 0, '临时用户初始化及真实快照导入不应连接任何源服务');
  record('业务库只读快照导入独立临时数据空间', { originalScope: saved.scope, originalSyncedAt: saved.synced_at, sourceRequests: 0 });

  const input = { ...saved.request, refresh: false };
  const read = (auth, refresh = false) => api('/api/learning/platform/computer', { auth, body: { ...input, refresh }, expected: null });
  const storedUrl = playbackUrl(saved.response);
  for (const auth of [first, first, second]) {
    const result = await read(auth);
    assert.ok(result.response.status === 200, `读取已保存播放地址应成功，HTTP ${result.response.status}`);
    assert.ok(playbackUrl(result.value) === storedUrl, '应复用真实已保存播放地址');
  }
  assert.equal(calls.length, 0, '连续及跨用户播放读取不能联系 YYB 或上游平台');
  record('连续与跨用户读取复用真实已保存播放地址', { reads: 3, yybRequests: 0, upstreamRequests: 0 });
  record('已保存地址的真实HLS清单可用', await checkPlaylist(storedUrl));

  let refreshed;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const before = calls.length, result = await read(first, true);
    if (result.response.status === 200 && playbackUrl(result.value)) {
      refreshed = result.value;
      record('显式刷新通过真实YYB重新取得课程地址', { attempt, sourceRequests: calls.length - before,
        yybRequests: calls.slice(before).filter(call => call.service === 'yyb').length,
        playbackRequests: calls.slice(before).filter(call => call.path === input.path).length,
        returnedUrlChanged: playbackUrl(refreshed) !== storedUrl });
      break;
    }
    const message = cleanError(result.value.error || '未取得播放地址');
    results.push({ name: '真实来源刷新尝试', passed: false, attempt, status: result.response.status, message });
    console.log(JSON.stringify(results.at(-1)));
    if (!message.includes('-13000')) break;
  }
  if (!refreshed) {
    const before = calls.length, fallback = await read(second);
    assert.ok(fallback.response.status === 200 && playbackUrl(fallback.value) === storedUrl, '真实源刷新失败后原地址仍应保留');
    assert.equal(calls.length, before);
    record('真实来源失败时已保存地址继续可读', { additionalSourceRequests: 0 });
    throw new Error('真实课程地址刷新未通过；已保存地址复用已通过，外部失败详见刷新尝试');
  }
  const refreshedUrl = playbackUrl(refreshed), persisted = await app.locals.resourceStore.findPlayback({ config: configurationDefaults, request: input });
  assert.ok(playbackUrl(persisted?.response) === refreshedUrl, '刷新取得的真实地址必须保存在临时数据库');
  const beforeRepeated = calls.length;
  for (const auth of [second, first]) {
    const repeated = await read(auth);
    assert.ok(repeated.response.status === 200 && playbackUrl(repeated.value) === refreshedUrl, '后续播放应复用刷新后地址');
  }
  assert.equal(calls.length, beforeRepeated, '刷新后重复播放不应再次访问源服务');
  record('刷新后地址已保存且跨用户重复播放不再请求来源', { reads: 2, additionalSourceRequests: 0 });
  record('刷新后真实HLS清单可用', await checkPlaylist(refreshedUrl));
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = cleanError(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  if (app) await app.locals.close();
  else if (database) await database.close();
  report.temporarySchemasCleaned = !!database;
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/computer-course-playback-live.json', JSON.stringify(report, null, 2) + '\n');
}

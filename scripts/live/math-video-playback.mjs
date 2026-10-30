import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { createApp } from '../../server/app.mjs';
import { readRuntimeConfig } from '../../server/infrastructure/runtime-config.mjs';
import { requestJson } from '../../server/integrations/upstream.mjs';
import { createTestDatabase } from '../../tests/support/database.mjs';
import { readLivePlatformConfig } from './managed-config.mjs';

const results = [], providerRequests = [];
const report = { checkedAt: new Date().toISOString(), results, providerRequests, yybRequests: 0, sourceLearningWrites: 0, businessDatabaseWrites: 0, fullVideoDownloads: 0,
  fixtureCoverage: { file: 'tests/integration/math-video.test.mjs', scope: '课程与题解 origin、VID/凭据变化后的稳定缓存键由集成夹具验证，本脚本仅验证业务库真实 VID。' } };
const cleanError = error => String(error?.message || error).replace(/https?:\/\/\S+/g, '[URL omitted]');
const record = (name, evidence = {}) => {
  const result = { name, passed: true, ...evidence };
  results.push(result);
  console.log(JSON.stringify(result));
};

async function savedVids(config) {
  const { url, schemaPrefix, connectionTimeoutMs } = readRuntimeConfig().database;
  assert.match(schemaPrefix, /^[a-z][a-z0-9_]{0,53}$/);
  const source = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: connectionTimeoutMs });
  try {
    await source.query('BEGIN READ ONLY');
    const rows = (await source.query(`SELECT r.response FROM "${schemaPrefix}_upstream".resources r
      JOIN "${schemaPrefix}_upstream".resource_sources s ON s.id=r.source_id
      WHERE r.platform='math' AND r.scope='public' AND r.response::text LIKE '%"PlayVid"%'
        AND rtrim(s.metadata->>'baseUrl','/')=$1 AND s.metadata->>'appId' IS NOT DISTINCT FROM $2
        AND s.metadata->>'stationId' IS NOT DISTINCT FROM $3
      ORDER BY r.synced_at DESC LIMIT 20`, [String(config.math.baseUrl).replace(/\/+$/, ''), config.math.appId ?? null, config.math.stationId == null ? null : String(config.math.stationId)])).rows;
    await source.query('COMMIT');
    const vids = new Set();
    function visit(value) {
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (!value || typeof value !== 'object') return;
      if (typeof value.PlayVid === 'string' && /^[A-Za-z\d_-]{1,128}$/.test(value.PlayVid)) vids.add(value.PlayVid);
      Object.values(value).forEach(visit);
    }
    rows.forEach(row => visit(row.response));
    assert.ok(vids.size, '需要业务库中与当前数学平台配置匹配的真实 PlayVid 资源');
    return [...vids].slice(0, 5);
  } finally { await source.end(); }
}

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
  assert.ok(response.status === 200 && isHls, `真实数学视频清单应可读取，HTTP ${response.status}，HLS=${isHls}`);
  return { status: response.status, contentType: response.headers.get('content-type'), bytes, truncated, isHls };
}

let database, app, server;
try {
  const configurationDefaults = await readLivePlatformConfig(), candidates = await savedVids(configurationDefaults);
  record('业务库只读取得数学视频标识', { candidateVids: candidates.length });
  database = await createTestDatabase();
  app = await createApp({ database, configurationDefaults, configurationEnv: {}, requestJson: async (target, options = {}) => {
    const url = new URL(target), method = String(options.method || 'GET').toUpperCase();
    const allowed = url.protocol === 'https:' && ['player.polyv.net', 'static.polyv.net'].includes(url.hostname)
      && /^\/secure\/[A-Za-z\d_-]{1,128}\.json$/.test(url.pathname) && method === 'GET';
    assert.ok(allowed, '真实 VID 验收只允许固定 Polyv 元数据读取，不能访问 YYB 或写入学习来源');
    const call = { host: url.hostname, pathTemplate: '/secure/:vid.json', method };
    providerRequests.push(call);
    try { return await requestJson(target, options); }
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
  const admin = credentials(await api('/api/system/setup', { expected: 201, body: { username: 'math.playback.admin', displayName: '数学视频验收', password } }));
  for (const username of ['math.playback.first', 'math.playback.second']) await api('/api/admin/users', { auth: admin, expected: 201, body: { username, displayName: username, password } });
  const login = async username => credentials(await api('/api/learning/auth/login', { body: { username, password } }));
  const first = await login('math.playback.first'), second = await login('math.playback.second');
  const settings = (await api('/api/admin/resource-sync', { auth: admin })).value.settings;
  await api('/api/admin/resource-sync', { auth: admin, method: 'PUT', body: { revision: settings.revision, enabled: true, refreshAfterDays: 30 } });
  assert.equal(providerRequests.length, 0);
  record('独立临时Web用户与同步设置初始化不访问来源', { providerRequests: 0, yybRequests: 0 });
  const video = (auth, body) => api('/api/learning/platform/math/video', { auth, body, expected: null });

  let vid, initial;
  for (const candidate of candidates) {
    const before = providerRequests.length, result = await video(first, { vid: candidate });
    if (result.response.status === 200 && /^https?:\/\//i.test(result.value.url || '')) {
      vid = candidate;
      initial = result.value;
      record('首次HTTP解析真实VID并保存播放地址', { providerRequests: providerRequests.length - before,
        vidFingerprint: createHash('sha256').update(vid).digest('hex').slice(0, 12), duration: initial.duration });
      break;
    }
    record('跳过当前不可用的历史VID', { passed: false, status: result.response.status, playable: false });
  }
  assert.ok(initial, '已保存的真实数学 VID 未能解析出可播放地址');
  const resources = (await app.locals.resourceStore.list({ platform: 'math', kind: 'math.media' })).resources;
  assert.equal(resources.length, 1, '首次成功解析应保存一份数学媒体资源');
  const saved = resources[0], selector = { sourceId: saved.sourceId, platform: 'math', key: saved.key };
  const detail = await app.locals.resourceStore.detail(selector);
  assert.ok(detail.response.url === initial.url, '保存的URL应与真实解析结果相同');
  assert.ok(detail.media.some(row => row.url === initial.url), '媒体索引应包含真实视频URL');
  record('数学媒体快照与URL索引持久化', { resourceCount: resources.length, scope: saved.scope, mediaReferences: detail.media.length, playableUrlIndexed: true });

  const beforeCached = providerRequests.length;
  for (const auth of [first, second, first]) {
    const result = await video(auth, { vid });
    assert.ok(result.response.status === 200 && result.value.url === initial.url, '连续及跨用户读取应复用已保存地址');
  }
  assert.equal(providerRequests.length, beforeCached);
  record('连续与跨用户读取不访问Polyv或YYB', { reads: 3, additionalProviderRequests: 0, yybRequests: 0 });
  record('首次真实数学HLS清单可用', await checkPlaylist(initial.url));

  const beforeRefresh = providerRequests.length, renewed = await video(first, { vid, refresh: true });
  assert.ok(renewed.response.status === 200 && /^https?:\/\//i.test(renewed.value.url || ''), '显式刷新应取得真实数学播放地址');
  assert.equal(providerRequests.length - beforeRefresh, 1, '当前真实VID刷新只需重新读取一次Polyv元数据');
  const updated = await app.locals.resourceStore.detail(selector);
  assert.ok(updated.response.url === renewed.value.url, '刷新后的地址应保存到原媒体记录');
  assert.ok(updated.media.some(row => row.url === renewed.value.url), '刷新后的地址应同步到媒体索引');
  assert.ok(Date.parse(updated.syncedAt) >= Date.parse(detail.syncedAt));
  assert.equal((await app.locals.resourceStore.list({ platform: 'math', kind: 'math.media' })).resources.length, 1);
  record('显式刷新重取一次Polyv并更新原缓存和媒体索引', { providerRequests: 1, yybRequests: 0, sameCacheKey: true, returnedUrlChanged: renewed.value.url !== initial.url });
  const beforeRepeated = providerRequests.length;
  for (const auth of [second, first]) {
    const result = await video(auth, { vid });
    assert.ok(result.response.status === 200 && result.value.url === renewed.value.url, '刷新后再次打开应复用刷新结果');
  }
  assert.equal(providerRequests.length, beforeRepeated);
  record('刷新后跨用户重复读取无额外来源请求', { reads: 2, additionalProviderRequests: 0, yybRequests: 0 });
  record('刷新后真实数学HLS清单可用', await checkPlaylist(renewed.value.url));
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
  writeFileSync('artifacts/math-video-playback-live.json', JSON.stringify(report, null, 2) + '\n');
}

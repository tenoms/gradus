import systemConfig from "../../config/system.json" with { type: "json" };
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTestDatabase } from '../../tests/support/database.mjs';
import { readLivePlatformConfig } from './managed-config.mjs';

const publicConfig = systemConfig.public;

// The optional source root lets the same real, read-only workload measure a Git baseline.
const sourceRoot = resolve(process.env.DIRECTORY_SOURCE_ROOT || '.');
const label = process.env.DIRECTORY_CHECK_LABEL || 'current';
assert.match(label, /^[a-z0-9-]+$/);
const { createApp } = await import(pathToFileURL(resolve(sourceRoot, 'server/app.mjs')));
const { requestJson } = await import(pathToFileURL(resolve(sourceRoot, 'server/integrations/upstream.mjs')));
const configurationDefaults = await readLivePlatformConfig();
const database = await createTestDatabase();
const calls = [], results = [];
let queryCount = 0;
const originalQuery = database.query;
database.query = (...args) => { queryCount++; return originalQuery(...args); };
const commands = new Set(['GetBookPaperListOfVip', 'GetBookListCountAndLookCount_New', 'GetQuestionNexts2', 'GetUserInfoByStuID']);
const authPaths = new Set(['/wxapp/getCode', '/api/OAuth2/Login', '/api/auth/wx/token']);
const app = await createApp({ database, configurationDefaults, configurationEnv: {}, requestJson: async (url, options = {}) => {
  const path = new URL(url).pathname, method = String(options.method || 'GET').toUpperCase();
  const command = options.body instanceof URLSearchParams ? options.body.get('command') : null;
  assert.ok(method === 'GET' || authPaths.has(path) || path.startsWith('/api/Master/') && commands.has(command), '性能验收只允许目录读取和认证');
  const entry = { path, ...(command ? { command } : {}) };
  calls.push(entry);
  const start = performance.now();
  try { return await requestJson(url, options); }
  finally { entry.durationMs = Math.round(performance.now() - start); }
} });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const password = randomBytes(20).toString('base64url');
async function request(path, { auth, body, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(auth ? { cookie: auth.cookie, 'X-Study-User': auth.id } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  assert.ok(response.ok, `${path}: HTTP ${response.status} ${data.error || ''}`);
  return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
const rows = response => {
  const data = response?.data ?? response?.Data ?? response;
  return Array.isArray(data?.[0]) ? data[0] : Array.isArray(data) ? data : data?.list || data?.groupList || data?.courseList || data?.records || [];
};
async function measure(name, work) {
  const callStart = calls.length, queryStart = queryCount, started = performance.now();
  const value = await work();
  const phase = calls.slice(callStart);
  const result = { name, passed: true, durationMs: Math.round(performance.now() - started), databaseQueries: queryCount - queryStart, upstreamRequests: phase.length, yybDirectoryRequests: phase.filter(call => call.path === '/accounts').length, calls: phase };
  results.push(result);
  console.log(JSON.stringify(result));
  return value;
}
try {
  assert.equal(calls.length, 0, '启动不访问源服务');
  const setup = await request('/api/system/setup', { body: { username: 'directory.admin', displayName: '目录性能验收', password } });
  const admin = { id: setup.data.user.id, cookie: setup.cookie };
  const pool = (await request('/api/admin/account-pool', { auth: admin })).data;
  const account = pool.accounts.find(account => account.status === 'alive');
  assert.ok(account, '需要一个真实可用 YYB 账号');
  await request('/api/admin/account-pool', { auth: admin, method: 'PUT', body: { revision: pool.revision, algorithm: pool.algorithm, enabledRefs: [account.ref] } });
  for (const username of ['directory.first', 'directory.second']) await request('/api/admin/users', { auth: admin, body: { username, displayName: username, password } });
  const login = async username => { const value = await request('/api/learning/auth/login', { body: { username, password } }); return { id: value.data.user.id, cookie: value.cookie }; };
  const a = await login('directory.first'), b = await login('directory.second');
  const platform = async (auth, name, body) => (await request(`/api/learning/platform/${name}`, { auth, body })).data;
  const command = (auth, command, data, model = false) => platform(auth, 'math', { path: model ? '/api/Master/Model' : '/api/Master/AutoModel', method: 'POST', data: { command, data: JSON.stringify(data) } });
  const get = (auth, name, path, query = {}) => platform(auth, name, { path, query });
  const books = auth => command(auth, 'GetBookPaperListOfVip', { IsValid: 1, IsBook: 1, IsBeta: 0, IsRecommend: '' }, true);
  const papers = auth => command(auth, 'GetBookListCountAndLookCount_New', { IsValid: 1, BusType: '试卷', IsBook: 1, IsBeta: 0, IsRecommend: '' }, true);
  const chapters = auth => get(auth, 'computer', '/api/exam/wx/practice/knowledge', { majorId: publicConfig.computer.subjects[0].id, examType: 3 });
  const courses = auth => get(auth, 'computer', '/api/exam/wx/course/courseList');
  let sync = (await request('/api/admin/resource-sync', { auth: admin })).data;
  await request('/api/admin/resource-sync', { auth: admin, method: 'PUT', body: { revision: sync.settings.revision, enabled: true } });
  const first = await measure('两科目录首次并行读取', () => Promise.all([books(a), papers(a), chapters(a), courses(a)]));
  first.forEach((response, index) => assert.ok(rows(response).length, `目录 ${index + 1} 应非空`));
  results.at(-1).catalogCounts = first.map(response => rows(response).length);
  const book = rows(first[0]).find(row => String(row.Name || '').includes('同济')) || rows(first[0])[0];
  const catalog = auth => command(auth, 'GetQuestionNexts2', { BookID: book.ID });
  const tree = await measure('书籍题目目录首次读取', () => catalog(a));
  assert.ok(rows(tree).length);
  results.at(-1).catalogRows = rows(tree).length;
  results.at(-1).catalogFields = Object.keys(rows(tree)[0]);
  const repeated = await measure('另一用户复用已保存公共目录', () => Promise.all([books(b), papers(b), chapters(b), courses(b), catalog(b)]));
  assert.deepEqual(repeated[0], first[0]);
  assert.equal(results.at(-1).upstreamRequests, 0, '公共目录缓存命中不读取上游');
  const listing = await app.locals.resourceStore.list({ platform: 'math', kind: 'math.catalog', pageSize: 100 });
  const saved = listing.resources[0];
  assert.ok(saved);
  await app.locals.resourceStore.invalidate(saved);
  const simultaneous = await measure('失效目录的八个并发读取', () => Promise.all(Array.from({ length: 8 }, (_, index) => catalog(index % 2 ? a : b))));
  simultaneous.forEach(response => assert.deepEqual(response, simultaneous[0]));
  assert.equal(results.at(-1).calls.filter(call => call.command === 'GetQuestionNexts2').length, 1, '同一公共目录并发只读取一次上游');
  const questionId = rows(tree)[0].QuestionID || rows(tree)[0].ID;
  const questionResources = auth => Promise.all([
    get(auth, 'math', '/api/question_list/GetQuestionByQuestionNew', { ID: questionId }),
    get(auth, 'math', '/api/question_list/GetQuestionByIDSoleDes', { ID: questionId, SortDesc: 'Sort' }),
  ]);
  const content = await measure('题干与解析通过服务端站点读取', () => questionResources(a));
  content.forEach(response => assert.ok(rows(response).length, '当前题目及解析应返回实际内容'));
  const sharedContent = await measure('另一用户复用题干与解析', () => questionResources(b));
  assert.deepEqual(sharedContent, content);
  assert.equal(results.at(-1).upstreamRequests, 0, '题目及解析应正常保存供其他用户复用');
  sync = (await request('/api/admin/resource-sync', { auth: admin })).data;
  await request('/api/admin/resource-sync', { auth: admin, method: 'PUT', body: { revision: sync.settings.revision, enabled: false } });
  await measure('同步关闭后已有目录仍从本地读取', () => catalog(a));
  assert.equal(results.at(-1).upstreamRequests, 0);
  console.log(JSON.stringify({ passed: true, sourceLearningWrites: 0, checks: results.length }));
} catch (error) {
  results.push({ name: '验收失败', passed: false, message: error.message });
  console.error(error.message);
  process.exitCode = 1;
} finally {
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(`artifacts/directory-loading-${label}.json`, JSON.stringify({ checkedAt: new Date().toISOString(), results, sourceLearningWrites: 0 }, null, 2) + '\n');
  await new Promise(resolve => server.close(resolve));
  await app.locals.close();
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuntimeConfig } from '../../server/infrastructure/runtime-config.mjs';
import { startHttpApp } from '../support/http-app.mjs';

test('configured session, payload, resource, account and diagnostic policies reach the HTTP application', async () => {
  const runtimeConfig = readRuntimeConfig({ env: {} });
  runtimeConfig.session = { lifetimeMs: 45_000, secureCookies: true };
  runtimeConfig.http.jsonBodyLimit = 256;
  runtimeConfig.http.uploadBodyLimit = 32;
  runtimeConfig.resources.publicTtlMs = 10_000;
  runtimeConfig.accounts.directoryCacheTtlMs = 0;
  runtimeConfig.accounts.assignmentTtlMs = 60_000;
  runtimeConfig.diagnostics.recentRequests = 2;
  let directoryReads = 0;
  const app = await startHttpApp({ runtimeConfig,
    yybRequest: async () => { directoryReads++; return [{ id: '7', status: 'alive' }]; },
    loginPlatform: async () => ({ connected: true, token: 'fixture-token', stuId: 'source-student', user: { StuID: 'source-student' } }),
    mathRequest: async (_path, input) => ({ SuccessResponse: true, data: [{ ID: input.query.ID, QuestionID: input.query.ID, QuestionTxt: '实际访问的题干' }] }),
  });
  try {
    const admin = await app.setup();
    assert.match(admin.setCookie, /Max-Age=45(?:;|$)/);
    assert.match(admin.setCookie, /; Secure(?:;|$)/);
    const learner = await app.login('learning');
    assert.match(learner.setCookie, /Max-Age=45(?:;|$)/);
    const tooLarge = await app.request('/api/admin/users', { auth: admin, body: { username: 'large', displayName: 'x'.repeat(300), password: 'password-123' } });
    assert.equal(tooLarge.status, 413);
    const upload = await app.request('/api/learning/platform/computer/upload?path=%2Fapi%2Fuser%2Fv1%2Fattachment%2Fupload%2F', { auth: learner, body: Buffer.alloc(64), headers: { 'content-type': 'multipart/form-data; boundary=fixture' } });
    assert.equal(upload.status, 413);
    const enabled = await app.request('/api/admin/resource-sync', { auth: admin, method: 'PUT', body: { revision: 0, enabled: true } });
    assert.equal(enabled.status, 200);
    const started = Date.now();
    for (const ID of [1, 2]) {
      const response = await app.request('/api/learning/platform/math', { auth: learner, body: { path: '/api/question_list/GetQuestionByQuestionNew', query: { ID } } });
      assert.equal(response.status, 200);
    }
    assert.equal(directoryReads, 2, 'zero directory TTL forces a fresh source directory on each independent read');
    const listing = await app.app.locals.resourceStore.list({ platform: 'math', scope: 'public' });
    assert.equal(listing.resources.length, 2);
    for (const resource of listing.resources) {
      const expiry = new Date(resource.expiresAt).getTime();
      assert.ok(expiry >= started + runtimeConfig.resources.publicTtlMs);
      assert.ok(expiry <= Date.now() + runtimeConfig.resources.publicTtlMs);
    }
    const assignment = (await app.app.locals.database.query(`SELECT expires_at FROM ${app.app.locals.database.web('account_assignments')} WHERE user_id=$1`, [learner.userId])).rows[0];
    assert.ok(Number(assignment.expires_at) >= started + runtimeConfig.accounts.assignmentTtlMs);
    assert.ok(Number(assignment.expires_at) <= Date.now() + runtimeConfig.accounts.assignmentTtlMs);
    for (let index = 0; index < 4; index++) await app.request('/api/health');
    const operations = await (await app.request('/api/admin/operations', { auth: admin })).json();
    assert.equal(operations.recentRequests.length, 2);
  } finally { await app.close(); }
});

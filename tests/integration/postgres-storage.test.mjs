import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../support/database.mjs';
import { createIdentityStore } from '../../server/modules/identity/store.mjs';
import { createPlatformConfigStore, readPlatformDefaults } from '../../server/integrations/platform-config.mjs';

const adminInput = { username: 'admin', password: 'admin-password-123' };
const learnerInput = username => ({ username, password: 'learner-password-123', yybRef: 'shared-account' });
const data = minutes => ({ tasks: [], activities: [], goalMinutes: minutes });

test('PostgreSQL stores shared upstream bindings while Web learning records and sessions remain user-owned', async () => {
  const db = await createTestDatabase();
  try {
    const store = await createIdentityStore(db);
    const admin = await store.setup(adminInput);
    const first = await store.createUser(learnerInput('first'), admin);
    const second = await store.createUser(learnerInput('second'), admin);
    assert.equal(first.yybRef, second.yybRef);
    await store.saveStudyData(first.id, data(80), 0);
    assert.equal((await store.studyData(second.id)).data.goalMinutes, 60);
    const token = await store.issueSession(first.id, 60000, 'learning');
    assert.equal((await store.sessionUser(token)).id, first.id);
    assert.equal(await store.sessionUser(token, 'admin'), null);
    const reopened = await createIdentityStore(db);
    assert.equal((await reopened.studyData(first.id)).data.goalMinutes, 80);
    assert.equal((await reopened.login('FIRST', 'learner-password-123')).id, first.id);
    const column = (await db.query('SELECT data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3', [db.webSchema, 'study_data', 'data'])).rows[0];
    assert.equal(column.data_type, 'jsonb');
  } finally { await db.close(); }
});

test('concurrent study updates reject one stale revision including the first write', async () => {
  const db = await createTestDatabase();
  try {
    const store = await createIdentityStore(db), admin = await store.setup(adminInput);
    const outcomes = await Promise.allSettled([store.saveStudyData(admin.id, data(80), 0), store.saveStudyData(admin.id, data(90), 0)]);
    assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
    const failed = outcomes.find(item => item.status === 'rejected');
    assert.equal(failed.reason.status, 409);
    assert.equal((await store.studyData(admin.id)).revision, 1);
    assert.equal(failed.reason.details.revision, 1);
  } finally { await db.close(); }
});

test('independent configuration clients enforce PostgreSQL compare-and-swap and preserve secrets', async () => {
  const db = await createTestDatabase();
  try {
    const defaults = readPlatformDefaults({ env: { YYB_API_KEY: 'private-key' }, configFile: false });
    const first = await createPlatformConfigStore({ database: db, defaults });
    const second = await createPlatformConfigStore({ database: db, defaults });
    const outcomes = await Promise.allSettled([
      first.update({ revision: 0, config: { math: { stationId: 8 } } }),
      second.update({ revision: 0, config: { math: { stationId: 9 } } }),
    ]);
    assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find(item => item.status === 'rejected').reason.status, 409);
    await first.refresh();
    assert.equal(first.publicConfig().revision, 1);
    assert.equal(first.snapshot().yyb.apiKey, 'private-key');
    assert.equal(JSON.stringify(first.publicConfig()).includes('private-key'), false);
  } finally { await db.close(); }
});

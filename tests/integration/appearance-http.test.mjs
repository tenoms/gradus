import test from 'node:test';
import assert from 'node:assert/strict';
import { startHttpApp, testLearner } from '../support/http-app.mjs';
import { createTestDatabase } from '../support/database.mjs';
import { appearanceDefaults } from '../../shared/appearance.mjs';

const endpoint = '/api/admin/appearance';
async function json(app, path, options = {}, expected = 200) {
  const response = await app.request(path, options), value = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(value)}`);
  return value;
}
const change = (config, platform, value) => ({ ...config, [platform]: { ...config[platform], ...value } });

test('managed global mode and independent palettes are public-safe, while only the current administrator can save them', async () => {
  let upstream = 0;
  const unavailable = async () => { upstream++; throw new Error('offline'); };
  const app = await startHttpApp({ yybRequest: unavailable, loginPlatform: unavailable });
  try {
    const initial = await json(app, '/api/appearance');
    assert.deepEqual(Object.keys(initial).sort(), ['config', 'revision', 'updatedAt']);
    assert.deepEqual(initial.config, appearanceDefaults());
    assert.equal(initial.revision, 0);
    assert.ok(Number.isFinite(Date.parse(initial.updatedAt)));
    const anonymous = await json(app, '/api/learning/auth/session');
    assert.deepEqual(anonymous.browserConfig.appearance, initial.config);
    const admin = await app.setup();
    await app.createUser(admin, testLearner('theme.learner', ''));
    const learner = await app.login('learning', 'theme.learner', 'learner-password-123');
    await json(app, endpoint, {}, 401);
    await json(app, endpoint, { auth: learner }, 401);
    await json(app, endpoint, { auth: learner, method: 'PUT', body: { revision: 0, config: initial.config } }, 401);
    await json(app, endpoint, { auth: admin, headers: { 'X-Study-User': 'another-user' } }, 403);
    const config = { ...change(initial.config, 'math', { palette: 'rose' }), mode: 'dark' };
    const saved = await json(app, endpoint, { auth: admin, method: 'PUT', body: { revision: initial.revision, config } });
    assert.deepEqual(saved.config, config);
    assert.deepEqual(saved.config.computer, initial.config.computer, 'changing mathematics preserves the 408 palette');
    assert.equal(saved.revision, 1);
    assert.deepEqual(await json(app, '/api/appearance'), saved);
    for (const [space, auth] of [['admin', admin], ['learning', learner]]) {
      const session = await json(app, `/api/${space}/auth/session`, { auth });
      assert.deepEqual(session.browserConfig.appearance, config, 'already signed-in clients receive the latest persisted theme');
      assert.ok(Object.hasOwn(session.browserConfig, 'math'), 'existing browser deployment settings remain available');
    }
    assert.equal(upstream, 0, 'appearance management never opens a source account');
  } finally { await app.close(); }
});

test('theme validation and revision conflicts leave the current configuration and audit trail intact', async () => {
  const app = await startHttpApp();
  try {
    const admin = await app.setup(), config = appearanceDefaults();
    const invalid = [
      null, [], {}, { revision: '0', config }, { revision: -1, config }, { revision: 0.5, config },
      { revision: 0, config: { math: config.math } },
      { revision: 0, config: { ...config, other: config.math } },
      { revision: 0, config: change(config, 'math', { palette: 'untrusted-css-value' }) },
      { revision: 0, config: { ...config, mode: 'auto' } },
      { revision: 0, config: change(config, 'computer', { mode: 'dark' }) },
      { revision: 0, config: change(config, 'computer', { extra: true }) },
      { revision: 0, config, role: 'admin' },
    ];
    for (const body of invalid) await json(app, endpoint, { auth: admin, method: 'PUT', body }, 400);
    assert.deepEqual((await json(app, endpoint, { auth: admin })).config, config);
    assert.equal((await app.app.locals.identityStore.auditEntries()).filter(row => row.action === 'appearance.updated').length, 0);
    const changed = { ...change(config, 'computer', { palette: 'blue' }), mode: 'light' };
    const saved = await json(app, endpoint, { auth: admin, method: 'PUT', body: { revision: 0, config: changed } });
    await json(app, endpoint, { auth: admin, method: 'PUT', body: { revision: 0, config } }, 409);
    assert.deepEqual(await json(app, endpoint, { auth: admin }), saved);
    const audit = (await app.app.locals.identityStore.auditEntries()).filter(row => row.action === 'appearance.updated');
    assert.equal(audit.length, 1);
    assert.equal(audit[0].targetName, '学习空间主题');
    assert.equal(audit[0].actorName, admin.session.user.displayName);
  } finally { await app.close(); }
});

test('independent themes survive application recreation and are shared across learners without modifying study records', async () => {
  const database = await createTestDatabase(), close = database.close;
  database.close = async () => {};
  let app = await startHttpApp({ database });
  try {
    const admin = await app.setup();
    await app.createUser(admin, testLearner('theme.first', ''));
    await app.createUser(admin, testLearner('theme.second', ''));
    const first = await app.login('learning', 'theme.first', 'learner-password-123');
    const study = await json(app, '/api/learning/study/data', { auth: first });
    const config = { mode: 'light', math: { palette: 'amber' }, computer: { palette: 'rose' } };
    const saved = await json(app, endpoint, { auth: admin, method: 'PUT', body: { revision: 0, config } });
    await app.close(); app = await startHttpApp({ database });
    assert.deepEqual(await json(app, '/api/appearance'), saved);
    const manager = await app.login('admin');
    assert.deepEqual(await json(app, endpoint, { auth: manager }), saved);
    for (const username of ['theme.first', 'theme.second']) {
      const learner = await app.login('learning', username, 'learner-password-123');
      assert.deepEqual(learner.session.browserConfig.appearance, config);
      if (username === 'theme.first') assert.deepEqual(await json(app, '/api/learning/study/data', { auth: learner }), study);
    }
  } finally { await app.close(); await close(); }
});


test('existing managed settings read as one shared mode without a revision change and new writes use only that contract', async () => {
  const app = await startHttpApp();
  try {
    const admin = await app.setup(), table = app.app.locals.database.web('appearance_settings');
    const prior = { math: { palette: 'rose', mode: 'dark' }, computer: { palette: 'blue', mode: 'light' } };
    await app.app.locals.database.query(`UPDATE ${table} SET config=$1`, [JSON.stringify(prior)]);
    const current = await json(app, '/api/appearance');
    assert.deepEqual(current.config, { mode: 'system', math: { palette: 'rose' }, computer: { palette: 'blue' } });
    assert.equal(current.revision, 0);
    await json(app, endpoint, { auth: admin, method: 'PUT', body: { revision: 0, config: prior } }, 400);
    assert.deepEqual(await json(app, '/api/appearance'), current);
    const saved = await json(app, endpoint, { auth: admin, method: 'PUT', body: { revision: 0, config: { ...current.config, mode: 'dark' } } });
    assert.equal(saved.config.mode, 'dark');
    assert.equal(saved.revision, 1);
    assert.deepEqual((await app.app.locals.database.query(`SELECT config FROM ${table}`)).rows[0].config, saved.config);
  } finally { await app.close(); }
});

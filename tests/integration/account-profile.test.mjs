import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../../server/infrastructure/database.mjs';
import { startHttpApp, testLearner } from '../support/http-app.mjs';

const avatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHa4AAAAASUVORK5CYII=';
const profile = {
  nickname: 'Web 学习者', avatar, examYear: '2027', province: '浙江省',
  major: '软件工程', preparationStatus: '应届', reviewMonth: '3月',
};
function offlineSources() {
  const calls = [];
  const unavailable = async () => { calls.push('upstream'); throw new Error('profile must not acquire a source'); };
  return { calls, yybRequest: unavailable, loginPlatform: unavailable, mathRequest: unavailable, computerRequest: unavailable };
}
async function json(app, route, options = {}, expected = 200) {
  const response = await app.request(route, options);
  const value = await response.json();
  assert.equal(response.status, expected, JSON.stringify(value));
  return value;
}
const read = (app, auth) => json(app, '/api/learning/profile', { auth }).then(value => value.profile);
const save = (app, auth, body, expected = 200) => json(app, '/api/learning/profile', { auth, method: 'PUT', body }, expected);
async function setup(app) {
  const admin = await app.setup();
  await app.createUser(admin, testLearner('profile.first', ''));
  await app.createUser(admin, testLearner('profile.second', ''));
  const first = await app.login('learning', 'profile.first', 'learner-password-123');
  const second = await app.login('learning', 'profile.second', 'learner-password-123');
  return { admin, first, second };
}

test('account profile syncs the Web identity independently of study settings and is private and visible to administrators without YYB', async () => {
  const sources = offlineSources(), app = await startHttpApp(sources);
  try {
    const { admin, first, second } = await setup(app);
    const before = await read(app, first);
    assert.equal(before.nickname, 'profile.first');
    assert.equal(before.subject, undefined);
    const initialManaged = await json(app, `/api/admin/users/${first.userId}/profile`, { auth: admin });
    assert.deepEqual(initialManaged.mathPlan, { subject: '数一', stage: '基础' });
    const task = { id: 'profile-task', title: '复盘错题', platform: 'math', date: '2026-10-30', createdAt: '2026-10-30T00:00:00Z', done: false };
    const activity = { id: 'profile-activity', at: '2026-10-30T00:00:00Z', platform: 'math', type: 'practice', title: '高等数学', correct: 1, total: 2 };
    const study = { tasks: [task], activities: [activity], goalMinutes: 90, mathPlan: { subject: '数二', stage: '强化' } };
    await app.app.locals.privatePlatform.put(first.userId, 'math', 'profile', 'profile', {
      EBookIDs: '42,43', PaperIDs: '50', AlbumIDs: '60', SubjectType: '数三', SchoolName: '旧学校', TargetSchool: '旧目标', QQ: '旧补充资料',
    });
    const legacyPlan = await json(app, `/api/admin/users/${first.userId}/profile`, { auth: admin });
    assert.deepEqual(legacyPlan.mathPlan, { subject: '数三', stage: '基础' });
    await json(app, '/api/learning/study/data', { auth: first, method: 'PUT', body: { data: study, revision: 0 } });
    await app.app.locals.privatePlatform.put(first.userId, 'math', 'sys_users_info', 'legacy', {
      SchoolName: '旧学校', TargetSchool: '旧目标', UserName: '旧姓名', QQ: '旧补充资料', Province: '旧省份',
    });
    const saved = await save(app, first, { ...profile, subject: '数一', mathPlan: { subject: '数一', stage: '冲刺' }, userId: second.userId, role: 'admin', SchoolName: '被删字段', TargetSchool: '被删字段', QQ: '被删字段' });
    assert.deepEqual(saved.profile, profile);
    assert.deepEqual(await read(app, first), profile);
    const session = await json(app, '/api/learning/auth/session', { auth: first });
    assert.equal(session.user.displayName, profile.nickname);
    assert.equal(session.user.avatar, avatar);
    assert.equal(session.user.role, 'learner');
    assert.equal(session.platforms.math.user.UserNick, profile.nickname);
    assert.equal(session.platforms.math.user.HeadImg, avatar);
    assert.equal(session.platforms.math.user.SubjectType, '数三');
    assert.equal(session.platforms.math.user.SchoolName, undefined);
    assert.equal(session.platforms.math.user.TargetSchool, undefined);
    assert.equal(session.platforms.math.user.EBookIDs, '42,43');
    assert.equal(session.platforms.math.user.PaperIDs, '50');
    assert.equal(session.platforms.math.user.AlbumIDs, '60');
    const updatedStudy = await json(app, '/api/learning/study/data', { auth: first });
    assert.deepEqual(updatedStudy, { data: study, revision: 1 }, 'account profile saving leaves the math plan, daily goal, tasks, activities and revision unchanged');
    const otherProfile = await read(app, second);
    assert.equal(otherProfile.nickname, 'profile.second');
    assert.equal(otherProfile.avatar, '');
    assert.equal(otherProfile.province, '');
    const independentLogin = await app.login('learning', 'profile.first', 'learner-password-123');
    assert.deepEqual(await read(app, independentLogin), profile);
    const managed = await json(app, `/api/admin/users/${first.userId}/profile`, { auth: admin });
    assert.deepEqual(managed.profile, profile);
    assert.equal(managed.user.displayName, profile.nickname);
    assert.deepEqual(managed.mathPlan, study.mathPlan);
    assert.equal(managed.profile.subject, undefined);
    const page = await json(app, `/api/admin/users?q=${encodeURIComponent(profile.nickname)}`, { auth: admin });
    assert.equal(page.users[0].id, first.userId);
    const details = await app.app.locals.privatePlatform.list(first.userId, 'math', 'sys_users_info');
    assert.equal(details.length, 1);
    for (const field of ['UserName', 'SchoolName', 'TargetSchool', 'QQ', 'TargetScore', 'ElseQuestion', 'UseRestsApp']) {
      assert.equal(details[0][field], undefined);
      assert.equal((await app.app.locals.privatePlatform.list(first.userId, 'math', 'profile'))[0][field], undefined);
    }
    await json(app, '/api/learning/study/data', { auth: independentLogin, method: 'PUT', body: { data: { ...updatedStudy.data, mathPlan: { subject: '数一', stage: '冲刺' } }, revision: updatedStudy.revision } });
    assert.deepEqual(await read(app, first), profile, 'preparation settings do not become account profile fields');
    const updatedManaged = await json(app, `/api/admin/users/${first.userId}/profile`, { auth: admin });
    assert.deepEqual(updatedManaged.mathPlan, { subject: '数一', stage: '冲刺' });
    const secondStudy = await json(app, '/api/learning/study/data', { auth: second });
    await save(app, second, { ...profile, nickname: '第二位学习者' });
    assert.deepEqual(await json(app, '/api/learning/study/data', { auth: second }), secondStudy, 'saving account details does not create a preparation plan or advance the study revision');
    assert.deepEqual(await read(app, first), profile);
    assert.deepEqual(sources.calls, []);
  } finally { await app.close(); }
});

test('account profile APIs enforce the application identity and validate before changing any Web state', async () => {
  const sources = offlineSources(), app = await startHttpApp(sources);
  try {
    const { admin, first, second } = await setup(app);
    await save(app, first, profile);
    const before = await json(app, '/api/learning/study/data', { auth: first });
    await json(app, '/api/learning/profile', {}, 401);
    await json(app, '/api/learning/profile', { method: 'PUT', body: profile }, 401);
    await json(app, `/api/admin/users/${first.userId}/profile`, { auth: second }, 401);
    await json(app, `/api/admin/users/missing/profile`, { auth: admin }, 404);
    await json(app, '/api/learning/profile', { auth: first, headers: { 'X-Study-User': second.userId } }, 403);
    const invalid = [
      { nickname: '' }, { nickname: 'x'.repeat(81) }, { province: {} }, { major: 'x'.repeat(101) },
      { examYear: '27年' }, { preparationStatus: 'unsupported' }, { reviewMonth: '13月' },
      { avatar: 'javascript:alert(1)' }, { avatar: 'data:image/svg+xml;base64,PHN2Zy8+' },
      { avatar: 'data:image/png;base64,' + 'A'.repeat(256 * 1024) },
    ];
    for (const change of invalid) {
      await save(app, first, { ...profile, nickname: '不可部分保存', ...change }, 400);
      assert.deepEqual(await read(app, first), profile);
      assert.deepEqual(await json(app, '/api/learning/study/data', { auth: first }), before);
    }
    const cleared = { ...profile, avatar: '', examYear: '', province: '', major: '', preparationStatus: '', reviewMonth: '' };
    assert.deepEqual((await save(app, first, cleared)).profile, cleared);
    const urlAvatar = { ...cleared, avatar: 'https://example.com/own-avatar.png', examYear: '其他' };
    assert.deepEqual((await save(app, first, urlAvatar)).profile, urlAvatar);
    assert.deepEqual(sources.calls, []);
  } finally { await app.close(); }
});

test('Web account profile and avatar survive a backend restart with the same database', async () => {
  const schemaPrefix = `test_${randomUUID().replaceAll('-', '')}`;
  let database = await createDatabase({ schemaPrefix });
  let app = await startHttpApp({ ...offlineSources(), database });
  let closed = false;
  try {
    const { first } = await setup(app);
    await save(app, first, profile);
    await app.close(); closed = true;
    database = await createDatabase({ schemaPrefix });
    app = await startHttpApp({ ...offlineSources(), database }); closed = false;
    const auth = await app.login('learning', 'profile.first', 'learner-password-123');
    assert.deepEqual(await read(app, auth), profile);
    assert.equal(auth.session.user.displayName, profile.nickname);
    assert.equal(auth.session.user.avatar, avatar);
  } finally {
    if (closed) database = await createDatabase({ schemaPrefix });
    await database.drop();
    if (!closed) await app.close(); else await database.close();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { startHttpApp, testLearner } from '../support/http-app.mjs';
import { videoProgressRecord } from '../../src/features/math/courses/course-model.mjs';

const collection = 'c_course_users_record';
const context = { CourseID: 10, CalendarID: 20, ProductID: 30, BusType: 2, BusID: 40 };

async function fixture() {
  let upstreamCalls = 0;
  const forbidden = name => async () => {
    upstreamCalls++;
    assert.fail(`数学课程进度不能访问来源：${name}`);
  };
  const app = await startHttpApp({
    yybRequest: forbidden('YYB'),
    loginPlatform: forbidden('platform login'),
    mathRequest: forbidden('math platform'),
    computerRequest: forbidden('computer platform'),
    requestJson: forbidden('upstream transport'),
  });
  const admin = await app.setup();
  for (const username of ['math.progress.first', 'math.progress.second']) await app.createUser(admin, testLearner(username, ''));
  const login = username => app.login('learning', username, 'learner-password-123');
  const first = await login('math.progress.first'), second = await login('math.progress.second');
  async function invoke(auth, action, input, method = 'GET') {
    const response = await app.request('/api/learning/platform/math', { auth,
      body: { path: `/api/${collection}/${action}`, method, ...(method === 'GET' ? { query: input } : { data: input }) } });
    assert.equal(response.status, 200);
    const value = await response.json();
    assert.equal(value.SuccessResponse, true);
    assert.equal(value.storage, 'web');
    return value;
  }
  const save = async (auth, value) => {
    const response = await invoke(auth, 'Inner_c_course_users_record', value, 'POST');
    assert.ok(Number.isSafeInteger(response.data) && response.data > 0, '保存必须返回本人的本地记录ID');
    return response.data;
  };
  const read = async (auth, query = context) => {
    const response = await invoke(auth, 'GetListByAll', query);
    assert.ok(Array.isArray(response.data));
    return response.data;
  };
  return { app, first, second, login, save, read, upstreamCalls: () => upstreamCalls };
}

test('math course video progress updates one local record and restores the latest completed position after login', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await f.read(f.first), []);
    const task = { BusID: context.BusID }, actor = { ...context, StuID: f.first.userId };
    const recordId = await f.save(f.first, videoProgressRecord(actor, task, 18, 200));
    const firstRows = await f.read(f.first);
    assert.equal(firstRows.length, 1);
    assert.equal(firstRows[0].ID, recordId);
    assert.equal(firstRows[0].BusValue, 18);
    assert.equal(firstRows[0].IsFinished, 0);

    const updatedId = await f.save(f.first, videoProgressRecord(actor, task, 61, 200, firstRows[0]));
    assert.equal(updatedId, recordId, '携带读回ID的后续保存必须更新同一条记录');
    const updatedRows = await f.read(f.first);
    assert.equal(updatedRows.length, 1, '自动保存不能重复创建同一进度记录');
    assert.equal(updatedRows[0].ID, recordId);
    assert.equal(updatedRows[0].BusValue, 61, '续学读取使用最新保存位置');

    assert.equal(await f.save(f.first, videoProgressRecord(actor, task, 180, 200, updatedRows[0])), recordId);
    const completed = (await f.read(f.first))[0];
    assert.equal(completed.BusValue, 180);
    assert.equal(completed.IsFinished, 1);
    const continued = videoProgressRecord(actor, task, 185, 200, completed);
    assert.equal(continued.IsFinished, 1, '原进度模型继续保留完成标记');
    assert.equal(await f.save(f.first, continued), recordId);

    const loggedIn = await f.login('math.progress.first');
    const restored = await f.read(loggedIn);
    assert.equal(restored.length, 1);
    assert.equal(restored[0].ID, recordId);
    assert.equal(restored[0].BusValue, 185);
    assert.equal(restored[0].IsFinished, 1);
    assert.deepEqual(await f.read(f.second), [], '另一学习用户没有本人未保存的进度');
    assert.equal((await f.app.app.locals.privatePlatform.list(f.first.userId, 'math', collection)).length, 1);
    assert.equal(f.upstreamCalls(), 0, '保存、读取及重新登录均不访问共享账号');
  } finally { await f.app.close(); }
});

test('math course progress reads isolate the learner, record ID, lesson, course, calendar, product and record type', async () => {
  const f = await fixture();
  try {
    const cases = [
      { scope: context, position: 21 },
      { scope: { ...context, CourseID: 11 }, position: 31 },
      { scope: { ...context, CalendarID: 22 }, position: 41 },
      { scope: { ...context, ProductID: 33 }, position: 51 },
      { scope: { ...context, BusID: 44 }, position: 61 },
      { scope: { ...context, BusType: 3 }, position: 71 },
    ];
    for (const entry of cases) entry.recordId = await f.save(f.first, { ...entry.scope, BusValue: entry.position, IsFinished: 0 });
    const secondId = await f.save(f.second, { ...context, BusValue: 7, IsFinished: 0 });
    assert.notEqual(secondId, cases[0].recordId);

    for (const entry of cases) {
      const rows = await f.read(f.first, entry.scope);
      assert.equal(rows.length, 1, `读取需精确匹配课程上下文：${JSON.stringify(entry.scope)}`);
      assert.equal(rows[0].ID, entry.recordId);
      assert.equal(rows[0].BusValue, entry.position);
      for (const field of ['CourseID', 'CalendarID', 'ProductID', 'BusType', 'BusID']) assert.equal(rows[0][field], entry.scope[field]);
    }
    const own = await f.read(f.second);
    assert.equal(own.length, 1);
    assert.equal(own[0].ID, secondId);
    assert.equal(own[0].BusValue, 7);
    assert.deepEqual(await f.read(f.second, { ...context, ID: cases[0].recordId }), [], '另一用户的记录ID不能匹配本人的其他进度');
    assert.deepEqual(await f.read(f.first, { ...context, ID: secondId }), [], '按ID读取不得得到其他用户的进度');
    assert.equal((await f.read(f.first, { ...context, ID: cases[0].recordId }))[0].ID, cases[0].recordId);
    assert.equal((await f.app.app.locals.privatePlatform.list(f.first.userId, 'math', collection)).length, cases.length);
    assert.equal((await f.app.app.locals.privatePlatform.list(f.second.userId, 'math', collection)).length, 1);
    assert.equal(f.upstreamCalls(), 0);
  } finally { await f.app.close(); }
});

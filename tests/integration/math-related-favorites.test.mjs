import test from 'node:test';
import assert from 'node:assert/strict';
import { startHttpApp, testLearner } from '../support/http-app.mjs';

function offlineSources() {
  const calls = [];
  const unavailable = async () => { calls.push('upstream'); throw new Error('private annotations never require an upstream account'); };
  return { calls, yybRequest: unavailable, loginPlatform: unavailable, mathRequest: unavailable, computerRequest: unavailable };
}
async function learner(app, admin, username) {
  await app.createUser(admin, testLearner(username, ''));
  return app.login('learning', username, 'learner-password-123');
}
async function math(app, auth, input) {
  const response = await app.request('/api/learning/platform/math', { auth, body: input });
  const value = await response.json();
  assert.equal(response.status, 200, JSON.stringify(value));
  return value;
}
const command = (app, auth, name, params) => math(app, auth, {
  path: '/api/Master/AutoModel', method: 'POST', data: { command: name, data: JSON.stringify(params) },
}).then(value => value.data);
const save = (app, auth, data, origin = 'rel_question_log') => math(app, auth, {
  path: `/api/${origin}/Inner_${origin}`, method: 'POST', data,
}).then(value => value.data);
const list = (app, auth, query, origin = 'rel_question_log') => math(app, auth, {
  path: `/api/${origin}/GetListByPage`, method: 'GET', query,
});

test('related question annotation commands return private scoped tables for both detail and collection menus', async () => {
  const sources = offlineSources(), app = await startHttpApp(sources);
  try {
    const admin = await app.setup(), first = await learner(app, admin, 'related.tables.first'), second = await learner(app, admin, 'related.tables.second');
    const types = ['错题', '收藏', '笔记', '斩题', '题目'];
    for (const Type of types) await save(app, first, { QuestionID: 42, BusID: 7, Type, Content: `本人${Type}`, MyAnswer: Type === '题目' ? 'A' : undefined });
    await save(app, first, { QuestionID: 43, BusID: 7, Type: '收藏' });
    await save(app, first, { QuestionID: 42, BusID: 8, Type: '收藏', Content: '另一个题组' });
    await save(app, second, { QuestionID: 42, BusID: 7, Type: '收藏', Content: '另一位用户' });
    await save(app, first, { QuestionID: 42, Type: '收藏', Content: '教辅收藏' }, 'sys_user_book_question');

    const detail = await command(app, first, 'GetUserLogQuestionList_zyk', { QuestionID: '42', BusID: '7', StuID: second.userId });
    assert.equal(detail.length, 6);
    assert.equal(detail[4].length, 4);
    assert.deepEqual(new Set(detail[4].map(row => row.Type)), new Set(types.slice(0, 4)));
    assert.ok(detail[4].every(row => row.QuestionID === 42 && row.BusID === 7 && row.Content.startsWith('本人')));
    assert.equal(detail[5].length, 1);
    assert.equal(detail[5][0].MyAnswer, 'A');

    const grouped = await command(app, first, 'GetUserQuestionLogTypeList_zyk', { BusID: '7', StuID: second.userId });
    assert.equal(grouped.length, 5);
    assert.deepEqual(grouped.map(rows => rows.length), [1, 2, 1, 1, 1]);
    grouped.forEach((rows, index) => assert.ok(rows.every(row => row.Type === types[index] && row.BusID === 7)));
    assert.deepEqual((await command(app, first, 'GetUserQuestionLogTypeList_zyk', { QuestionID: 42, BusID: 7 })).map(rows => rows.length), [1, 1, 1, 1, 1]);
    const other = await command(app, second, 'GetUserLogQuestionList_zyk', { QuestionID: 42, BusID: 7, StuID: first.userId });
    assert.equal(other[4].length, 1);
    assert.equal(other[4][0].Content, '另一位用户');
    assert.deepEqual(other[5], []);
    assert.deepEqual((await command(app, first, 'GetUserQuestionLogTypeList_zyk', { BusID: 99 })), [[], [], [], [], []]);
    assert.deepEqual(sources.calls, [], 'annotation reads and writes never visit YYB or the shared source');
  } finally { await app.close(); }
});

test('related favorites survive reads and login, paginate without duplicates and cancel only the current owner and origin', async () => {
  const sources = offlineSources(), app = await startHttpApp(sources);
  try {
    const admin = await app.setup(), first = await learner(app, admin, 'related.favorites.first'), second = await learner(app, admin, 'related.favorites.second');
    const favorite = { QuestionID: 42, BusID: 0, Type: '收藏' };
    const firstId = await save(app, first, favorite);
    const secondId = await save(app, second, favorite);
    const bookId = await save(app, first, { QuestionID: 42, Type: '收藏' }, 'sys_user_book_question');
    assert.equal(await save(app, first, { ...favorite, Content: '再次保存' }), firstId, 'saving the same favorite does not duplicate its identity');
    await save(app, first, { QuestionID: 43, BusID: 0, Type: '收藏' });
    const pages = await Promise.all([1, 2].map(page => list(app, first, { Type: '收藏', BusID: 0, page, limit: 1 })));
    assert.deepEqual(pages.map(value => value.count), [2, 2]);
    assert.equal(new Set(pages.flatMap(value => value.data.map(row => row.ID))).size, 2);
    assert.deepEqual(new Set(pages.flatMap(value => value.data.map(row => row.QuestionID))), new Set([42, 43]));
    const reconnected = await app.login('learning', 'related.favorites.first', 'learner-password-123');
    const restored = await command(app, reconnected, 'GetUserLogQuestionList_zyk', { QuestionID: 42, BusID: 0 });
    assert.equal(restored[4][0].ID, firstId);
    assert.equal(restored[4][0].Content, '再次保存');

    await math(app, first, { path: '/api/rel_question_log/Del_rel_question_log', method: 'POST', data: { ID: firstId, StuID: second.userId } });
    assert.deepEqual((await command(app, first, 'GetUserLogQuestionList_zyk', { QuestionID: 42, BusID: 0 }))[4], []);
    assert.equal((await command(app, second, 'GetUserLogQuestionList_zyk', { QuestionID: 42, BusID: 0 }))[4][0].ID, secondId);
    const book = await list(app, first, { Type: '收藏', QuestionID: 42, page: 1, limit: 100 }, 'sys_user_book_question');
    assert.equal(book.data.length, 1);
    assert.equal(book.data[0].ID, bookId, 'canceling a question-bank favorite preserves the separate book annotation');
    assert.deepEqual(sources.calls, []);
  } finally { await app.close(); }
});

test('book favorites cancel only the selected question and owner, remain canceled after login and can be saved again', async () => {
  const sources = offlineSources(), app = await startHttpApp(sources);
  try {
    const admin = await app.setup(), first = await learner(app, admin, 'book.favorites.first'), second = await learner(app, admin, 'book.favorites.second');
    const origin = 'sys_user_book_question';
    const favorite = { QuestionID: 42, Type: '收藏', BookID: 11, Source: '电子书', Content: '当前题目收藏' };
    const currentId = await save(app, first, favorite, origin);
    const otherQuestionId = await save(app, first, { ...favorite, QuestionID: 43 }, origin);
    const mistakeId = await save(app, first, { QuestionID: 42, Type: '错题', Content: '保留错题' }, origin);
    const noteId = await save(app, first, { QuestionID: 42, Type: '笔记', Content: '保留笔记' }, origin);
    const otherUserId = await save(app, second, favorite, origin);
    const bankId = await save(app, first, { QuestionID: 42, BusID: 0, Type: '收藏', Content: '保留题库收藏' });
    const readFavorite = auth => list(app, auth, { StuID: second.userId, Type: '收藏', QuestionID: 42, page: 1, limit: 100 }, origin);
    const before = await readFavorite(first);
    assert.deepEqual(before.data.map(row => row.ID), [currentId]);

    await math(app, first, {
      path: '/api/sys_user_book_question/Dels_sys_user_book_question', method: 'POST',
      data: { ids: String(before.data[0].ID), StuID: second.userId },
    });
    assert.deepEqual((await readFavorite(first)).data, []);
    const remaining = await list(app, first, { page: 1, limit: 100 }, origin);
    assert.deepEqual(new Set(remaining.data.map(row => row.ID)), new Set([otherQuestionId, mistakeId, noteId]));
    assert.equal((await readFavorite(second)).data[0].ID, otherUserId);
    const bank = await list(app, first, { QuestionID: 42, BusID: 0, Type: '收藏', page: 1, limit: 100 });
    assert.equal(bank.data[0].ID, bankId, 'canceling a book favorite leaves the separate question-bank annotation intact');

    const reconnected = await app.login('learning', 'book.favorites.first', 'learner-password-123');
    const afterLogin = await readFavorite(reconnected);
    assert.equal(afterLogin.count, 0);
    assert.deepEqual(afterLogin.data, []);
    const restoredId = await save(app, reconnected, favorite, origin);
    assert.notEqual(restoredId, currentId);
    const restored = await readFavorite(reconnected);
    assert.equal(restored.count, 1);
    assert.equal(restored.data[0].ID, restoredId);
    assert.equal(restored.data[0].Content, '当前题目收藏');
    assert.equal((await readFavorite(second)).data[0].ID, otherUserId);
    assert.deepEqual(sources.calls, [], 'book favorite cancellation and restoration never require a YYB or upstream request');
  } finally { await app.close(); }
});

test('related mistakes restore and toggle without changing favorites, saved answers, other scopes or owners', async () => {
  const sources = offlineSources(), app = await startHttpApp(sources);
  try {
    const admin = await app.setup(), first = await learner(app, admin, 'related.mistakes.first'), second = await learner(app, admin, 'related.mistakes.second');
    const scope = { QuestionID: 42, BusID: 7 };
    const answerId = await save(app, first, { ...scope, Type: '题目', MyAnswer: 'A', State: 2, IsSubmit: 1 });
    const mistakeId = await save(app, first, { ...scope, Type: '错题' });
    const favoriteId = await save(app, first, { ...scope, Type: '收藏' });
    const noteId = await save(app, first, { ...scope, Type: '笔记', Content: '保留笔记' });
    const otherQuestionId = await save(app, first, { QuestionID: 43, BusID: 7, Type: '错题' });
    const otherScopeId = await save(app, first, { QuestionID: 42, BusID: 8, Type: '错题' });
    const otherOwnerId = await save(app, second, { ...scope, Type: '错题' });
    const bookId = await save(app, first, { QuestionID: 42, Type: '错题' }, 'sys_user_book_question');
    const reconnected = await app.login('learning', 'related.mistakes.first', 'learner-password-123');
    const restored = await command(app, reconnected, 'GetUserLogQuestionList_zyk', scope);
    assert.equal(restored[4].find(row => row.Type === '错题').ID, mistakeId);
    assert.equal(restored[5][0].ID, answerId);
    await math(app, first, { path: '/api/rel_question_log/Del_rel_question_log', method: 'POST', data: { ID: mistakeId, StuID: second.userId } });

    const remaining = await command(app, first, 'GetUserLogQuestionList_zyk', scope);
    assert.equal(remaining[4].some(row => row.Type === '错题'), false);
    assert.equal(remaining[4].find(row => row.Type === '收藏').ID, favoriteId);
    assert.equal(remaining[4].find(row => row.Type === '笔记').ID, noteId);
    assert.equal(remaining[5][0].ID, answerId);
    assert.equal(remaining[5][0].MyAnswer, 'A');
    assert.equal(remaining[5][0].State, 2);
    assert.equal(remaining[5][0].IsSubmit, 1);
    const listMistake = (auth, query, origin) => list(app, auth, { Type: '错题', page: 1, limit: 100, ...query }, origin);
    assert.equal((await listMistake(first, { QuestionID: 43, BusID: 7 })).data[0].ID, otherQuestionId);
    assert.equal((await listMistake(first, { QuestionID: 42, BusID: 8 })).data[0].ID, otherScopeId);
    assert.equal((await listMistake(second, scope)).data[0].ID, otherOwnerId);
    assert.equal((await listMistake(first, { QuestionID: 42 }, 'sys_user_book_question')).data[0].ID, bookId);
    const laterLogin = await app.login('learning', 'related.mistakes.first', 'learner-password-123');
    assert.equal((await listMistake(laterLogin, scope)).count, 0);
    const addedAgain = await save(app, laterLogin, { ...scope, Type: '错题' });
    assert.notEqual(addedAgain, mistakeId);
    assert.equal((await listMistake(laterLogin, scope)).data[0].ID, addedAgain);
    const grouped = await command(app, laterLogin, 'GetUserQuestionLogTypeList_zyk', scope);
    assert.equal(grouped[0][0].ID, addedAgain);
    assert.equal(grouped[1][0].ID, favoriteId);
    assert.equal(grouped[4][0].ID, answerId);
    assert.deepEqual(sources.calls, []);
  } finally { await app.close(); }
});

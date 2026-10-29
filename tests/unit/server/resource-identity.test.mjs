import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceIdentity, resourceKey } from '../../../server/modules/resources/catalog.mjs';
import { readPlatformDefaults } from '../../../server/integrations/platform-config.mjs';
import { injectMathUser } from '../../../server/integrations/platform-policy.mjs';

const configured = stationId => {
  const config = readPlatformDefaults({ env: {}, configFile: false });
  config.math.stationId = stationId;
  return config;
};
const session = { user: { id: 'web-user' } };
const identity = (request, stationId = 7) => resourceIdentity('math', session, configured(stationId), request);

test('math public GET identity is independent of missing, client and server-injected station fields', () => {
  const request = { path: '/api/question_list/GetQuestionByQuestionNew', method: 'GET', data: {}, query: { ID: 42 } };
  const base = identity(request);
  assert.equal(base.scope, 'public');
  for (const candidate of [
    { ...request, query: { ID: 42, System_Station_ID: 1 } },
    { ...request, data: { System_Station_ID: 999 } },
    injectMathUser(request, { stuId: 'web-user' }, 7),
  ]) {
    const result = identity(candidate);
    assert.deepEqual(result.request, base.request);
    assert.equal(resourceKey(result.request), resourceKey(base.request));
    assert.equal(result.source.id, base.source.id);
  }
  assert.equal(base.source.stationId, 7);
  assert.deepEqual(request.query, { ID: 42 });
});

test('math public command identity removes station context from nested parameters', () => {
  const command = parameters => ({ path: '/api/Master/AutoModel', method: 'POST', query: {}, data: { command: 'GetQuestionNexts2', data: parameters } });
  const base = identity(command({ BookID: 42 }));
  for (const candidate of [
    command({ BookID: 42, System_Station_ID: 1 }),
    command(JSON.stringify({ BookID: 42, System_Station_ID: 999 })),
    injectMathUser(command(JSON.stringify({ BookID: 42 })), { stuId: 'web-user' }, 7),
  ]) {
    const result = identity(candidate);
    assert.deepEqual(result.request, base.request);
    assert.equal(resourceKey(result.request), resourceKey(base.request));
  }
});

test('configured math stations remain separate source domains for the same normalized public request', () => {
  const request = { path: '/api/question_list/GetQuestionByQuestionNew', method: 'GET', data: {}, query: { ID: 42, System_Station_ID: 1 } };
  const one = identity(request, 7), another = identity(request, 17);
  assert.equal(resourceKey(one.request), resourceKey(another.request));
  assert.notEqual(one.source.id, another.source.id);
  assert.equal(one.source.stationId, 7);
  assert.equal(another.source.stationId, 17);
});

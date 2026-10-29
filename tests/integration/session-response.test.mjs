import test from 'node:test';
import assert from 'node:assert/strict';
import {startHttpApp} from '../support/http-app.mjs';

test('Web sign-in and session read report the same local learning identity after relogin',async()=>{
  let sourceCalls=0;
  const app=await startHttpApp({yybRequest:async()=>{sourceCalls++;throw new Error('source offline');},loginPlatform:async()=>{sourceCalls++;throw new Error('source offline');}});
  try{
    const admin=await app.setup();let learning=await app.login('learning');
    await app.request('/api/learning/auth/logout',{auth:learning,method:'POST'});learning=await app.login('learning');
    const snapshot=await(await app.request('/api/learning/auth/session',{auth:learning})).json();assert.deepEqual(learning.session,snapshot);
    assert.equal(snapshot.platforms.math.available,true);assert.equal(snapshot.platforms.computer.available,true);
    assert.equal(snapshot.platforms.math.user.StuID,learning.userId);assert.equal(snapshot.platforms.computer.user.userId,learning.userId);
    assert.equal(snapshot.account,null);assert.equal(sourceCalls,0);
    const management=await(await app.request('/api/admin/auth/session',{auth:admin})).json();assert.equal(Object.hasOwn(management,'platforms'),false);
  }finally{await app.close();}
});

test('anonymous and authenticated session responses expose only browser deployment configuration', async t => {
  const environment = {
    MATH_EXTERNAL_URL: 'https://print.example.test/External/', MATH_PRINT_STATION_ID: '9',
    SERVER_ONLY_CREDENTIAL: 'must-remain-on-server',
  };
  const previous = Object.fromEntries(Object.keys(environment).map(name => [name, process.env[name]]));
  Object.assign(process.env, environment);
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  const app = await startHttpApp();
  t.after(() => app.close());
  const expected = {
    math: { externalUrl: 'https://print.example.test/External/', printStationId: 9 },
  };
  for (const space of ['admin', 'learning']) {
    const response = await app.request(`/api/${space}/auth/session`);
    assert.equal(response.status, 200);
    const session = await response.json();
    assert.equal(session.authenticated, false);
    assert.deepEqual(session.browserConfig, expected);
    assert.equal(JSON.stringify(session).includes(environment.SERVER_ONLY_CREDENTIAL), false);
  }
  const admin = await app.setup();
  const learner = await app.login('learning');
  for (const auth of [admin, learner]) {
    assert.deepEqual(auth.session.browserConfig, expected);
    const session = await (await app.request(`/api/${auth.space}/auth/session`, { auth })).json();
    assert.deepEqual(session.browserConfig, expected);
    assert.equal(JSON.stringify(session).includes(environment.SERVER_ONLY_CREDENTIAL), false);
  }
});

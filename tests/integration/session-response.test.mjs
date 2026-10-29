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

import test from 'node:test';
import assert from 'node:assert/strict';
import {startHttpApp,testLearner} from './http-app.mjs';

test('learning session identity belongs to the Web user without contacting any source',async()=>{
  const calls=[],app=await startHttpApp({yybRequest:async()=>{calls.push('yyb');throw new Error('offline');},loginPlatform:async()=>{calls.push('login');throw new Error('offline');}});
  try{
    const admin=await app.setup();await app.createUser(admin,testLearner('identity.first','source'));await app.createUser(admin,testLearner('identity.second','source'));
    const first=await app.login('learning','identity.first','learner-password-123'),second=await app.login('learning','identity.second','learner-password-123');
    for(const auth of [first,second]){
      const value=await(await app.request('/api/learning/auth/session',{auth})).json();
      assert.equal(value.platforms.math.available,true);assert.equal(value.platforms.computer.available,true);
      assert.equal(value.platforms.math.connected,false);assert.equal(value.platforms.computer.connected,false);
      assert.equal(value.platforms.math.user.StuID,auth.userId);assert.equal(value.platforms.computer.user.userId,auth.userId);
      assert.equal(value.account,null);assert.equal(value.yybBaseUrl,undefined);
    }
    assert.notEqual(first.session.platforms.math.user.StuID,second.session.platforms.math.user.StuID);assert.deepEqual(calls,[]);
  }finally{await app.close();}
});

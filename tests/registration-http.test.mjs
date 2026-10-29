import test from 'node:test';
import assert from 'node:assert/strict';
import {startHttpApp,testLearner} from './http-app.mjs';
import {createTestDatabase} from './database.mjs';

const path='/api/admin/registration';
const input={username:'registered.reader',displayName:'自行注册的学习者',password:'registration-password-2026'};
async function json(app,route,options={},expected=200){const response=await app.request(route,options),value=await response.json();assert.equal(response.status,expected,`${route}: ${JSON.stringify(value)}`);return {response,value};}
async function enable(app,admin,enabled=true){const {value}=await json(app,path,{auth:admin});return (await json(app,path,{auth:admin,method:'PUT',body:{enabled,revision:value.revision}})).value;}
const register=(app,body=input,expected=201)=>json(app,'/api/learning/auth/register',{body},expected);

test('registration is closed by default and cannot bypass first-administrator setup',async()=>{
  let sourceCalls=0;const app=await startHttpApp({yybRequest:async()=>{sourceCalls++;throw new Error('offline');}});
  try{
    assert.deepEqual((await json(app,'/api/system/registration')).value,{registrationEnabled:false});
    await register(app,input,409);
    assert.equal((await app.app.locals.identityStore.users()).length,0);
    await assert.rejects(()=>app.app.locals.registration.update({enabled:true,revision:0}),/初始化/);
    await app.setup();await register(app,input,403);
    assert.deepEqual((await json(app,'/api/system/registration')).value,{registrationEnabled:false});
    assert.equal(sourceCalls,0);
  }finally{await app.close();}
});

test('an administrator can open registration and a visitor receives only a Web learning identity',async()=>{
  let sourceCalls=0;const unavailable=async()=>{sourceCalls++;throw new Error('offline');};
  const app=await startHttpApp({yybRequest:unavailable,loginPlatform:unavailable});
  try{
    const admin=await app.setup();await enable(app,admin);
    assert.deepEqual((await json(app,'/api/system/registration')).value,{registrationEnabled:true});
    const {response,value}=await register(app,{...input,role:'admin',status:'disabled',yybRef:'not-owned',userId:admin.userId,email:'unused@example.test'});
    assert.equal(value.authenticated,true);assert.equal(value.space,'learning');assert.equal(value.user.role,'learner');assert.equal(value.user.status,'active');
    assert.equal(value.user.yybRef,undefined);assert.equal(value.account,null);
    assert.equal(value.platforms.math.user.StuID,value.user.id);assert.equal(value.platforms.computer.user.userId,value.user.id);
    const saved=await app.app.locals.identityStore.user(value.user.id);assert.equal(saved.yybRef,'');assert.equal(saved.role,'learner');
    const cookie=response.headers.get('set-cookie');assert.match(cookie,/^study_learning_session=/);assert.match(cookie,/Path=\/api\/learning/);assert.doesNotMatch(cookie,/study_admin_session/);
    const auth={cookie:cookie.split(';')[0],userId:value.user.id};
    assert.equal((await json(app,'/api/learning/study/data',{auth})).value.revision,0);
    await json(app,'/api/admin/auth/session',{auth});
    assert.equal((await json(app,'/api/admin/auth/session',{auth})).value.authenticated,false);
    await json(app,'/api/admin/auth/login',{body:{username:input.username,password:input.password}},403);
    assert.equal(sourceCalls,0,'registration and the resulting learning session never contact YYB');
  }finally{await app.close();}
});

test('only an administrator can change registration and stale revisions do not overwrite its policy',async()=>{
  const app=await startHttpApp();
  try{
    const admin=await app.setup();await app.createUser(admin,testLearner('existing.reader',''));const learner=await app.login('learning','existing.reader','learner-password-123');
    await json(app,path,{},401);await json(app,path,{auth:learner},401);
    await json(app,path,{auth:learner,method:'PUT',body:{enabled:true,revision:0}},401);
    await json(app,path,{auth:admin,method:'PUT',body:{enabled:'yes',revision:0}},400);
    const opened=await enable(app,admin);
    await json(app,path,{auth:admin,method:'PUT',body:{enabled:false,revision:opened.revision-1}},409);
    assert.equal((await json(app,path,{auth:admin})).value.enabled,true);
    await enable(app,admin,false);
    assert.deepEqual((await json(app,'/api/system/registration')).value,{registrationEnabled:false});
    await app.login('learning','existing.reader','learner-password-123');
    await register(app,input,403);
  }finally{await app.close();}
});

test('registration validates ordinary credentials and enforces case-insensitive username uniqueness',async()=>{
  const app=await startHttpApp();
  try{
    const admin=await app.setup();await enable(app,admin);
    for(const body of [{...input,username:'x'},{...input,username:'bad user'},{...input,password:'short'},{...input,displayName:'x'.repeat(81)}])await register(app,body,400);
    await register(app);await register(app,{...input,username:input.username.toUpperCase()},409);
    const users=await app.app.locals.identityStore.users();assert.equal(users.filter(user=>user.role==='learner').length,1);
    const audit=await app.app.locals.identityStore.auditEntries();assert.ok(audit.some(row=>row.action==='auth.registered'));assert.ok(audit.some(row=>row.action==='registration.updated'));
  }finally{await app.close();}
});

test('closing registration rejects new visitors while registered accounts retain login and private data',async()=>{
  const app=await startHttpApp();
  try{
    const admin=await app.setup();await enable(app,admin);await register(app);
    const registered=await app.login('learning',input.username,input.password);
    await json(app,'/api/learning/study/data',{auth:registered,method:'PUT',body:{revision:0,data:{tasks:[{id:'personal-task',title:'继续学习',platform:'math',date:'2026-10-29',createdAt:'2026-10-29T12:00:00Z',done:false}],activities:[],goalMinutes:60}}});
    await enable(app,admin,false);await register(app,{...input,username:'later.reader'},403);
    const relogin=await app.login('learning',input.username,input.password);
    assert.equal((await json(app,'/api/learning/study/data',{auth:relogin})).value.data.tasks[0].title,'继续学习');
  }finally{await app.close();}
});

test('registration policy and registered learners persist across application recreation',async()=>{
  const database=await createTestDatabase(),close=database.close;database.close=async()=>{};
  let app=await startHttpApp({database});
  try{
    const admin=await app.setup();await enable(app,admin);await register(app);
    await app.close();app=await startHttpApp({database});
    assert.deepEqual((await json(app,'/api/system/registration')).value,{registrationEnabled:true});
    const learner=await app.login('learning',input.username,input.password);assert.equal(learner.session.user.role,'learner');
    const manager=await app.login('admin');assert.equal((await json(app,path,{auth:manager})).value.revision,1);
  }finally{await app.close();await close();}
});

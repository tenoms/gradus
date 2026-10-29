import test from 'node:test';
import assert from 'node:assert/strict';
import {startHttpApp,testLearner} from '../support/http-app.mjs';
import {resourceIdentity,inferResourceRequest} from '../../server/modules/resources/catalog.mjs';
import { platformConfigFixture } from "../support/platform-config.mjs";

const localRequest=(app,auth,name,input)=>app.request(`/api/learning/platform/${name}`,{auth,body:input});
const fixture=()=>{
  const calls=[];
  return {calls,yybRequest:async()=>{calls.push('directory');return[{id:'source',status:'alive',nickname:'来源账号'}];},loginPlatform:async(name)=>{calls.push(`login:${name}`);return{connected:true,token:`private-${name}`,stuId:'upstream-student',user:name==='math'?{ID:101,StuID:'upstream-student',UserNick:'源账号'}:{userId:'upstream-student'}};},mathRequest:async(path,input)=>{calls.push(`math:${path}`);return{SuccessResponse:true,data:[{QuestionID:42,QuestionTitle:'来源题目'}]};},computerRequest:async(path)=>{calls.push(`computer:${path}`);return{code:200,data:[{id:'chapter',name:'来源章节'}]};}};
};
async function learner(app,admin,name){await app.createUser(admin,testLearner(name,''));return app.login('learning',name,'learner-password-123');}

test('Web login and private records work without connecting, assigning or contacting a YYB source',async()=>{
  const f=fixture(),app=await startHttpApp(f);
  try{
    const admin=await app.setup(),a=await learner(app,admin,'web.first'),b=await learner(app,admin,'web.second');
    for(const auth of[a,b]) {
      assert.equal(auth.session.identityMode,'web');assert.equal(auth.session.account,null);
      assert.equal(auth.session.user.yyb,undefined);assert.equal(auth.session.user.yybRef,undefined);
      for(const name of['math','computer'])assert.equal(auth.session.platforms[name].available,true);
      assert.equal(auth.session.platforms.math.connected,false);
      assert.equal(auth.session.platforms.math.user.StuID,auth.userId);
      assert.equal(auth.session.platforms.math.user.ID,auth.userId);
      assert.equal(auth.session.platforms.computer.user.userId,auth.userId);
      assert.equal((await app.request('/api/learning/auth/session',{auth})).status,200);
    }
    assert.deepEqual(f.calls,[],'Web authentication and session inspection do not acquire source accounts');
    for(const auth of[a,b])assert.equal((await app.request('/api/learning/auth/connect',{auth,body:{ref:'source'}})).status,404);
    assert.deepEqual((await(await app.request('/api/learning/auth/accounts',{auth:a})).json()).accounts,[]);
    await localRequest(app,a,'math',{path:'/api/sys_users/Inner_sys_users',method:'POST',data:{ID:a.userId,EBookIDs:'book-one',UpdateColumns:'ID,EBookIDs'}});
    await localRequest(app,a,'math',{path:'/api/rel_question_log/Inner_rel_question_log',method:'POST',data:{QuestionID:42,Type:'题目',MyAnswer:'A only',State:1,ID:0}});
    const profile=auth=>localRequest(app,auth,'math',{path:'/api/Master/AutoModel',method:'POST',data:{command:'GetUserInfoByStuID',data:'{}'}}).then(response=>response.json());
    assert.equal((await profile(a)).data[0][0].EBookIDs,'book-one');assert.equal((await profile(b)).data[0][0].EBookIDs,'');
    const history=auth=>localRequest(app,auth,'math',{path:'/api/Master/AutoModel',method:'POST',data:{command:'GetQuestionLogInfo_rel2',data:JSON.stringify({QuestionID:42})}}).then(response=>response.json());
    assert.equal((await history(a)).data[5][0].MyAnswer,'A only');assert.equal((await history(b)).data[5].length,0);
    assert.equal((await app.request('/api/learning/platform/math/first-score',{auth:a,body:{score:{SchoolCode:'web-school'}}})).status,200);
    assert.deepEqual(f.calls,[],'personal records use the Web owner and never call the source');
  }finally{await app.close();}
});

test('a local public resource is readable with an unavailable account pool and no source identity',async()=>{
  let sourceCalls=0;
  const app=await startHttpApp({yybRequest:async()=>{sourceCalls++;throw new Error('offline');},loginPlatform:async()=>{sourceCalls++;throw new Error('offline');}});
  try{
    const admin=await app.setup(),auth=await learner(app,admin,'offline.reader');
    const request={path:'/api/question_list/GetQuestionByQuestionNew',method:'GET',data:{},query:{ID:42}};
    const identity=resourceIdentity('math',{user:{id:auth.userId}},app.app.locals.configuration.snapshot(),request);
    await app.app.locals.resourceStore.save(identity.source,inferResourceRequest('math',identity.request),{SuccessResponse:true,data:[{QuestionID:42,QuestionTitle:'PostgreSQL 本地题目'}]});
    const response=await localRequest(app,auth,'math',request);assert.equal(response.status,200);
    assert.equal((await response.json()).data[0].QuestionTitle,'PostgreSQL 本地题目');assert.equal(sourceCalls,0);
    const missing=await localRequest(app,auth,'math',{...request,query:{ID:43}});
    assert.ok([502,503].includes(missing.status));
    const state=await(await app.request('/api/learning/auth/session',{auth})).json();assert.equal(state.authenticated,true);assert.equal(state.platforms.math.available,true);
  }finally{await app.close();}
});

test('public math cache selects the configured station domain regardless of client station fields',async()=>{
  let sourceCalls=0;
  const configurationDefaults=platformConfigFixture();configurationDefaults.math.stationId=7;
  const app=await startHttpApp({configurationDefaults,yybRequest:async()=>{sourceCalls++;throw new Error('offline');},loginPlatform:async()=>{sourceCalls++;throw new Error('offline');}});
  try{
    const admin=await app.setup(),auth=await learner(app,admin,'station.reader');
    const request={path:'/api/question_list/GetQuestionByQuestionNew',method:'GET',data:{},query:{ID:42}};
    const initial=app.app.locals.configuration.snapshot(),domains=[];
    for(const stationId of [7,17]){
      const config={...initial,math:{...initial.math,stationId}};
      const identity=resourceIdentity('math',{user:{id:auth.userId}},config,request);domains.push(identity.source.id);
      await app.app.locals.resourceStore.save(identity.source,inferResourceRequest('math',identity.request),{SuccessResponse:true,data:[{QuestionID:42,QuestionTitle:`站点${stationId}题目`}]});
    }
    assert.notEqual(domains[0],domains[1]);
    const read=async(clientStation)=>{
      const response=await localRequest(app,auth,'math',{...request,query:{ID:42,...(clientStation===undefined?{}:{System_Station_ID:clientStation})}});
      assert.equal(response.status,200);return(await response.json()).data[0].QuestionTitle;
    };
    for(const station of [undefined,7,17,999])assert.equal(await read(station),'站点7题目');
    const changed=await app.request('/api/admin/configuration',{auth:admin,method:'PUT',body:{revision:0,config:{math:{stationId:17}}}});assert.equal(changed.status,200);
    for(const station of [undefined,7,17,999])assert.equal(await read(station),'站点17题目');
    assert.equal(sourceCalls,0,'both configured domains use only their own saved resource without contacting a source');
  }finally{await app.close();}
});

test('a missing public resource automatically acquires one source while the learning identity remains Web-owned',async()=>{
  const f=fixture(),app=await startHttpApp(f);
  try{
    const admin=await app.setup(),a=await learner(app,admin,'automatic.first'),b=await learner(app,admin,'automatic.second');
    assert.deepEqual(f.calls,[]);
    await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{enabled:true,revision:0}});
    const input={path:'/api/Master/AutoModel',method:'POST',data:{command:'GetQuestionNexts2',data:JSON.stringify({BookID:42,StuID:'untrusted'})}};
    const one=await localRequest(app,a,'math',input);assert.equal(one.status,200);
    const count=f.calls.length;
    assert.ok(f.calls.includes('login:math'));assert.equal(f.calls.includes('login:computer'),false);
    assert.equal((await localRequest(app,b,'math',input)).status,200);assert.equal(f.calls.length,count,'the second Web user reads the public database resource without source login');
    const session=await(await app.request('/api/learning/auth/session',{auth:a})).json();assert.equal(session.platforms.math.user.StuID,a.userId);assert.equal(JSON.stringify(session).includes('upstream-student'),false);assert.equal(JSON.stringify(session).includes('private-'),false);
  }finally{await app.close();}
});

test('custom YYB settings do not change ownership or write private records upstream',async()=>{
  const f=fixture(),app=await startHttpApp(f);
  try{
    const admin=await app.setup(),a=await learner(app,admin,'custom.first'),b=await learner(app,admin,'custom.second');
    for(const auth of[a,b])assert.equal((await app.request('/api/learning/account/yyb',{auth,method:'PUT',body:{mode:'custom',baseUrl:'https://same-owned-yyb.example',ref:'source'}})).status,200);
    assert.equal((await localRequest(app,a,'computer',{path:'/api/user/wx/user/updateUserInfo',method:'PUT',data:{name:'Web 私有昵称'}})).status,200);
    const details=auth=>localRequest(app,auth,'computer',{path:'/api/user/wx/user/detail'}).then(response=>response.json());
    assert.equal((await details(a)).data.nickName,'Web 私有昵称');assert.notEqual((await details(b)).data.nickName,'Web 私有昵称');
    assert.deepEqual(f.calls,[]);
  }finally{await app.close();}
});

test('source authentication failure never becomes a Web authentication failure',async()=>{
  const app=await startHttpApp({yybRequest:async()=>{throw Object.assign(new Error('source key rejected'),{status:401});}});
  try{
    const admin=await app.setup(),auth=await learner(app,admin,'source.denied');
    const response=await localRequest(app,auth,'computer',{path:'/api/exam/wx/practice/knowledge',query:{majorId:'major',examType:3}});
    assert.ok([502,503].includes(response.status));assert.notEqual(response.status,401);
    const session=await(await app.request('/api/learning/auth/session',{auth})).json();assert.equal(session.authenticated,true);assert.equal(session.platforms.computer.available,true);
    assert.equal((await localRequest(app,auth,'computer',{path:'/api/exam/wx/personal/collectExerciseList'})).status,200,'local personal records remain usable while a source rejects credentials');
  }finally{await app.close();}
});

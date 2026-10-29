import test from 'node:test';
import assert from 'node:assert/strict';
import {startHttpApp,testLearner} from './http-app.mjs';
import {createTestDatabase} from './database.mjs';
import {readPlatformDefaults} from '../server/integrations/platform-config.mjs';

function fixture(){
  const calls=[];
  return {calls,configurationDefaults:readPlatformDefaults({env:{YYB_BASE_URL:'https://system-yyb.test',YYB_API_KEY:'system-private-key'},readLocal:false}),requestJson:async(input,options={})=>{
    const url=new URL(input);calls.push({url,options});
    if(url.pathname==='/accounts')return {code:0,data:[{id:'same-ref',nickname:'资源来源',status:'alive'}]};
    if(url.pathname==='/wxapp/getCode')return {code:0,data:{code:'source-code'}};
    if(url.pathname==='/api/auth/wx/token')return {access_token:'source-private-token'};
    if(url.pathname==='/api/user/wx/user/detail')return {code:200,data:{userId:'source-student'}};
    return {code:200,data:[{id:'chapter',name:'公共章节'}]};
  }};
}
const settings=(app,auth,body)=>app.request('/api/learning/account/yyb',{auth,method:'PUT',body});
async function learner(app,admin,name){await app.createUser(admin,testLearner(name,''));return app.login('learning',name,'learner-password-123');}
const resource=(app,auth)=>app.request('/api/learning/platform/computer',{auth,body:{path:'/api/exam/wx/practice/knowledge',query:{majorId:'subject',examType:3}}});

test('optional own YYB is a lazy resource source and another owner can reuse the public cache without contacting it',async()=>{
  const f=fixture(),app=await startHttpApp(f);
  try{
    const admin=await app.setup(),first=await learner(app,admin,'own.first'),second=await learner(app,admin,'own.second');
    assert.equal((await settings(app,first,{mode:'custom',baseUrl:'https://first-yyb.test',apiKey:'first-private-key',ref:'same-ref'})).status,200);
    assert.equal((await settings(app,second,{mode:'custom',baseUrl:'https://second-yyb.test',apiKey:'second-private-key',ref:'same-ref'})).status,200);
    assert.equal(f.calls.length,0,'saving a source does not log in or read learning resources');
    const directory=await app.request('/api/learning/auth/accounts',{auth:first});assert.equal(directory.status,200);assert.equal((await directory.json()).accounts[0].ref,'same-ref');
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].url.host,'first-yyb.test');assert.equal(f.calls[0].options.headers.Authorization,'Bearer first-private-key');
    await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:0,enabled:true}});
    const firstRead=await resource(app,first);assert.equal(firstRead.status,200);assert.equal((await firstRead.json()).data[0].id,'chapter');
    assert.ok(f.calls.some(call=>call.url.pathname==='/wxapp/getCode'&&call.url.host==='first-yyb.test'));
    const before=f.calls.length;const secondRead=await resource(app,second);assert.equal(secondRead.status,200);assert.equal(f.calls.length,before,'public PG cache does not acquire the other private source');
    for(const call of f.calls.filter(call=>call.url.host==='first-yyb.test'))assert.equal(call.options.headers.Authorization,'Bearer first-private-key');
    assert.equal(f.calls.some(call=>call.url.host==='second-yyb.test'),false);
    const localWrite=await app.request('/api/learning/platform/computer',{auth:first,body:{path:'/api/exam/wx/personal/addMajorCustom',method:'POST',data:{majorId:'private-major',majorName:'本人的专业'}}});assert.equal(localWrite.status,200);assert.equal(f.calls.length,before);
    const readOwn=auth=>app.request('/api/learning/platform/computer',{auth,body:{path:'/api/exam/wx/personal/majorCustomList'}});
    assert.equal((await(await readOwn(first)).json()).data.length,1);assert.equal((await(await readOwn(second)).json()).data.length,0);
    assert.equal((await settings(app,first,{mode:'custom',baseUrl:'https://switched-yyb.test',apiKey:'switched-private-key',ref:'same-ref'})).status,200);
    assert.equal((await(await readOwn(first)).json()).data[0].majorId,'private-major','changing resource sources preserves the Web learner records');
    assert.equal((await resource(app,first)).status,200);
    assert.equal(f.calls.length,before,'source changes, personal reads and public cache hits do not contact the new source');
    const session=await(await app.request('/api/learning/auth/session',{auth:first})).json();assert.equal(session.platforms.computer.user.userId,first.userId);assert.equal(session.platforms.computer.available,true);
    assert.equal(JSON.stringify(session).includes('private-key'),false);assert.equal(JSON.stringify(session).includes('source-private-token'),false);
    assert.equal((await app.request('/api/learning/auth/connect',{auth:first,body:{ref:'same-ref'}})).status,404);
  }finally{await app.close();}
});

test('optional source settings validate endpoints, isolate credentials and persist without acquiring a source',async()=>{
  const db=await createTestDatabase(),closeDb=db.close;db.close=async()=>{};let f=fixture(),app=await startHttpApp({...f,database:db});
  try{
    const admin=await app.setup(),first=await learner(app,admin,'own.persist'),other=await learner(app,admin,'own.other');
    for(const baseUrl of ['', 'ftp://wrong.test','https://name:password@wrong.test','https://wrong.test?secret=1','https://wrong.test/#fragment'])assert.equal((await settings(app,first,{mode:'custom',baseUrl})).status,400);
    const saved=await settings(app,first,{mode:'custom',baseUrl:'https://own-yyb.test/',apiKey:'own-private-key',ref:'same-ref',userId:other.userId});assert.equal(saved.status,200);
    assert.equal((await(await app.request('/api/learning/account/yyb',{auth:other})).json()).mode,'system');
    assert.equal(f.calls.length,0);await app.close();f=fixture();app=await startHttpApp({...f,database:db});
    const reloaded=await app.login('learning','own.persist','learner-password-123');
    const current=await(await app.request('/api/learning/account/yyb',{auth:reloaded})).json();assert.equal(current.baseUrl,'https://own-yyb.test');assert.equal(current.apiKeyConfigured,true);assert.equal(current.ref,'same-ref');assert.equal(f.calls.length,0);
    const changed=await settings(app,reloaded,{mode:'custom',baseUrl:'https://new-own.test'});assert.equal(changed.status,200);assert.equal((await changed.json()).apiKeyConfigured,false);
    const clear=await settings(app,reloaded,{clearApiKey:true});assert.equal(clear.status,200);assert.equal((await clear.json()).apiKeyConfigured,false);
  }finally{await app.close();await closeDb();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourceSync } from '../server/resource-sync.mjs';
import { startHttpApp, testLearner } from './http-app.mjs';

const config={yyb:{baseUrl:'https://yyb.example'},math:{baseUrl:'https://math.example',appId:'math',stationId:1},computer:{baseUrl:'https://computer.example',appId:'computer',tenantCode:1}};
const session={user:{id:'learner'},account:{ref:'7'},platforms:{computer:{connected:true,token:'source-token'}}};
const request={path:'/api/question_list/GetQuestionByQuestionNew',method:'GET',query:{ID:42},data:{}};

test('concurrent public reads share one cache lookup and source read even when persistence is disabled',async()=>{
  let lookups=0,loads=0;
  const sync=createResourceSync({store:{lookup:async()=>{lookups++;return null;},getSettings:async()=>({enabled:false})},service:{getConfig:()=>config}});
  let release;
  const ready=new Promise(resolve=>{release=resolve;});
  const load=async()=>{loads++;await ready;return {data:[{ID:42,QuestionTitle:'目录题目',StuID:'source-student'}]};};
  const reads=Array.from({length:6},()=>sync.read({platform:'math',session,request,load}));
  await new Promise(resolve=>setImmediate(resolve));release();
  const results=await Promise.all(reads);
  assert.equal(lookups,1);assert.equal(loads,1);
  assert.ok(results.every(value=>value.data[0].QuestionTitle==='目录题目'&&value.data[0].StuID===undefined));
  await sync.read({platform:'math',session,request,load});
  assert.equal(lookups,2);assert.equal(loads,2,'disabled persistence does not retain content after the in-flight read completes');
});

test('numbered question imports query the shared cache once before loading only the requested content',async()=>{
  let lookups=0,loads=0;
  const sync=createResourceSync({store:{lookup:async()=>{lookups++;return null;},getSettings:async()=>({enabled:false})},service:{getConfig:()=>config,computerRequest:async()=>{loads++;return {code:200,data:{exercises:[{exerciseId:'q1'}],exerciseTotalNumber:2,examExerciseIdList:['q1','q2']}};}}});
  const result=await sync.ensureQuestions({platform:'computer',session,request:{path:'/api/exam/wx/practice/exerciseList',method:'GET',query:{majorId:'major',number:1},data:{}}});
  assert.equal(lookups,1);assert.equal(loads,1);assert.deepEqual(result.questions.map(row=>row.exerciseId),['q1']);
});

test('learning requests reuse the YYB directory while management refresh and service changes take effect immediately',async()=>{
  const directoryCalls=[],sourceCalls=[];
  const app=await startHttpApp({
    yybRequest:async(path,data,options,override)=>{directoryCalls.push(override?.baseUrl||'default');await new Promise(resolve=>setTimeout(resolve,20));return [{id:'7',nickname:'来源',status:'alive'}];},
    loginPlatform:async()=>({connected:true,token:'source-token',stuId:'source-student',user:{StuID:'source-student'}}),
    mathRequest:async(path,input)=>{sourceCalls.push(input.query.ID);return {SuccessResponse:true,data:[{QuestionID:input.query.ID}]};},
  });
  try{
    const admin=await app.setup();await app.createUser(admin,testLearner('loading.reader',''));
    const learner=await app.login('learning','loading.reader','learner-password-123');
    const read=ID=>app.request('/api/learning/platform/math',{auth:learner,body:{...request,query:{ID}}});
    assert.equal(directoryCalls.length,0,'Web login does not read the resource source');
    const responses=await Promise.all([read(1),read(2),read(3)]);assert.ok(responses.every(response=>response.status===200));
    assert.equal(directoryCalls.length,1,'concurrent source acquisitions share the directory request');
    assert.equal((await read(4)).status,200);assert.equal(directoryCalls.length,1,'later directory children reuse the short-lived snapshot');
    assert.equal(sourceCalls.length,4,'disabling resource persistence does not cache requested content');
    assert.equal((await app.request('/api/admin/account-pool',{auth:admin})).status,200);assert.equal(directoryCalls.length,2,'management explicitly refreshes source account status');
    const disabled=await app.request('/api/admin/yyb-services/default',{auth:admin,method:'PATCH',body:{revision:0,name:'默认来源',enabled:false}});assert.equal(disabled.status,200);
    assert.equal((await read(5)).status,503,'disabling the source invalidates the learning directory immediately');assert.equal(sourceCalls.length,4);
    const enabled=await app.request('/api/admin/yyb-services/default',{auth:admin,method:'PATCH',body:{revision:1,name:'默认来源',baseUrl:'https://changed-yyb.example',enabled:true}});assert.equal(enabled.status,200);
    assert.equal((await read(6)).status,200);assert.equal(directoryCalls.at(-1),'https://changed-yyb.example');assert.equal(directoryCalls.length,3);
    const stopped=await app.request('/api/admin/account-pool',{auth:admin,method:'PUT',body:{revision:0,algorithm:'round_robin',enabledRefs:[]}});assert.equal(stopped.status,200);
    assert.equal((await read(7)).status,503,'pool disablement is checked before reusing a source directory');
  }finally{await app.close();}
});

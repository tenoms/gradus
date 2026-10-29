import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourceSync } from '../../server/modules/resources/sync.mjs';
import { createPrivatePlatformStore } from '../../server/modules/learning/private-platform.mjs';
import { createTestDatabase } from '../support/database.mjs';
import { startHttpApp, testLearner } from '../support/http-app.mjs';

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

test('large book outlines do not write a private snapshot for every referenced question',async()=>{
  const database=await createTestDatabase(),queries=[],query=database.query;
  database.query=(sql,args)=>{queries.push({sql,args});return query(sql,args);};
  try{
    const store=await createPrivatePlatformStore({database}),rows=Array.from({length:2000},(_,index)=>({ID:index+1,QuestionID:index+1,QuestionTitle:`例题 ${index+1}`,CatalogID:1}));
    queries.length=0;
    const input={path:'/api/Master/AutoModel',method:'POST',query:{},data:{command:'GetQuestionNexts2',data:JSON.stringify({BookID:42})}};
    for(let visit=0;visit<2;visit++){
      const result=await store.handle({userId:'learner',name:'math',input,platform:{},session,config,invoke:async()=>({SuccessResponse:true,data:[rows]})});
      assert.equal(result.data[0].length,2000);
    }
    assert.equal(queries.length,0,'both the first visit and public-cache hits avoid per-question private writes');
    const stored=await query(`SELECT count(*)::integer AS count FROM ${database.web('platform_records')}`);assert.equal(stored.rows[0].count,0);
  }finally{await database.close();}
});

test('full question snapshots use one batch write and still support private collection, answers and reports without resource persistence',async()=>{
  const database=await createTestDatabase(),queries=[],query=database.query;
  database.query=(sql,args)=>{queries.push({sql,args});return query(sql,args);};
  try{
    const store=await createPrivatePlatformStore({database}),questions=Array.from({length:1200},(_,index)=>({exerciseId:`q${index}`,exerciseType:1,exerciseStems:`完整题干 ${index}`,exerciseAnswer:'A',exerciseProperty:{answer:'A'},MyAnswer:'源私人答案'}));
    queries.length=0;
    const response={code:200,data:{exercises:questions}};
    await store.rememberQuestions('learner','computer',response,'source');
    assert.equal(queries.length,1,'a full paper snapshot uses one PostgreSQL statement rather than one per question');
    assert.match(queries[0].sql,/jsonb_to_recordset/);
    await store.rememberQuestions('learner','computer',response,'source');
    assert.equal(queries.length,2);
    const snapshots=await query(`SELECT count(*)::integer AS count FROM ${database.web('platform_records')} WHERE collection='questions:source'`);assert.equal(snapshots.rows[0].count,1200);
    const handle=input=>store.handle({userId:'learner',name:'computer',input:{method:'GET',query:{},data:{},...input},platform:{},session,config});
    // The resource domain used by handle must match the domain of the visited question snapshots.
    const {resourceIdentity}=await import('../../server/modules/resources/catalog.mjs');
    const sourceId=resourceIdentity('computer',session,config,{path:'/api/exam/wx/searchExercise/info/resource-domain',method:'GET',data:{},query:{}}).source.id;
    await store.rememberQuestions('learner','computer',{data:{exercises:[questions[0]]}},sourceId);
    await handle({path:'/api/exam/wx/personal/collectExercise',query:{exerciseId:'q0',collectFlag:0,majorId:'major'}});
    const collection=await handle({path:'/api/exam/wx/personal/collectExerciseList'});
    assert.equal(collection.data.list[0].exerciseStems,'完整题干 0');assert.equal(collection.data.list[0].MyAnswer,undefined);
    const submitted=await handle({path:'/api/exam/wx/practice/submitExam',method:'POST',data:{examinationId:'paper',answers:[{exerciseId:'q0',answer:'B',answerType:2,score:0}],submitStatus:1}});
    const report=await handle({path:'/api/exam/wx/practice/examinationRecord/detail',query:{examRecordId:submitted.data.examRecordId}});
    assert.equal(report.data.answerList[0].exercise.exerciseStems,'完整题干 0');assert.equal(report.data.answerList[0].answer,'B');
    const another=await store.list('another-learner','computer','collection');assert.equal(another.length,0);
  }finally{await database.close();}
});

test('a null exerciseMap.questions preserves the four choices returned with the actual exercise',async()=>{
  const options=['A','B','C','D'].map((questionStem,index)=>({questionStem,questionOrder:index+1,questionScore:0,questionAnswer:`选项 ${questionStem}`,questionAnalysis:null}));
  const fixture={code:200,data:{examId:'paper',exerciseTotalNumber:1,examExerciseIdList:['q1'],exercises:[{exerciseId:'q1',exerciseType:1,exerciseStems:'完整题干',exerciseAnswer:'A',questions:options,questionList:null}],exerciseMap:{q1:{exerciseId:'q1',exerciseType:1,exerciseTotalScore:2,questions:null}}}};
  const app=await startHttpApp({yybRequest:async()=>[{id:'7',status:'alive'}],loginPlatform:async()=>({connected:true,token:'source-token',user:{userId:'source-student'}}),computerRequest:async()=>fixture});
  try{
    const admin=await app.setup();await app.createUser(admin,testLearner('loading.options','7'));const learner=await app.login('learning','loading.options','learner-password-123');
    await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:0,enabled:true}});
    const input={path:'/api/exam/wx/practice/exerciseList',method:'GET',query:{majorId:'major',chapterId:'chapter',number:1},data:{}};
    const response=await app.request('/api/learning/platform/computer',{auth:learner,body:input});assert.equal(response.status,200);const exercise=(await response.json()).data.exercises[0];
    assert.deepEqual(exercise.questions,options);assert.deepEqual(exercise.questionList,options);
    const {resourceIdentity}=await import('../../server/modules/resources/catalog.mjs');
    const identity=resourceIdentity('computer',session,app.app.locals.configuration.snapshot(),input);
    const entities=await app.app.locals.resourceStore.findEntities({sourceId:identity.source.id,platform:'computer',kind:'question',id:'q1'});
    assert.deepEqual(entities[0].payload.questions,options,'shared question entities preserve choices when map detail is null');
    const whole=await app.request('/api/learning/platform/computer',{auth:learner,body:{path:'/api/exam/wx/practice/examExercise',query:{examId:'paper'}}});assert.equal(whole.status,200);
    assert.deepEqual((await whole.json()).data.exercises[0].questions,options,'whole-paper parsing preserves the same actual response structure');
  }finally{await app.close();}
});

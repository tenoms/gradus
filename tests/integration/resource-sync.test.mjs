import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../support/database.mjs';
import { createResourceStore } from '../../server/modules/resources/store.mjs';
import { createResourceSync } from '../../server/modules/resources/sync.mjs';
import { sourceForSession, resourceIdentity, isReadableResource, resourceKey } from '../../server/modules/resources/catalog.mjs';
import { readPlatformDefaults } from '../../server/integrations/platform-config.mjs';

const config = readPlatformDefaults({ env: { YYB_BASE_URL:'https://yyb.example' }, readLocal:false });
const session = {account:{ref:'shared-account'},yybMode:'system',platforms:{math:{connected:true,token:'secret-token',stuId:'source-student'},computer:{connected:true,token:'secret-token'}},expires:Date.now()+86400000};
const task = (path,query={},kind=path) => ({kind,request:{path,method:'GET',data:{},query},context:{}});
const createSync = (store,service={getConfig:()=>config}) => createResourceSync({store,service,connections:new Map([['user',session]]),configuration:{snapshot:()=>config}});

test('resource policy accepts visited content but excludes remote personal writes',()=>{
  for(const path of ['/api/exam/wx/practice/knowledge','/api/exam/wx/course/courseList','/api/exam/wx/school/cs/search','/api/user/wx/actSign/list']) assert.equal(isReadableResource('computer',{path}),true,path);
  for(const path of ['/api/exam/wx/personal/incorrectExercise','/api/user/wx/actSign/content/submit','/api/exam/wx/banner/click/save']) assert.equal(isReadableResource('computer',{path}),false,path);
  assert.equal(isReadableResource('math',{path:'/api/Master/AutoModel',method:'POST',data:{command:'GetQuestionInfoByResolve',data:'{}'}}),true);
});

test('source identity separates endpoints, tenants, accounts and platforms without credentials',()=>{
  const one=sourceForSession('math',session,config);
  assert.notEqual(one.id,sourceForSession('computer',session,config).id);
  assert.notEqual(one.id,sourceForSession('math',{...session,account:{ref:'other'}},config).id);
  assert.notEqual(one.id,sourceForSession('math',{...session,yybBaseUrl:'https://other.example'},config).id);
  assert.notEqual(one.id,sourceForSession('math',session,{...config,math:{...config.math,stationId:2}}).id);
  assert.equal(JSON.stringify(one).includes('secret-token'),false);
  assert.equal(resourceKey({path:'/api/test',query:{b:2,a:1,t:1}}),resourceKey({path:'/api/test',query:{a:1,b:2,t:2}}));
});

test('PostgreSQL keeps visited snapshots, entities and media separate with content revisions',async()=>{
  const database=await createTestDatabase();
  try {
    const store=await createResourceStore(database),source=sourceForSession('math',session,config),request=task('/api/question_list/GetQuestionByQuestionNew',{ID:9},'math.question');
    request.context={BookID:42,CatalogID:7};
    const response={code:200,token:'must-not-store',data:[{ID:9,QuestionID:9,Title:'题目',Image:'https://media.example/q.png'}]};
    await store.save(source,request,response);
    assert.equal((await store.lookup(source.id,'math',request.request)).response.token,undefined);
    assert.equal((await store.findEntities({sourceId:source.id,platform:'math',kind:'question'}))[0].payload.BookID,42);
    assert.equal((await store.findEntities({sourceId:'other-source',platform:'math',kind:'question'})).length,0);
    await assert.rejects(()=>store.findEntities({platform:'math'}),{status:400});
    await store.save(source,request,response);
    assert.equal((await store.lookup(source.id,'math',request.request)).revision,1);
    await store.save(source,request,{...response,data:[{ID:9,QuestionID:9,Title:'修订题目'}]});
    assert.equal((await store.lookup(source.id,'math',request.request)).revision,2);
    assert.equal((await store.status()).resources.mediaReferences,0);
    assert.equal((await store.list({page:'1',pageSize:'20'})).pagination.total,1);
    assert.equal((await (await createResourceStore(database)).status()).resources.total,1);
  } finally {await database.close();}
});

test('enabling and inspecting learning sync never logs in, starts a worker or requests unvisited resources',async()=>{
  const database=await createTestDatabase();
  try {
    const store=await createResourceStore(database),calls=[];
    const service={getConfig:()=>config,mathRequest:async()=>{calls.push('math');},computerRequest:async()=>{calls.push('computer');}};
    const accountPool={publicState:async()=>{calls.push('directory');return {accounts:[],enabledRefs:[]};},loginPlatform:async()=>{calls.push('login');}};
    const sync=createResourceSync({store,service,connections:new Map([['user',session]]),configuration:{snapshot:()=>config},accountPool});
    assert.equal(sync.start,undefined);assert.equal(sync.runBatch,undefined);assert.equal(sync.enqueue,undefined);
    const enabled=await sync.updateSettings({revision:0,enabled:true});
    assert.equal(enabled.settings.enabled,true);assert.equal(enabled.mode,'learning');
    await sync.status();await new Promise(resolve=>setTimeout(resolve,30));await sync.status();
    assert.deepEqual(calls,[]);
    assert.equal((await store.status()).resources.total,0);
    assert.equal((await store.status()).sources.length,0);
    assert.equal(Object.hasOwn(await sync.status(),'tasks'),false);
    await assert.rejects(()=>sync.updateSettings({revision:0,enabled:false}),{status:409});
    await assert.rejects(()=>sync.updateSettings({revision:1,enabled:true,batchSize:5}),{status:400});
  } finally {await database.close();}
});

test('a visited catalogue or page saves exactly its response without fetching children, next pages or analysis',async()=>{
  const database=await createTestDatabase();
  try {
    const store=await createResourceStore(database),calls=[];
    const sync=createSync(store,{getConfig:()=>config,mathRequest:async()=>{calls.push('math');},computerRequest:async()=>{calls.push('computer');}});
    await sync.updateSettings({revision:0,enabled:true});
    const catalogue={path:'/api/Master/AutoModel',method:'POST',data:{command:'GetQuestionNexts2',data:JSON.stringify({BookID:42})},query:{}};
    const response={data:[{ID:9,QuestionID:9,BookID:42},{ID:10,QuestionID:10,BookID:42}]};
    await sync.capture({platform:'math',session,config,request:catalogue,response});
    await sync.capture({platform:'computer',session,config,request:task('/api/exam/wx/lesson/lessonList',{pageNum:1,pageSize:2}).request,response:{code:200,data:{list:[{id:'l1',mediaId:'m1'},{id:'l2'}],total:5}}});
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.deepEqual(calls,[]);
    assert.equal((await sync.status()).resources.total,2);
    const identity=resourceIdentity('math',session,config,catalogue);
    assert.equal((await store.lookup(identity.source.id,'math',identity.request)).response.data.length,2);
    assert.equal(await store.lookup(sourceForSession('math',session,config).id,'math',task('/api/question_list/GetQuestionByIDSoleDes',{ID:9}).request),null);
  } finally {await database.close();}
});

test('mixed learning responses retain source content while removing personal answers and session identifiers',async()=>{
  const database=await createTestDatabase();
  try {
    const store=await createResourceStore(database),sync=createSync(store);
    await sync.updateSettings({revision:0,enabled:true});
    await sync.capture({platform:'computer',session,config,request:task('/api/exam/wx/practice/exerciseList',{number:1}).request,response:{code:200,data:{exercises:[{exerciseId:'q1',exerciseAnswer:'A',answers:['B'],MyAnswer:'B',examRecordId:'source-record'}],examRecordId:'source-record'}}});
    const entities=await sync.findEntities({sourceId:resourceIdentity('computer',session,config,task('/api/exam/wx/practice/exerciseList',{number:1}).request).source.id,platform:'computer'});
    assert.equal(entities.length,1);assert.equal(entities[0].payload.exerciseAnswer,'A');
    assert.equal(entities[0].payload.MyAnswer,undefined);assert.equal(entities[0].payload.answers,undefined);assert.equal(entities[0].payload.examRecordId,undefined);
    assert.equal((await sync.lookup({platform:'computer',session,config,request:task('/api/exam/wx/practice/exerciseList',{number:1}).request})).response.data.exercises[0].exerciseAnswer,'A');
  } finally {await database.close();}
});

test('visited metadata is filtered in PostgreSQL before pagination and large payloads retain all entities',async()=>{
  const database=await createTestDatabase();
  try {
    const store=await createResourceStore(database),source=sourceForSession('math',session,config);
    await store.save(source,{...task('/api/question_list/GetQuestionByQuestionNew',{ID:9}),context:{BookID:42,CatalogID:7}},{data:[{ID:9,QuestionID:9}]});
    await store.save(source,{...task('/api/question_list/GetQuestionByQuestionNew',{ID:10}),context:{BookID:99,CatalogID:7}},{data:[{ID:10,QuestionID:10}]});
    const found=await store.findEntities({sourceId:source.id,platform:'math',filters:{BookID:'42',CatalogID:7},limit:1});
    assert.deepEqual(found.map(row=>row.id),['9']);
    await assert.rejects(()=>store.findEntities({sourceId:source.id,platform:'math',filters:{unexpected:'42'}}),{status:400});
    const payload=Array.from({length:1001},(_,i)=>({ID:i+100,QuestionID:i+100,BookID:100}));
    await store.save(source,{...task('/api/question_list/GetListByPage',{page:1,limit:2000}),context:{BookID:100}},{data:payload});
    const page=await store.findEntities({sourceId:source.id,platform:'math',filters:{BookID:100},limit:1000});
    assert.equal(page.length,1000);assert.equal((await store.findEntities({sourceId:source.id,platform:'math',filters:{BookID:100},limit:1000,offset:1000})).length,1);
  } finally {await database.close();}
});

test('disabled sync keeps previous resources but does not save newly visited content',async()=>{
  const database=await createTestDatabase();
  try {
    const store=await createResourceStore(database),sync=createSync(store),request=task('/api/question_list/GetQuestionByQuestionNew',{ID:1}).request;
    await sync.capture({platform:'math',session,config,request,response:{data:[{ID:1}]}});
    assert.equal((await sync.status()).resources.total,0);assert.equal((await sync.status()).sources.length,0);
    await sync.updateSettings({revision:0,enabled:true});
    await sync.capture({platform:'math',session,config,request,response:{data:[{ID:1}]}});
    await sync.updateSettings({revision:1,enabled:false});
    await sync.capture({platform:'math',session,config,request:task('/api/question_list/GetQuestionByQuestionNew',{ID:2}).request,response:{data:[{ID:2}]}});
    assert.equal((await sync.status()).resources.total,1);
  } finally {await database.close();}
});

test('numbered practice fetches only the requested question and never preloads its whole paper',async()=>{
  const database=await createTestDatabase();
  try {
    const store=await createResourceStore(database),calls=[];
    const service={getConfig:()=>config,computerRequest:async(path,request)=>{
      calls.push({path,request});
      if(path.endsWith('/group'))return {code:200,data:true};
      assert.notEqual(path,'/api/exam/wx/practice/examExercise');
      assert.equal(request.query.number,1);
      return {code:200,data:{examId:'exam',exerciseTotalNumber:2,examExerciseIdList:['q1','q2'],exercises:[{exerciseId:'q1',exerciseAnswer:'A',MyAnswer:'source-private'}],examRecordId:'source-record'}};
    }};
    const sync=createSync(store,service);
    await sync.updateSettings({revision:0,enabled:true});
    const result=await sync.ensureQuestions({platform:'computer',session,config,onDemand:true,request:task('/api/exam/wx/practice/exerciseList',{majorId:'major',chapterId:'chapter',examGroupId:'group',examType:3,examCategory:1,number:1}).request});
    assert.equal(result.imported,true);assert.equal(result.total,2);assert.deepEqual(result.questionIds,['q1','q2']);
    assert.equal(result.questions.length,1);assert.equal(result.questions[0].exerciseId,'q1');assert.equal(result.questions[0].MyAnswer,undefined);
    assert.equal(calls.filter(call=>call.path.endsWith('exerciseList')).length,1);
    assert.equal(calls.some(call=>call.path.endsWith('examExercise')),false);
    const entities=await store.findEntities({sourceId:resourceIdentity('computer',session,config,task('/api/exam/wx/practice/exerciseList',{number:1}).request).source.id,platform:'computer'});
    assert.equal(entities.length,1);assert.equal(entities[0].id,'q1');
  } finally {await database.close();}
});

test('a sync write failure does not reject a successful learning response',async()=>{
  const database=await createTestDatabase();
  try {
    const store=await createResourceStore(database);await store.updateSettings({revision:0,enabled:true});
    const sync=createSync({...store,save:async()=>{throw new Error('database write failed');}});
    await assert.doesNotReject(()=>sync.capture({platform:'math',session,config,request:task('/api/question_list/GetQuestionByQuestionNew',{ID:1}).request,response:{data:[{ID:1}]}}));
    assert.ok((await sync.status()).lastError);
  } finally {await database.close();}
});

test('whole-paper content is read only when the user explicitly requests the whole paper',async()=>{
  const database=await createTestDatabase();
  try {
    const store=await createResourceStore(database),calls=[];
    const service={getConfig:()=>config,computerRequest:async(path,request)=>{
      calls.push({path,request});
      if(path.endsWith('/group'))return {code:200,data:true};
      if(path.endsWith('/examExercise'))return {code:200,data:{examId:'paper',exerciseTotalNumber:2,examExerciseIdList:['q1','q2'],exercises:[{exerciseId:'q1',exerciseAnswer:'A'},{exerciseId:'q2',exerciseAnswer:'B'}]}};
      if(request.query.number==='')return {code:4010,data:'Index: 0, Size: 0'};
      return {code:200,data:{examId:'paper',exerciseTotalNumber:2,examExerciseIdList:['q1','q2'],exercises:[{exerciseId:'q1',exerciseAnswer:'A'}]}};
    }};
    const sync=createSync(store,service);
    const result=await sync.ensureQuestions({platform:'computer',session,config,request:task('/api/exam/wx/practice/exerciseList',{majorId:'major',chapterId:'chapter',examGroupId:'group',number:''}).request});
    assert.equal(result.questions.length,2);assert.equal(result.total,2);
    assert.equal(calls.filter(call=>call.path.endsWith('/examExercise')).length,1);
    assert.equal((await sync.status()).resources.total,0,'ordinary full-paper learning works while persistence is disabled');
  } finally {await database.close();}
});

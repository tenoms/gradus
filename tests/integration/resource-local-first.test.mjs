import test from 'node:test';
import assert from 'node:assert/strict';
import { startHttpApp, testLearner } from '../support/http-app.mjs';

const mathQuestion = { path:'/api/question_list/GetQuestionByQuestionNew', query:{ID:42} };
const mathAnalysis = { path:'/api/question_list/GetQuestionByIDSoleDes', query:{ID:42,SortDesc:'Sort'} };
const exercise = number => ({ path:'/api/exam/wx/practice/exerciseList', query:{majorId:'major',chapterId:'chapter',examType:3,examCategory:1,number} });
const selector = row => ({sourceId:row.sourceId,platform:row.platform,key:row.key});

function deferred() { let resolve; const promise=new Promise(done=>{resolve=done;}); return {promise,resolve}; }
function fixture() {
  const calls=[];
  let version=1, failure, gate;
  async function source(platform,path,input) {
    calls.push({platform,path});
    if(gate) { gate.started.resolve(); await gate.release.promise; }
    if(failure==='network') throw new Error('source offline');
    if(failure==='business') return platform==='math'?{SuccessResponse:false,Message:'资源读取失败'}:{code:500,msg:'资源读取失败'};
    if(failure==='empty') return {code:200,data:{exercises:[]}};
    if(['null','empty-array','empty-table'].includes(failure)) {
      const data=failure==='null'?null:failure==='empty-array'?[]:[[]];
      return platform==='math'?{SuccessResponse:true,data}:{code:200,data};
    }
    if(platform==='math') return {SuccessResponse:true,data:[{QuestionID:42,QuestionTitle:`数学题干${version}`,SoleDes:`数学解析${version}`,MyAnswer:'源账号答案'}]};
    if(path.endsWith('/exerciseList')) {
      const questions=[1,2].map(number=>({exerciseId:`q${number}`,exerciseType:1,exerciseStems:`计算机题干${number}版本${version}`,exerciseAnswer:'A'}));
      return {code:200,data:{examId:'source-paper',exerciseTotalNumber:2,examExerciseIdList:['q1','q2'],exercises:input.query.number?questions.filter(row=>row.exerciseId===`q${input.query.number}`):questions,answers:[{answer:'源账号答案'}]}};
    }
    if(path.endsWith('/examExercise'))return {code:200,data:{exercises:[{exerciseId:'q1',exerciseType:1,exerciseStems:`整卷题干${version}`,exerciseAnswer:'A'}]}};
    if(path.includes('/searchExercise/info/'))return {code:200,data:{exerciseId:'q1',exerciseType:1,exerciseStems:`单题正文${version}`,exerciseAnswer:'A'}};
    return {code:200,data:{url:`https://media.example/play-${version}.m3u8`}};
  }
  return {
    calls, setVersion:value=>{version=value;}, setFailure:value=>{failure=value;},
    block() { const pending={started:deferred(),release:deferred()}; gate=pending; return {started:pending.started.promise,release:()=>{pending.release.resolve();if(gate===pending)gate=undefined;}}; },
    yybRequest:async()=>[{id:'7',nickname:'来源甲',status:'alive'},{id:'8',nickname:'来源乙',status:'alive'}],
    loginPlatform:async(name,account)=>({connected:true,token:`${name}-${account.ref}`,stuId:`student-${account.ref}`,user:name==='math'?{StuID:`student-${account.ref}`}:{userId:`student-${account.ref}`}}),
    mathRequest:(path,input)=>source('math',path,input),computerRequest:(path,input)=>source('computer',path,input),
  };
}
async function setup(f=fixture()) {
  const app=await startHttpApp(f),admin=await app.setup();
  for(const [username,ref] of [['local.first','7'],['local.second','8']])await app.createUser(admin,testLearner(username,ref));
  const first=await app.login('learning','local.first','learner-password-123'),second=await app.login('learning','local.second','learner-password-123');
  const initial=await json(await app.request('/api/admin/resource-sync',{auth:admin}));
  assert.equal(initial.settings.refreshAfterDays,30);
  await json(await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{enabled:true,revision:initial.settings.revision,refreshAfterDays:30}}));
  return {app,admin,first,second,f};
}
async function json(response) { const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value; }
const read=(app,auth,platform,input)=>app.request(`/api/learning/platform/${platform}`,{auth,body:input,signal:AbortSignal.timeout(3000)}).then(json);
async function stale(app,platform,expiresAt='2000-01-01T00:00:00Z') {
  await app.app.locals.database.query(`UPDATE ${app.app.locals.database.upstream('resources')} SET expires_at=$2 WHERE platform=$1 AND scope='public'`,[platform,expiresAt]);
}
const idle=app=>app.app.locals.resourceSync.waitForIdle();

test('expired mathematical questions and analysis return local content before background refresh completes, shared across users',async()=>{
  const {app,admin,first,second,f}=await setup(); let blocked;
  try {
    await read(app,first,'math',mathQuestion);await read(app,first,'math',mathAnalysis);
    await read(app,first,'math',{path:'/api/rel_question_log/Inner_rel_question_log',method:'POST',data:{QuestionID:42,Type:'题目',MyAnswer:'用户甲答案',State:1,ID:0}});
    assert.equal(f.calls.length,2);
    await stale(app,'math');f.setVersion(2);blocked=f.block();
    const [question,analysis]=await Promise.all([read(app,second,'math',mathQuestion),read(app,second,'math',mathAnalysis)]);
    assert.equal(question.data[0].QuestionTitle,'数学题干1');assert.equal(analysis.data[0].SoleDes,'数学解析1');
    await blocked.started;
    assert.equal((await read(app,first,'math',mathQuestion)).data[0].QuestionTitle,'数学题干1');
    blocked.release();await idle(app);
    assert.equal(f.calls.length,4,'each stale resource refreshes once despite repeated cross-user reads');
    assert.equal((await read(app,first,'math',mathQuestion)).data[0].QuestionTitle,'数学题干2');
    assert.equal((await read(app,second,'math',mathAnalysis)).data[0].SoleDes,'数学解析2');
    const history=auth=>read(app,auth,'math',{path:'/api/Master/AutoModel',method:'POST',data:{command:'GetQuestionLogInfo_rel2',data:JSON.stringify({QuestionID:42})}});
    assert.equal((await history(first)).data[5][0].MyAnswer,'用户甲答案');assert.equal((await history(second)).data[5].length,0);
    const settings=(await json(await app.request('/api/admin/resource-sync',{auth:admin}))).settings;
    const updated=await json(await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:settings.revision,enabled:true,refreshAfterDays:45}}));
    assert.equal(updated.settings.refreshAfterDays,45);
    await stale(app,'math');
    await read(app,first,'math',mathQuestion);await idle(app);
    const renewed=(await app.app.locals.resourceStore.list({platform:'math',scope:'public'})).resources.find(row=>row.path===mathQuestion.path);
    assert.ok(Math.abs(Date.parse(renewed.expiresAt)-Date.parse(renewed.syncedAt)-45*86400000)<60000,'the saved setting controls the next successful refresh deadline');
  } finally { blocked?.release();await app.close(); }
});

test('null or expired public resources survive network and business refresh failures while missing resources still fail',async()=>{
  const {app,admin,first,second,f}=await setup();
  try {
    await read(app,first,'math',mathQuestion);await stale(app,'math',null);
    const before=(await app.app.locals.resourceStore.list({platform:'math',scope:'public'})).resources[0];
    f.setFailure('network');
    assert.equal((await read(app,second,'math',mathQuestion)).data[0].QuestionTitle,'数学题干1');await idle(app);
    f.setFailure('business');
    assert.equal((await read(app,first,'math',mathQuestion)).data[0].QuestionTitle,'数学题干1');await idle(app);
    const after=await app.app.locals.resourceStore.detail(selector(before));
    assert.equal(after.response.data[0].QuestionTitle,'数学题干1');assert.equal(after.revision,before.revision);
    f.setFailure('network');
    const missing=await app.request('/api/learning/platform/math',{auth:first,body:{...mathQuestion,query:{ID:999}}});
    assert.ok([502,503].includes(missing.status));
    f.setFailure('business');
    assert.equal((await app.request('/api/learning/platform/math',{auth:first,body:{...mathQuestion,query:{ID:998}}})).status,502);
    assert.equal((await json(await app.request('/api/learning/auth/session',{auth:first}))).authenticated,true);
    const settings=(await json(await app.request('/api/admin/resource-sync',{auth:admin}))).settings;
    await json(await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:settings.revision,enabled:false,refreshAfterDays:settings.refreshAfterDays}}));
    const beforeDisabled=f.calls.length;
    assert.equal((await read(app,second,'math',mathQuestion)).data[0].QuestionTitle,'数学题干1');await idle(app);
    assert.equal(f.calls.length,beforeDisabled,'disabled synchronization serves stored content without a refresh');
    f.setFailure(undefined);f.setVersion(3);
    const disabled=(await json(await app.request('/api/admin/resource-sync',{auth:admin}))).settings;
    await json(await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:disabled.revision,enabled:true,refreshAfterDays:30}}));
    assert.equal((await read(app,first,'math',mathQuestion)).data[0].QuestionTitle,'数学题干1');await idle(app);
    assert.equal((await read(app,second,'math',mathQuestion)).data[0].QuestionTitle,'数学题干3');
  } finally { await app.close(); }
});

test('computer numbered and whole-paper reads serve stale local content and preserve Web answers after refresh',async()=>{
  const {app,first,second,f}=await setup();let blocked;
  try {
    const numbered=await read(app,first,'computer',exercise(1));
    await read(app,first,'computer',{path:'/api/exam/wx/practice/submitExam',method:'POST',data:{examinationId:numbered.data.examId,answers:[{exerciseId:'q1',answer:'B',answerType:2,score:0}]}});
    const whole=await read(app,second,'computer',exercise(0));assert.equal(whole.data.exercises.length,2);
    await stale(app,'computer');f.setVersion(2);blocked=f.block();
    const one=await read(app,first,'computer',exercise(1)),all=await read(app,second,'computer',exercise(0));
    assert.equal(one.data.exercises[0].exerciseStems,'计算机题干1版本1');assert.equal(one.data.answers[0].answer,'B');
    assert.deepEqual(all.data.exercises.map(row=>row.exerciseStems),['计算机题干1版本1','计算机题干2版本1']);
    assert.equal(all.data.answers.length,0);await blocked.started;blocked.release();await idle(app);
    const refreshed=await read(app,first,'computer',exercise(1));assert.equal(refreshed.data.exercises[0].exerciseStems,'计算机题干1版本2');assert.equal(refreshed.data.answers[0].answer,'B');
    assert.equal((await read(app,second,'computer',exercise(0))).data.exercises[1].exerciseStems,'计算机题干2版本2');
    await stale(app,'computer');f.setFailure('empty');
    assert.equal((await read(app,first,'computer',exercise(1))).data.exercises[0].exerciseStems,'计算机题干1版本2');await idle(app);
    f.setFailure(undefined);
    const stored=await app.app.locals.resourceStore.list({platform:'computer',scope:'public'});
    assert.ok(stored.resources.every(row=>row.expired),'an empty successful envelope must not replace or renew valid local question content');
    await stale(app,'computer');f.setFailure('network');
    assert.equal((await read(app,second,'computer',exercise(0))).data.exercises.length,2);await idle(app);
    assert.equal((await read(app,first,'computer',exercise(1))).data.answers[0].answer,'B');await idle(app);
  } finally { blocked?.release();await app.close(); }
});

test('account responses and volatile playback responses never use saved copies when the source fails',async()=>{
  const {app,first,f}=await setup();
  try {
    const account={path:'/api/Master/Model',method:'POST',data:{command:'GetMajorComputingAndUserAllocation',data:'{}'}};
    const volatile={path:'/api/exam/wx/course/get_play_info/v2',query:{mediaId:'media'}};
    await read(app,first,'math',account);await read(app,first,'computer',volatile);
    const stored=await app.app.locals.resourceStore.list({});assert.deepEqual(stored.resources.map(row=>row.scope).sort(),['account','volatile']);
    f.setFailure('network');
    for(const [platform,input] of [['math',account],['computer',volatile]]) {
      const response=await app.request(`/api/learning/platform/${platform}`,{auth:first,body:input});
      assert.ok([502,503].includes(response.status));
    }
  } finally { await app.close(); }
});

test('empty successful mathematical content never replaces a saved question or analysis while an empty catalogue remains valid',async()=>{
  const {app,first,second,f}=await setup();
  try {
    await read(app,first,'math',mathQuestion);await read(app,first,'math',mathAnalysis);
    const before=(await app.app.locals.resourceStore.list({platform:'math',scope:'public'})).resources;
    for(const failure of ['null','empty-array','empty-table']) {
      await stale(app,'math');f.setFailure(failure);
      assert.equal((await read(app,second,'math',mathQuestion)).data[0].QuestionTitle,'数学题干1');
      assert.equal((await read(app,second,'math',mathAnalysis)).data[0].SoleDes,'数学解析1');await idle(app);
      for(const row of before) {
        const saved=await app.app.locals.resourceStore.detail(selector(row));
        assert.equal(saved.revision,row.revision,`${failure} must not replace ${row.path}`);assert.equal(saved.expired,true);
      }
    }
    const catalogue={path:'/api/Master/AutoModel',method:'POST',data:{command:'GetQuestionNexts2',data:JSON.stringify({BookID:321})}};
    const callsBefore=f.calls.length;
    assert.deepEqual((await read(app,first,'math',catalogue)).data,[[]]);
    assert.deepEqual((await read(app,second,'math',catalogue)).data,[[]]);assert.equal(f.calls.length,callsBefore+1,'a valid empty catalogue is persisted and reused');
    const saved=(await app.app.locals.resourceStore.list({platform:'math',scope:'public'})).resources.find(row=>row.command==='GetQuestionNexts2');
    assert.ok(saved);assert.equal(saved.expired,false);
  } finally { await app.close(); }
});

test('empty successful computer single-question and generic paper responses keep their saved content',async()=>{
  const {app,first,second,f}=await setup();
  try {
    const detail={path:'/api/exam/wx/searchExercise/info/q1'},paper={path:'/api/exam/wx/practice/examExercise',query:{examId:'source-paper'}};
    assert.equal((await read(app,first,'computer',detail)).data.exerciseStems,'单题正文1');
    assert.equal((await read(app,first,'computer',paper)).data.exercises[0].exerciseStems,'整卷题干1');
    const before=(await app.app.locals.resourceStore.list({platform:'computer',scope:'public'})).resources;
    for(const failure of ['null','empty-array']) {
      await stale(app,'computer');f.setFailure(failure);
      assert.equal((await read(app,second,'computer',detail)).data.exerciseStems,'单题正文1');
      assert.equal((await read(app,second,'computer',paper)).data.exercises[0].exerciseStems,'整卷题干1');await idle(app);
      for(const row of before) {
        const saved=await app.app.locals.resourceStore.detail(selector(row));
        assert.equal(saved.revision,row.revision);assert.equal(saved.expired,true);
      }
    }
  } finally { await app.close(); }
});

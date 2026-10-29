import test from 'node:test';
import assert from 'node:assert/strict';
import { startHttpApp, testLearner } from './http-app.mjs';
import { resourceIdentity } from '../server/resource-catalog.mjs';
import { sharedOperation,stripSharedPersonalState } from '../server/shared-account-policy.mjs';

const fixture=()=>{
  const calls=[];
  return {calls,yybRequest:async()=>[{id:'7',nickname:'共享一',status:'alive'},{id:'8',nickname:'共享二',status:'alive'}],
    loginPlatform:async(name,account)=>{calls.push({login:name,ref:account.ref});return {connected:true,token:`secret-${name}-${account.ref}`,stuId:'source-student',user:name==='math'?{ID:10,StuID:'source-student',UserNick:'源账号',EBookIDs:'source-books'}:{userId:'source-user',nickName:'源账号'}};},
    mathRequest:async(path,input)=>{calls.push({platform:'math',path,input});return {SuccessResponse:true,data:[]};},
    computerRequest:async(path,input)=>{calls.push({platform:'computer',path,input});return {code:200,data:{examId:'exam-one',exercises:[{exerciseId:'question-one',exerciseType:1,exerciseProperty:{answer:'A'},title:'真实返回题干'}],answers:[{answer:'upstream-private-answer'}],examRecordId:'upstream-private-id',IsFavorite:1}};},
  };
};
const call=async(app,auth,name,input)=>{
  const response=await app.request(`/api/learning/platform/${name}`,{auth,body:input});
  return {status:response.status,data:await response.json()};
};
async function user(app,admin,name,ref='7'){await app.createUser(admin,testLearner(name,ref));return app.login('learning',name,'learner-password-123');}

test('shared policy separates personal reads and removes upstream progress from mixed resources',()=>{
  for(const path of ['/api/exam/wx/personal/majorCustomList','/api/exam/wx/personal/collectExerciseList','/api/exam/wx/personal/incorrectExerciseList','/api/exam/wx/personal/exercise/stat']) assert.equal(sharedOperation('computer',{path,method:'GET'}),'private',path);
  assert.deepEqual(stripSharedPersonalState({IsFavorite:1,IsMistake:1,MyScore:60,MyAnswer:'a',title:'题目'}),{title:'题目'});
});

test('two Web users share one upstream token while answers, reports, notes, collections and shelves remain separate',async()=>{
  const f=fixture(),app=await startHttpApp(f);
  try{
    const admin=await app.setup(),a=await user(app,admin,'shared.first'),b=await user(app,admin,'shared.second');
    assert.equal(f.calls.length,0,'Web login does not acquire a resource source');
    const exercise=await call(app,a,'computer',{path:'/api/exam/wx/practice/exerciseList',query:{majorId:'major',chapterId:'chapter'}});
    assert.equal(exercise.status,200); assert.equal(JSON.stringify(exercise.data).includes('upstream-private'),false);
    const submit=await call(app,a,'computer',{path:'/api/exam/wx/practice/submitExam',method:'POST',data:{examinationId:exercise.data.data.examId,answers:[{exerciseId:'question-one',answer:'B',answerType:2}],submitStatus:1}});
    assert.equal(submit.status,200);
    const reportId=submit.data.data.examRecordId;
    assert.ok(reportId);
    const report=await call(app,a,'computer',{path:'/api/exam/wx/practice/examinationRecord/detail',query:{examRecordId:reportId}});
    assert.equal(report.data.data.answerList[0].answer,'B');
    assert.equal((await call(app,b,'computer',{path:'/api/exam/wx/practice/examinationRecord/detail',query:{examRecordId:reportId}})).status,404);
    assert.equal((await call(app,a,'computer',{path:'/api/exam/wx/personal/collectExercise',query:{exerciseId:'question-one',collectFlag:0,majorId:'major'}})).status,200);
    assert.equal((await call(app,a,'computer',{path:'/api/exam/wx/personal/addExerciseNote',query:{collectExerciseId:'question-one',exerciseNote:'仅用户A'}})).status,200);
    const readCollection=auth=>call(app,auth,'computer',{path:'/api/exam/wx/personal/collectExerciseList'});
    assert.equal((await readCollection(a)).data.data.list[0].exerciseNote,'仅用户A');
    assert.equal((await readCollection(b)).data.data.list.length,0);
    const shelf=await call(app,a,'math',{path:'/api/sys_users/Inner_sys_users',method:'POST',data:{ID:a.userId,EBookIDs:'book-a',UpdateColumns:'ID,EBookIDs'}});
    assert.equal(shelf.status,200);
    const readProfile=auth=>call(app,auth,'math',{path:'/api/Master/AutoModel',method:'POST',data:{command:'GetUserInfoByStuID',data:'{}'}});
    assert.equal((await readProfile(a)).data.data[0][0].EBookIDs,'book-a');
    assert.equal((await readProfile(b)).data.data[0][0].EBookIDs,'');
    const saved=await call(app,a,'math',{path:'/api/rel_question_log/Inner_rel_question_log',method:'POST',data:{QuestionID:'math-question',Type:'题目',MyAnswer:'私有答案',State:2,IsSubmit:1,ID:0}});
    assert.equal(saved.status,200);assert.ok(Number(saved.data.data)>0);
    const history=auth=>call(app,auth,'math',{path:'/api/Master/AutoModel',method:'POST',data:{command:'GetQuestionLogInfo_rel2',data:JSON.stringify({QuestionID:'math-question'})}});
    assert.equal((await history(a)).data.data[5][0].MyAnswer,'私有答案');
    assert.equal((await history(b)).data.data[5].length,0);
    assert.ok(f.calls.filter(call=>call.platform).every(call=>['/api/exam/wx/practice/exerciseList','/api/exam/wx/practice/examExercise','/api/exam/wx/practice/cache/examination/group'].includes(call.path)),'only the user-requested resource reads reach the shared upstream');
    const nextLaunch=await call(app,a,'computer',{path:'/api/exam/wx/practice/exerciseList',query:{majorId:'major',chapterId:'chapter'}});
    assert.notEqual(nextLaunch.data.data.examRecordId,reportId,'a submitted paper starts an independent next record');
    const unsupported=await call(app,a,'math',{path:'/api/sys_comment/Add',method:'POST',data:{Content:'comment'}});
    assert.equal(unsupported.status,409);
  }finally{await app.close();}
});

test('pool selection supports round robin, least loaded, sticky and explicit empty disablement',async()=>{
  const app=await startHttpApp(fixture());
  try{
    const admin=await app.setup();
    let revision=0;
    for(const algorithm of ['round_robin','least_loaded','sticky']){
      const saved=await app.request('/api/admin/account-pool',{auth:admin,method:'PUT',body:{revision,algorithm,enabledRefs:['7','8']}});
      assert.equal(saved.status,200); revision=(await saved.json()).revision;
      const a=await user(app,admin,`pool.${algorithm}.first`,''),b=await user(app,admin,`pool.${algorithm}.second`,'');
      const [one,two]=await Promise.all([app.app.locals.accountPool.resolve(a.userId),app.app.locals.accountPool.resolve(b.userId)]);
      assert.ok(['7','8'].includes(one));
      if(algorithm!=='sticky')assert.notEqual(one,two);
      assert.equal(await app.app.locals.accountPool.resolve(a.userId),one);
    }
    assert.equal((await app.request('/api/admin/account-pool',{auth:admin,method:'PUT',body:{revision,algorithm:'round_robin',enabledRefs:[]}})).status,200);
    const denied=await user(app,admin,'pool.disabled','');await assert.rejects(()=>app.app.locals.accountPool.resolve(denied.userId),{status:503});
  }finally{await app.close();}
});

test('mathematics practice generates local questions, saves and resets answers, and prevents another user reading its paper',async()=>{
  const f=fixture();
  f.mathRequest=async(path,input)=>{f.calls.push({platform:'math',path,input});return path.endsWith('/RelPaper')?{SuccessResponse:true,data:{ID:888}}:{SuccessResponse:true,data:Array.from({length:10},(_,i)=>({ID:900+i,QuestionID:i?`math-question-${i}`:'math-question',QuestionTitle:'本次练习题',Answer:'A'}))};};
  const app=await startHttpApp(f);
  try{
    const admin=await app.setup(),a=await user(app,admin,'math.local.first'),b=await user(app,admin,'math.local.second');
    const created=await call(app,a,'math',{path:'/api/choice_question_exercise/RelPaper',method:'POST',data:{CatalogID:'catalog',BusType:'数一',Type:'精选10题',ExanType:'真题模式'}});
    assert.equal(created.status,200);const paperId=created.data.data.ID;assert.ok(paperId);
    const read=auth=>call(app,auth,'math',{path:'/api/choice_question_exercise/GetPaper',query:{ID:paperId}});
    const questions=(await read(a)).data.data;assert.equal(questions.length,10);assert.equal(questions[0].QuestionID,'math-question');
    assert.equal((await read(b)).status,404);
    const answerId=questions[0].ID;
    assert.equal((await call(app,a,'math',{path:'/api/choice_question_exercise_log/Inner_choice_question_exercise_log',method:'POST',data:{ID:answerId,MyAnswer:'A',State:1,UpdateColumns:'ID,MyAnswer,State'}})).status,200);
    assert.equal((await read(a)).data.data[0].MyAnswer,'A');assert.equal((await read(a)).data.data.length,10);
    assert.equal((await call(app,a,'math',{path:'/api/choice_question_exercise/Inner_choice_question_exercise',method:'POST',data:{ID:paperId,IsFinish:1,UpdateColumns:'ID,IsFinish'}})).status,200);
    assert.equal((await call(app,a,'math',{path:'/api/choice_question_exercise/UpdateChoiceInfo',method:'POST',data:{id:paperId,IsFinish:0}})).status,200);
    assert.equal((await read(a)).data.data[0].MyAnswer,'');
    assert.deepEqual(f.calls.filter(call=>call.platform).map(call=>call.path),['/api/choice_question_exercise/RelPaper','/api/choice_question_exercise/GetPaper']);
  }finally{await app.close();}
});

test('learning sync can stay disabled while requested questions become an owned resumable practice',async()=>{
  const f=fixture();let imports=0;
  const app=await startHttpApp({...f,computerRequest:async(path)=>{
    if(path==='/api/exam/wx/practice/exerciseList'){imports++;return {code:200,data:{examId:'source-exam',examRecordId:'source-record',exercises:[{exerciseId:'live-q',exerciseType:1}],answers:[{answer:'source-private'}]}};}
    if(path==='/api/exam/wx/practice/examExercise')return {code:200,data:{examId:'source-exam',exercises:[{exerciseId:'live-q',exerciseType:1}],exerciseMap:{'live-q':{exerciseProperty:{answer:'A'}}},answers:[{answer:'source-private'}]}};
    return {code:200,data:true};
  },mathRequest:async(path)=>{
    if(path==='/api/choice_question_exercise/RelPaper') return {SuccessResponse:true,data:{ID:888}};
    if(path==='/api/choice_question_exercise/GetPaper') return {SuccessResponse:true,data:[{ID:999,QuestionID:'math-live-q',Type:'题目',StuID:'source-student',MyAnswer:'source-private',State:2,_question_list:{QuestionTitle:'按需题目'}}]};
    return {SuccessResponse:true,data:[]};
  }});
  try{
    const admin=await app.setup(),a=await user(app,admin,'ondemand.first'),b=await user(app,admin,'ondemand.second');
    assert.equal((await app.app.locals.resourceStore.getSettings()).enabled,false);
    const launch=()=>call(app,a,'computer',{path:'/api/exam/wx/practice/exerciseList',query:{majorId:'major',chapterId:'chapter',examType:3,examCategory:1,number:1}});
    const first=await launch();assert.equal(first.status,200);assert.equal(first.data.data.exercises[0].exerciseId,'live-q');assert.equal(JSON.stringify(first.data).includes('source-private'),false);
    const again=await launch();assert.equal(again.data.data.examRecordId,first.data.data.examRecordId);assert.equal(imports,1);
    assert.equal((await app.app.locals.resourceStore.status()).resources.total,0);
    const math=await call(app,a,'math',{path:'/api/choice_question_exercise/RelPaper',method:'POST',data:{CatalogID:55,BusType:'数一',Type:'精选10题'}});
    assert.equal(math.status,200);assert.notEqual(math.data.data.ID,888);
    const paper=await call(app,a,'math',{path:'/api/choice_question_exercise/GetPaper',query:{ID:math.data.data.ID}});
    assert.equal(paper.data.data[0].QuestionID,'math-live-q');assert.equal(paper.data.data[0].MyAnswer,'');
    assert.equal((await call(app,b,'math',{path:'/api/choice_question_exercise/GetPaper',query:{ID:math.data.data.ID}})).status,404);
    assert.equal((await app.app.locals.resourceStore.status()).resources.total,0);
  }finally{await app.close();}
});

test('least loaded counts fixed bindings and rejects stale pool writes',async()=>{
  const app=await startHttpApp(fixture());
  try{
    const admin=await app.setup(),fixed=await user(app,admin,'load.fixed','7');await app.app.locals.accountPool.resolve(fixed.userId,{fixedRef:'7'});
    const settings={revision:0,algorithm:'least_loaded',enabledRefs:['7','8']};
    assert.equal((await app.request('/api/admin/account-pool',{auth:admin,method:'PUT',body:settings})).status,200);
    assert.equal((await app.request('/api/admin/account-pool',{auth:admin,method:'PUT',body:settings})).status,409);
    const automatic=await user(app,admin,'load.automatic','');
    assert.equal(await app.app.locals.accountPool.resolve(automatic.userId),'8');
  }finally{await app.close();}
});


test('learning synchronization records only visited questions and failure never blocks the learning response',async()=>{
  const f=fixture(),requests=[];
  const app=await startHttpApp({...f,computerRequest:async(path,input)=>{
    requests.push({path,input});
    assert.notEqual(path,'/api/exam/wx/practice/examExercise','sequential learning must not fetch a whole paper');
    if(path.endsWith('/exerciseList')) {
      const number=Number(input.query.number),id=`visit-${number}`;
      return {code:200,data:{examId:'visited-exam',exerciseTotalNumber:3,examExerciseIdList:['visit-1','visit-2','visit-3'],exercises:[{exerciseId:id,exerciseType:1,exerciseStems:`仅第${number}题`}],answers:[{answer:'source-private'}],examRecordId:'source-private'}};
    }
    return {code:200,data:[{id:'chapter'}]};
  }});
  try{
    const admin=await app.setup(),a=await user(app,admin,'visits.first');
    assert.equal(requests.length,0,'connecting does not discover or synchronize resource data');
    assert.equal((await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:0,enabled:true}})).status,200);
    assert.equal(requests.length,0,'enabling synchronization does not request upstream data');
    const source=resourceIdentity('computer',{user:{id:a.userId},account:null},app.app.locals.configuration.snapshot(),{path:'/api/exam/wx/practice/exerciseList',method:'GET',query:{majorId:'major',chapterId:'chapter',examType:3,number:1},data:{}}).source;
    const visited=async()=> (await app.app.locals.resourceStore.findEntities({sourceId:source.id,platform:'computer',kind:'question',limit:100})).map(row=>row.id).sort();
    const launch=number=>call(app,a,'computer',{path:'/api/exam/wx/practice/exerciseList',query:{majorId:'major',chapterId:'chapter',examType:3,number}});
    const one=await launch(1);assert.equal(one.status,200);assert.equal(one.data.data.exerciseTotalNumber,3);
    assert.deepEqual(await visited(),['visit-1']);assert.equal(requests.length,1);
    await new Promise(resolve=>setTimeout(resolve,50));assert.equal(requests.length,1,'idle time never fetches remaining questions');
    assert.equal((await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:1,enabled:false}})).status,200);
    const two=await launch(2);assert.equal(two.status,200);assert.equal(two.data.data.exercises[0].exerciseId,'visit-2');
    assert.deepEqual(await visited(),['visit-1']);
    assert.equal((await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:2,enabled:true}})).status,200);
    await launch(2);assert.deepEqual(await visited(),['visit-1','visit-2']);assert.equal(requests.length,3,'a missing public cache is refreshed when synchronization resumes instead of publishing an old owned snapshot');
    app.app.locals.resourceSync.capture=async()=>{throw new Error('database temporarily unavailable');};
    const resource=await call(app,a,'computer',{path:'/api/exam/wx/practice/knowledge'});
    assert.equal(resource.status,200);assert.equal(resource.data.data[0].id,'chapter');
  }finally{await app.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {startHttpApp,testLearner} from '../support/http-app.mjs';

const question=id=>({ID:id,QuestionID:id,QuestionTitle:`第${id}题`,QuestionTxt:`完整数学题干${id}`,QuestionAnswer:'A'});
const computerQuestion=id=>({exerciseId:id,exerciseType:1,exerciseStems:`完整计算机题干${id}`,exerciseAnswer:'A',questions:['A','B'].map((value,index)=>({questionStem:value,questionOrder:index+1,questionAnswer:`选项${value}`}))});
const practice=(number,extra={})=>({path:'/api/exam/wx/practice/exerciseList',query:{majorId:'major',chapterId:'chapter',examGroupId:'group',examExerciseType:1,examType:3,examCategory:1,number,...extra}});
const mathDetail=id=>({path:'/api/question_list/GetQuestionByQuestionNew',query:{ID:id}});
const resolve=id=>({path:'/api/Master/AutoModel',method:'POST',data:{command:'GetQuestionInfoByResolve',data:JSON.stringify({QuestionID:id})}});
const mathPractice={path:'/api/choice_question_exercise/RelPaper',method:'POST',data:{BusType:'数一',CatalogID:18,ExanType:'真题模式',Type:'精选10题'}};

function fixture({ids=['q1','q2'],total=ids.length,referenceOnly=false,wholeFallback=false}={}) {
  const calls=[];let offline=false;
  const source=(kind,path)=>{calls.push({kind,path});if(offline)throw Object.assign(new Error('source offline'),{status:502});};
  return {
    calls,offline:()=>{offline=true;},online:()=>{offline=false;},
    yybRequest:async()=>{source('directory','/accounts');return [{id:'7',status:'alive',nickname:'来源甲'},{id:'8',status:'alive',nickname:'来源乙'}];},
    loginPlatform:async(name,account)=>{source('login',name);return {connected:true,token:`${name}-${account.ref}`,stuId:`student-${account.ref}`,user:name==='math'?{StuID:`student-${account.ref}`}:{userId:`student-${account.ref}`}};},
    mathRequest:async(path,input)=>{
      source('resource',path);
      if(path.endsWith('/RelPaper'))return {SuccessResponse:true,data:{ID:700}};
      if(path.endsWith('/GetPaper'))return {SuccessResponse:true,data:[1,2].map(id=>({ID:7000+id,QuestionID:id,ExerciseID:700,MyAnswer:'来源答案',State:1,_question_list:question(id)}))};
      if(input.data?.command==='GetQuestionNexts2')return {SuccessResponse:true,data:[[{ID:3,QuestionID:3,QuestionTitle:'只有题号与标题'}]]};
      if(input.data?.command==='GetQuestionInfoByResolve')return {SuccessResponse:true,data:[[{ID:501,QuestionID:1,Type:'选项',Content:'A选项',Answer:'A'},{ID:502,QuestionID:1,Type:'选项',Content:'B选项',Answer:'B'}]]};
      if(path.endsWith('/GetQuestionByIDSoleDes'))return {SuccessResponse:true,data:[{ID:901,QuestionID:1,Type:'解析',Content:'解析第一步'},{ID:902,QuestionID:1,Type:'解析',Content:'解析第二步'}]};
      return {SuccessResponse:true,data:[question(Number(input.query.ID))]};
    },
    computerRequest:async(path,input)=>{
      source('resource',path);
      if(path.endsWith('/group'))return {code:200,data:true};
      if(path.includes('/searchExercise/info/'))return {code:200,data:computerQuestion(path.split('/').at(-1))};
      const number=Number(input.query.number||0),selected=number?[ids[number-1]]:ids;
      if(wholeFallback&&path.endsWith('/exerciseList')&&!number)return {code:4010,msg:'请先取得当前题目'};
      const exercises=selected.filter(Boolean).map(id=>referenceOnly?{exerciseId:id,exerciseTitle:'只有目录引用'}:computerQuestion(id));
      return {code:200,data:{examId:'source-paper',exerciseTotalNumber:total,examExerciseIdList:wholeFallback&&path.endsWith('/examExercise')?null:ids,exercises,exerciseMap:Object.fromEntries(exercises.map(row=>[row.exerciseId,{questions:null}])),answers:[{answer:'来源答案'}]}};
    },
  };
}
async function json(response) {const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;}
async function setup(f=fixture()) {
  const app=await startHttpApp(f),admin=await app.setup();
  for(const [username,ref] of [['reuse.first','7'],['reuse.second','8']])await app.createUser(admin,testLearner(username,ref));
  const first=await app.login('learning','reuse.first','learner-password-123'),second=await app.login('learning','reuse.second','learner-password-123');
  await json(await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:0,enabled:true,refreshAfterDays:30}}));
  return {app,admin,first,second,f};
}
const read=(app,auth,name,input)=>app.request(`/api/learning/platform/${name}`,{auth,body:input}).then(json);
const dataRows=response=>{const data=response.data;return Array.isArray(data?.[0])?data[0]:Array.isArray(data)?data:data?.exercises||[data];};
const submit=(app,auth,exam,answer='B')=>read(app,auth,'computer',{path:'/api/exam/wx/practice/submitExam',method:'POST',data:{examinationId:exam.data.examId,answers:[{exerciseId:'q1',answer,answerType:2,score:0}],submitStatus:1}});

test('a mathematical practice supplies reusable full question bodies without leaking source exercise identifiers',async()=>{
  const {app,first,second,f}=await setup();
  try {
    await read(app,first,'math',mathPractice);
    const before=f.calls.length;f.offline();
    const response=await read(app,second,'math',mathDetail(1));
    assert.equal(dataRows(response)[0].QuestionTxt,'完整数学题干1');assert.equal(f.calls.length,before);
    assert.equal(JSON.stringify(response).includes('来源答案'),false);
    assert.equal(dataRows(response)[0].ExerciseID,undefined);assert.equal(dataRows(response)[0].ID,1);
  } finally {await app.close();}
});

test('mathematical analysis and structured options reuse their own full row sets by question ID',async()=>{
  const {app,first,second,f}=await setup();
  try {
    const sole=await read(app,first,'math',{path:'/api/question_list/GetQuestionByIDSoleDes',query:{ID:1,SortDesc:'Sort'}});
    const options=await read(app,first,'math',resolve(1));
    const before=f.calls.length;f.offline();
    const reusedSole=await read(app,second,'math',{path:'/api/question_list/GetQuestionByIDSoleDes',query:{ID:'1'}});
    const reusedOptions=await read(app,second,'math',resolve('1'));
    assert.deepEqual(dataRows(reusedSole),dataRows(sole));assert.deepEqual(dataRows(reusedOptions),dataRows(options));
    assert.equal(dataRows(reusedSole).length,2);assert.equal(dataRows(reusedOptions).length,2);assert.equal(f.calls.length,before);
    const missingBody=await app.request('/api/learning/platform/math',{auth:second,body:mathDetail(1)});
    assert.ok([502,503].includes(missingBody.status),'analysis and option rows cannot stand in for the question body');
  } finally {await app.close();}
});

test('concurrent equivalent command entries share one upstream content read',async()=>{
  const f=fixture(),original=f.mathRequest;
  let release,announce,loads=0;
  const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{announce=resolve;});
  f.mathRequest=async(path,input)=>{loads++;announce();await gate;return original(path,input);};
  const {app,first,second}=await setup(f);
  try {
    const reads=[read(app,first,'math',resolve(1)),read(app,second,'math',{...resolve('1'),path:'/api/Master/Model'})];
    await started;release();
    const [one,two]=await Promise.all(reads);
    assert.deepEqual(dataRows(one),dataRows(two));assert.equal(loads,1);
  } finally {release();await app.close();}
});

test('a mathematical catalogue reference never satisfies a missing full question body',async()=>{
  const {app,first,second,f}=await setup();
  try {
    await read(app,first,'math',{path:'/api/Master/AutoModel',method:'POST',data:{command:'GetQuestionNexts2',data:'{"BookID":42}'}});
    f.offline();
    const response=await app.request('/api/learning/platform/math',{auth:second,body:mathDetail(3)});
    assert.ok([502,503].includes(response.status),'a title and question number cannot replace missing learning content');
  } finally {await app.close();}
});

test('computer numbered visits complete an ordered group that creates independent whole-paper practices locally',async()=>{
  const {app,first,second,f}=await setup();
  try {
    await read(app,first,'computer',practice(1));await read(app,first,'computer',practice(2));
    const before=f.calls.length;f.offline();
    const whole=await read(app,second,'computer',practice(0));
    assert.deepEqual(whole.data.examExerciseIdList,['q1','q2']);assert.equal(whole.data.exercises.length,2);assert.equal(whole.data.answers.length,0);
    assert.deepEqual(whole.data.exercises[0].questions,computerQuestion('q1').questions,'sparse exerciseMap does not erase choices');
    const detail=await read(app,second,'computer',{path:'/api/exam/wx/searchExercise/info/q1'});assert.equal(dataRows(detail)[0].exerciseStems,'完整计算机题干q1');
    await submit(app,second,whole);
    const reopened=await read(app,second,'computer',practice(0));assert.notEqual(reopened.data.examRecordId,whole.data.examRecordId);assert.equal(reopened.data.answers.length,0);
    const firstWhole=await read(app,first,'computer',practice(0));assert.notEqual(firstWhole.data.examRecordId,reopened.data.examRecordId);assert.equal(firstWhole.data.answers.length,0);
    assert.equal(f.calls.length,before,'whole-paper creation, cross-entry lookup and reopening need no source account');
  } finally {await app.close();}
});

test('a complete computer paper supplies numbered questions without calling the source again',async()=>{
  const {app,first,second,f}=await setup();
  try {
    const whole=await read(app,first,'computer',practice(0));assert.equal(whole.data.exercises.length,2);
    const before=f.calls.length;f.offline();
    const numbered=await read(app,second,'computer',practice(2));assert.equal(numbered.data.exercises.length,1);assert.equal(numbered.data.exercises[0].exerciseId,'q2');
    assert.deepEqual(numbered.data.examExerciseIdList,['q1','q2']);assert.equal(f.calls.length,before);
  } finally {await app.close();}
});

test('computer whole-paper fallback keeps the first numbered response membership when the full response omits it',async()=>{
  const {app,first,second,f}=await setup(fixture({wholeFallback:true}));
  try {
    const whole=await read(app,first,'computer',practice(0));assert.equal(whole.data.exercises.length,2);
    const before=f.calls.length;f.offline();
    const numbered=await read(app,second,'computer',practice(2));assert.equal(numbered.data.exercises[0].exerciseId,'q2');
    assert.deepEqual(numbered.data.examExerciseIdList,['q1','q2']);
    assert.equal((await read(app,second,'computer',practice(0))).data.exercises.length,2);assert.equal(f.calls.length,before);
  } finally {await app.close();}
});

test('incomplete computer membership or missing bodies cannot fabricate a complete local practice',async()=>{
  for(const options of [{ids:['q1','q2'],total:2},{ids:['q1'],total:2},{ids:['q1','q1'],total:2},{ids:['q1','q2'],total:2,referenceOnly:true}]) {
    const {app,first,second,f}=await setup(fixture(options));
    try {
      const initial=await app.request('/api/learning/platform/computer',{auth:first,body:practice(1)});
      assert.ok(initial.status===200||options.referenceOnly&&initial.status===502);
      const before=f.calls.length;f.offline();
      const response=await app.request('/api/learning/platform/computer',{auth:second,body:practice(0)});
      assert.ok([502,503].includes(response.status));assert.ok(f.calls.length>before,'missing group content must use the source instead of silently shortening the paper');
    } finally {await app.close();}
  }
});

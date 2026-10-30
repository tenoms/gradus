import test from 'node:test';
import assert from 'node:assert/strict';
import { startHttpApp,testLearner } from '../support/http-app.mjs';

const selector={BusType:'数一',CatalogID:18,Type:'精选10题',ExanType:'真题模式'};
const createInput=data=>({path:'/api/choice_question_exercise/RelPaper',method:'POST',data:{...selector,...data}});
const questions=()=>[
  {ID:90002,ExerciseID:50001,QuestionID:202,Type:'题目',StuID:'source-student',MyAnswer:'源私人答案',State:2,_question_list:{ID:202,QuestionTxt:'第二道完整题干',TypeAnswer:'B'}},
  {ID:90001,ExerciseID:50001,QuestionID:101,Type:'题目',StuID:'source-student',MyAnswer:'源私人答案',State:1,_question_list:{ID:101,QuestionTxt:'第一道完整题干',TypeAnswer:'A'}},
];
function fixture(){
  const calls=[];let offline=false,rows=questions(),created=0;
  const visit=kind=>{calls.push(kind);if(offline)throw new Error('source offline');};
  return {
    calls,setOffline:value=>{offline=value;},setRows:value=>{rows=value;},
    yybRequest:async()=>{visit('directory');return [{id:'7',status:'alive',nickname:'共享来源'}];},
    loginPlatform:async name=>{visit(`login:${name}`);return {connected:true,token:'source-token',stuId:'source-student',user:{StuID:'source-student'}};},
    mathRequest:async(path,input)=>{
      visit(path);
      if(path.endsWith('/RelPaper')){assert.equal(input.data.StuID,'source-student');return {SuccessResponse:true,data:{ID:50000+ ++created}};}
      if(path.endsWith('/GetPaper'))return {SuccessResponse:true,data:rows};
      return {SuccessResponse:true,data:[{QuestionID:101,QuestionTxt:'已同步的零散题目'}]};
    },
    computerRequest:async(path,input)=>{
      visit(path);const type=Number(input.query.examExerciseType);
      return {code:200,data:{examId:`paper-${type}`,exerciseTotalNumber:1,examExerciseIdList:[`q-${type}`],exercises:[{exerciseId:`q-${type}`,exerciseType:type,exerciseStems:`题型 ${type}`,exerciseAnswer:'A'}]}};
    },
  };
}
async function setup({enabled=true}={}){
  const source=fixture(),app=await startHttpApp(source),admin=await app.setup();
  for(const name of ['practice.local.first','practice.local.second'])await app.createUser(admin,testLearner(name,'7'));
  const first=await app.login('learning','practice.local.first','learner-password-123'),second=await app.login('learning','practice.local.second','learner-password-123');
  if(enabled)await checked(await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:0,enabled:true}}));
  return {app,source,admin,first,second};
}
async function checked(response){const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;}
const math=(app,auth,input)=>app.request('/api/learning/platform/math',{auth,body:input}).then(checked);
const create=(app,auth,data)=>math(app,auth,createInput(data)).then(response=>response.data);
const paper=(app,auth,ID)=>math(app,auth,{path:'/api/choice_question_exercise/GetPaper',query:{ID}}).then(response=>response.data);
const sourceReads=source=>source.calls.filter(path=>path.startsWith('/api/'));

test('a complete saved mathematics group creates independent Web replays without a source or source log identifiers',async()=>{
  const {app,source,admin,first,second}=await setup();
  try{
    const original=await create(app,first),originalRows=await paper(app,first,original.ID);
    assert.equal(original.selectionMode,'source-selection');assert.notEqual(original.ID,50001);
    assert.deepEqual(originalRows.map(row=>row.QuestionID),[202,101]);
    assert.deepEqual(originalRows.map(row=>row._question_list.QuestionTxt),['第二道完整题干','第一道完整题干']);
    for(const row of originalRows){assert.equal(row.MyAnswer,'');assert.equal(row.State,0);assert.equal(row.ExerciseID,original.ID);assert.ok(![90002,90001].includes(row.ID));assert.equal(row.sourceExerciseLogId,undefined);}
    await math(app,first,{path:'/api/choice_question_exercise_log/Inner_choice_question_exercise_log',method:'POST',data:{ID:originalRows[0].ID,MyAnswer:'B',State:1}});
    await math(app,first,{path:'/api/choice_question_exercise/Inner_choice_question_exercise',method:'POST',data:{ID:original.ID,IsFinish:1}});
    assert.deepEqual(sourceReads(source),['/api/choice_question_exercise/RelPaper','/api/choice_question_exercise/GetPaper']);
    const settings=(await checked(await app.request('/api/admin/resource-sync',{auth:admin}))).settings;
    await checked(await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:settings.revision,enabled:false}}));
    source.setOffline(true);const before=source.calls.length;
    const again=await create(app,first),other=await create(app,second);
    assert.equal(again.selectionMode,'local-group-replay');assert.equal(other.selectionMode,'local-group-replay');
    assert.equal(new Set([original.ID,again.ID,other.ID]).size,3);
    const againRows=await paper(app,first,again.ID),otherRows=await paper(app,second,other.ID);
    assert.equal(new Set([...originalRows,...againRows,...otherRows].map(row=>row.ID)).size,6);
    for(const rows of [againRows,otherRows]){
      assert.deepEqual(rows.map(row=>row.QuestionID),originalRows.map(row=>row.QuestionID));
      assert.deepEqual(rows.map(row=>row._question_list.QuestionTxt),['第二道完整题干','第一道完整题干']);
      assert.ok(rows.every(row=>row.MyAnswer===''&&row.State===0&&row.sourceExerciseLogId===undefined));
    }
    assert.equal((await paper(app,first,original.ID))[0].MyAnswer,'B');
    const forbidden=await app.request('/api/learning/platform/math',{auth:second,body:{path:'/api/choice_question_exercise/GetPaper',query:{ID:original.ID}}});assert.equal(forbidden.status,404);
    assert.equal(source.calls.length,before,'replays and private state do not inspect or log in to YYB');
    const localRecord=await app.app.locals.database.query(`SELECT data FROM ${app.app.locals.database.web('platform_records')} WHERE user_id=$1 AND collection='choice_question_exercise' AND id=$2`,[first.userId,again.ID]);
    assert.equal(localRecord.rows[0].data.sourcePracticeId,undefined);
  }finally{await app.close();}
});

test('mathematics group reuse separates all selection parameters and never freezes unknown random modes',async()=>{
  const {app,source,first,second}=await setup();
  try{
    await create(app,first);const before=sourceReads(source).length;
    assert.equal((await create(app,second)).selectionMode,'local-group-replay');assert.equal(sourceReads(source).length,before);
    for(const values of [{CatalogID:19},{BusType:'数二'},{Type:'章节模式'},{ExanType:'非真题模式'},{Difficulty:'难题'}]){
      assert.equal((await create(app,second,values)).selectionMode,'source-selection');
    }
    assert.equal(sourceReads(source).length,before+10,'a different selector needs its own complete group');
    for(let run=0;run<2;run++)assert.equal((await create(app,first,{Type:'随机推荐'})).selectionMode,'source-selection');
    assert.equal(sourceReads(source).length,before+14,'unknown adaptive modes keep selecting at the source');
  }finally{await app.close();}
});

test('question references or title-only responses do not become a complete locally reusable mathematics group',async()=>{
  const {app,source,first}=await setup();
  try{
    await math(app,first,{path:'/api/question_list/GetQuestionByQuestionNew',query:{ID:101}});
    source.setRows([{ID:90001,QuestionID:101,QuestionTitle:'已知正文引用'},{ID:90002,QuestionID:202,QuestionTitle:'仅有标题'}]);
    await create(app,first);
    source.setOffline(true);
    const before=await app.app.locals.database.query(`SELECT count(*)::integer AS count FROM ${app.app.locals.database.web('platform_records')} WHERE collection='choice_question_exercise'`);
    const response=await app.request('/api/learning/platform/math',{auth:first,body:createInput()});assert.ok([502,503].includes(response.status));
    const after=await app.app.locals.database.query(`SELECT count(*)::integer AS count FROM ${app.app.locals.database.web('platform_records')} WHERE collection='choice_question_exercise'`);
    assert.equal(after.rows[0].count,before.rows[0].count,'a failed source selection never creates a partial private practice');
  }finally{await app.close();}
});

test('an authoritative group manifest can join its complete bodies from an earlier individual question read',async()=>{
  const {app,source,first,second}=await setup();
  try{
    await math(app,first,{path:'/api/question_list/GetQuestionByQuestionNew',query:{ID:101}});
    source.setRows([{ID:90001,QuestionID:101,QuestionTitle:'已知正文引用'}]);
    const original=await create(app,first);assert.equal(original.selectionMode,'source-selection');
    source.setOffline(true);const before=source.calls.length;
    const replay=await create(app,second),rows=await paper(app,second,replay.ID);
    assert.equal(replay.selectionMode,'local-group-replay');assert.notEqual(replay.ID,original.ID);
    assert.deepEqual(rows.map(row=>String(row.QuestionID)),['101']);
    assert.equal(rows[0]._question_list.QuestionTxt,'已同步的零散题目');
    assert.equal(source.calls.length,before,'known complete bodies plus the real group manifest need no source');
  }finally{await app.close();}
});

test('a source exercise log id cannot stand in for a missing real question id',async()=>{
  const {app,source,first}=await setup();
  try{
    source.setRows([{ID:90001,QuestionTxt:'没有题目标识的正文'}]);
    const response=await app.request('/api/learning/platform/math',{auth:first,body:createInput()});assert.equal(response.status,502);
    const stored=await app.app.locals.database.query(`SELECT count(*)::integer AS count FROM ${app.app.locals.database.web('platform_records')} WHERE collection IN ('choice_question_exercise','choice_question_exercise_log')`);
    assert.equal(stored.rows[0].count,0);
  }finally{await app.close();}
});

test('a failed public group save does not prevent a successful owned mathematics practice',async()=>{
  const {app,source,first}=await setup();
  try{
    app.app.locals.resourceStore.save=async()=>{throw new Error('group persistence unavailable');};
    const created=await create(app,first),rows=await paper(app,first,created.ID);
    assert.equal(created.selectionMode,'source-selection');assert.deepEqual(rows.map(row=>row.QuestionID),[202,101]);
    assert.equal(sourceReads(source).length,2);
    assert.equal((await app.app.locals.resourceStore.status()).resources.total,0);
  }finally{await app.close();}
});

test('computer question types create separate private launches for otherwise matching selectors',async()=>{
  const {app,source,first}=await setup({enabled:false});
  try{
    const launch=async examExerciseType=>checked(await app.request('/api/learning/platform/computer',{auth:first,body:{path:'/api/exam/wx/practice/exerciseList',query:{majorId:'major',chapterId:'chapter',examType:3,examCategory:1,examExerciseType,number:1}}}));
    const choices=await launch(1),shortAnswers=await launch(3);
    assert.notEqual(choices.data.examRecordId,shortAnswers.data.examRecordId);
    assert.equal(choices.data.exercises[0].exerciseId,'q-1');assert.equal(shortAnswers.data.exercises[0].exerciseId,'q-3');
    assert.equal(sourceReads(source).length,2);
  }finally{await app.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { startHttpApp,testLearner } from '../support/http-app.mjs';

const fixture=()=>{
  const calls=[];
  let version=1;
  return {
    calls,setVersion:value=>{version=value;},
    yybRequest:async()=>[{id:'7',nickname:'来源甲',status:'alive'},{id:'8',nickname:'来源乙',status:'alive'}],
    loginPlatform:async(name,account)=>({connected:true,token:`source-${name}-${account.ref}`,stuId:`student-${account.ref}`,user:name==='math'?{ID:Number(account.ref),StuID:`student-${account.ref}`}:{userId:`student-${account.ref}`}}),
    mathRequest:async(path,input)=>{calls.push({platform:'math',path,input});return {SuccessResponse:true,data:[[{ID:42,QuestionID:42,QuestionTitle:`公共数学内容${version}`,MyAnswer:'source-private'}]]};},
    computerRequest:async(path,input)=>{
      calls.push({platform:'computer',path,input});
      if(path.endsWith('/group'))return {code:200,data:true};
      if(path.endsWith('/exerciseList'))return {code:200,data:{examId:'shared-paper',exerciseTotalNumber:2,examExerciseIdList:['q1','q2'],exercises:[{exerciseId:`q${input.query.number || 1}`,exerciseType:1,exerciseStems:`公共题干${version}`,exerciseAnswer:'A'}],answers:[{answer:'source-private'}],examRecordId:'source-private'}};
      return {code:200,data:[{id:42,title:`公共内容${version}`}]};
    },
  };
};
async function setup(app){
  const admin=await app.setup();
  for(const [name,ref] of [['public.first','7'],['public.second','8']])await app.createUser(admin,testLearner(name,ref));
  const first=await app.login('learning','public.first','learner-password-123'),second=await app.login('learning','public.second','learner-password-123');
  const enabled=await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{enabled:true,revision:0}});assert.equal(enabled.status,200);
  return {admin,first,second};
}
async function learning(app,auth,platform,input){const response=await app.request(`/api/learning/platform/${platform}`,{auth,body:input});const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;}
const exerciseInput=number=>({path:'/api/exam/wx/practice/exerciseList',query:{majorId:'major',chapterId:'chapter',examType:3,examCategory:1,number}});
const resourcePath=row=>`/api/admin/resources/${row.platform}/${row.sourceId}/${row.key}`;
async function resources(app,admin,platform){const response=await app.request(`/api/admin/resources?platform=${platform}&scope=public`,{auth:admin});assert.equal(response.status,200);return (await response.json()).resources;}

test('public mathematical resource is read from PostgreSQL by another Web user on a different YYB account',async()=>{
  const f=fixture(),app=await startHttpApp(f);
  try{
    const {admin,first,second}=await setup(app);
    assert.equal(f.calls.length,0,'login and enabling do not fetch learning content');
    const input={path:'/api/Master/AutoModel',method:'POST',data:{command:'GetQuestionNexts2',data:JSON.stringify({BookID:42,StuID:'untrusted-actor'})}};
    const one=await learning(app,first,'math',input),two=await learning(app,second,'math',input);
    assert.equal(one.data[0][0].QuestionTitle,'公共数学内容1');
    assert.deepEqual(two,one);assert.equal(f.calls.length,1,'the second source account reuses the public PostgreSQL resource');
    assert.equal(JSON.stringify(two).includes('source-private'),false);
    const rows=await resources(app,admin,'math');assert.equal(rows.length,1);assert.equal(rows[0].scope,'public');
    const personal=auth=>learning(app,auth,'math',{path:'/api/Master/AutoModel',method:'POST',data:{command:'GetQuestionLogInfo_rel2',data:JSON.stringify({QuestionID:42})}});
    await learning(app,first,'math',{path:'/api/rel_question_log/Inner_rel_question_log',method:'POST',data:{QuestionID:42,Type:'题目',MyAnswer:'仅用户甲',State:1,ID:0}});
    assert.equal((await personal(first)).data[5][0].MyAnswer,'仅用户甲');assert.equal((await personal(second)).data[5].length,0);
  }finally{await app.close();}
});

test('shared practice uses PostgreSQL edits, refreshes stale content in the background and rebuilds deleted resources',async()=>{
  const f=fixture(),app=await startHttpApp(f);
  try{
    const {admin,first,second}=await setup(app);
    const one=await learning(app,first,'computer',exerciseInput(1)),two=await learning(app,second,'computer',exerciseInput(1));
    assert.equal(one.data.exercises[0].exerciseStems,'公共题干1');assert.equal(two.data.exercises[0].exerciseStems,'公共题干1');
    assert.notEqual(one.data.examRecordId,two.data.examRecordId,'each Web learner owns a separate practice');assert.equal(f.calls.length,1);
    const saved=await learning(app,first,'computer',{path:'/api/exam/wx/practice/submitExam',method:'POST',data:{examinationId:one.data.examId,answers:[{exerciseId:'q1',answer:'B',answerType:2,score:0}]}});
    assert.ok(saved.data.examRecordId);
    let row=(await resources(app,admin,'computer'))[0],detail=await (await app.request(resourcePath(row),{auth:admin})).json();
    const edited=structuredClone(detail.response);edited.data.exercises[0].exerciseStems='管理员修订的题干';
    const updated=await app.request(resourcePath(row),{auth:admin,method:'PATCH',body:{revision:detail.revision,response:edited}});assert.equal(updated.status,200);row=await updated.json();
    assert.equal((await learning(app,first,'computer',exerciseInput(1))).data.exercises[0].exerciseStems,'管理员修订的题干');
    assert.equal(f.calls.length,1,'editing is immediately used without an upstream read');
    assert.equal((await learning(app,second,'computer',exerciseInput(1))).data.answers.length,0);
    const own=await learning(app,first,'computer',exerciseInput(1));assert.equal(own.data.answers[0].answer,'B');
    f.setVersion(2);
    const invalidated=await app.request(`${resourcePath(row)}/invalidate`,{auth:admin,body:{revision:row.revision}});assert.equal(invalidated.status,200);row=await invalidated.json();
    assert.equal(f.calls.length,1,'marking stale never starts an upstream request');
    assert.equal((await learning(app,first,'computer',exerciseInput(1))).data.exercises[0].exerciseStems,'管理员修订的题干');
    await app.app.locals.resourceSync.waitForIdle();assert.equal(f.calls.length,2);
    assert.equal((await learning(app,second,'computer',exerciseInput(1))).data.exercises[0].exerciseStems,'公共题干2');assert.equal(f.calls.length,2);
    f.setVersion(3);
    await app.app.locals.database.query(`UPDATE ${app.app.locals.database.upstream('resources')} SET expires_at=now()-interval '1 second' WHERE source_id=$1 AND platform=$2 AND request_key=$3`,[row.sourceId,row.platform,row.key]);
    assert.equal((await learning(app,second,'computer',exerciseInput(1))).data.exercises[0].exerciseStems,'公共题干2');
    await app.app.locals.resourceSync.waitForIdle();assert.equal(f.calls.length,3);
    assert.equal((await learning(app,second,'computer',exerciseInput(1))).data.exercises[0].exerciseStems,'公共题干3');
    row=(await resources(app,admin,'computer'))[0];
    const removed=await app.request(resourcePath(row),{auth:admin,method:'DELETE',body:{revision:row.revision}});assert.equal(removed.status,200);
    assert.equal((await learning(app,first,'computer',exerciseInput(1))).data.exercises[0].exerciseStems,'公共题干3');assert.equal(f.calls.length,4,'cache removal triggers a read only on the next visit');
    assert.equal((await learning(app,first,'computer',exerciseInput(1))).data.answers[0].answer,'B','resource lifecycle does not delete the learner answer');
  }finally{await app.close();}
});

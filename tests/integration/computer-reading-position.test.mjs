import test from 'node:test';
import assert from 'node:assert/strict';
import {startHttpApp,testLearner} from '../support/http-app.mjs';

function sourceFixture() {
  const calls=[];
  return {
    calls,
    yybRequest:async()=>[{id:'source',nickname:'题库来源',status:'alive'}],
    loginPlatform:async()=>({connected:true,token:'fixture-source-token',user:{userId:'source-reader'}}),
    computerRequest:async(path,input)=>{
      calls.push({path,input});
      const group=input.query.examGroupId,number=Number(input.query.number || 1);
      return {code:200,data:{examId:`paper-${group}`,exerciseTotalNumber:3,examExerciseIdList:[1,2,3].map(index=>`${group}-${index}`),exercises:[{exerciseId:`${group}-${number}`,exerciseType:1,exerciseStems:`第${number}题`,exerciseAnswer:'A'}]}};
    },
  };
}
const input=(group,number=1)=>({path:'/api/exam/wx/practice/exerciseList',query:{majorId:'major',chapterId:'chapter',examGroupId:group,examType:3,examCategory:1,number}});
async function platform(app,auth,input,expectedStatus=200) {
  const response=await app.request('/api/learning/platform/computer',{auth,body:input});
  const value=await response.json();
  assert.equal(response.status,expectedStatus,JSON.stringify(value));
  return value;
}
const savePosition=(app,auth,examRecordId,sheetIndex,status=200)=>platform(app,auth,{path:'/api/exam/wx/practice/submit/sheet/index',method:'POST',data:{examRecordId,sheetIndex}},status);
async function setup(app) {
  const admin=await app.setup();
  for(const name of ['position.first','position.second'])await app.createUser(admin,testLearner(name,''));
  assert.equal((await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{enabled:true,revision:0}})).status,200);
  return {
    first:await app.login('learning','position.first','learner-password-123'),
    second:await app.login('learning','position.second','learner-password-123'),
  };
}

test('computer positions persist without answers, stay private per practice group and survive independent logins',async()=>{
  const source=sourceFixture(),app=await startHttpApp(source);
  try {
    const {first,second}=await setup(app);
    const firstGroup=(await platform(app,first,input('one'))).data;
    const otherGroup=(await platform(app,first,input('two'))).data;
    const otherLearner=(await platform(app,second,input('one'))).data;
    assert.notEqual(firstGroup.examRecordId,otherGroup.examRecordId);
    assert.notEqual(firstGroup.examRecordId,otherLearner.examRecordId);
    const before=source.calls.length;
    await savePosition(app,first,firstGroup.examRecordId,3);
    await savePosition(app,first,otherGroup.examRecordId,2);
    assert.equal(source.calls.length,before,'saving a position never writes to the shared source');
    const reopened=(await platform(app,first,input('one'))).data;
    assert.equal(reopened.sheetIndex,3,'loading the first resource does not reset the saved position');
    assert.equal(reopened.examRecordId,firstGroup.examRecordId);
    assert.deepEqual(reopened.answers,[],'browsing does not submit an answer');
    assert.equal((await platform(app,first,input('two'))).data.sheetIndex,2);
    assert.equal((await platform(app,second,input('one'))).data.sheetIndex,1);
    await savePosition(app,second,firstGroup.examRecordId,2,404);
    const independentLogin=await app.login('learning','position.first','learner-password-123');
    assert.equal((await platform(app,independentLogin,input('one'))).data.sheetIndex,3);
    await savePosition(app,independentLogin,firstGroup.examRecordId,1);
    assert.equal((await platform(app,first,input('one'))).data.sheetIndex,1);
    assert.equal(source.calls.length,before,'reopening uses the shared cached resource while positions remain Web-owned');
    assert.equal(source.calls.some(call=>call.path.includes('/submit')),false);
  } finally {await app.close();}
});

test('computer positions reject missing, malformed and out-of-range indices without replacing the last valid position',async()=>{
  const source=sourceFixture(),app=await startHttpApp(source);
  try {
    const {first}=await setup(app),launch=(await platform(app,first,input('one'))).data;
    await savePosition(app,first,launch.examRecordId,'2');
    const sourceReads=source.calls.length;
    for(const invalid of [undefined,null,false,true,0,-1,1.5,'','2.5','two',[],{},4,9007199254740992]) {
      await savePosition(app,first,launch.examRecordId,invalid,400);
      assert.equal((await platform(app,first,input('one'))).data.sheetIndex,2);
    }
    await savePosition(app,first,'missing-record',1,404);
    assert.equal(source.calls.length,sourceReads,'invalid position writes never contact the resource source');
  } finally {await app.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {startHttpApp,testLearner} from '../support/http-app.mjs';

test('real question IDs stay separate from book question numbers across refresh and local practice replay',async()=>{
  let offline=false;
  const calls=[];
  const question=id=>({ID:id,QuestionID:String(id===164731?2:3),QuestionTxt:`题目实体 ${id} 的完整正文`});
  const app=await startHttpApp({
    yybRequest:async()=>[{id:'7',status:'alive'}],
    loginPlatform:async()=>({connected:true,token:'identity-token',stuId:'source-student',user:{StuID:'source-student'}}),
    mathRequest:async(path,input)=>{
      calls.push(path);
      if(offline)throw new Error('source offline');
      if(path.endsWith('/RelPaper'))return {SuccessResponse:true,data:{ID:700}};
      if(path.endsWith('/GetPaper'))return {SuccessResponse:true,data:[164731,164732].map((id,index)=>({ID:900+index,QuestionID:id,ExerciseID:700,_question_list:question(id)}))};
      return {SuccessResponse:true,data:[question(Number(input.query.ID))]};
    },
  });
  const checked=async response=>{const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;};
  const read=(auth,input)=>app.request('/api/learning/platform/math',{auth,body:input}).then(checked);
  const practice={path:'/api/choice_question_exercise/RelPaper',method:'POST',data:{BusType:'数一',CatalogID:18,Type:'精选10题',ExanType:'真题模式'}};
  try {
    const admin=await app.setup();
    for(const name of ['identity.first','identity.second'])await app.createUser(admin,testLearner(name,'7'));
    const first=await app.login('learning','identity.first','learner-password-123'),second=await app.login('learning','identity.second','learner-password-123');
    await checked(await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:0,enabled:true}}));
    await read(first,practice);
    await app.app.locals.database.query(`UPDATE ${app.app.locals.database.upstream('resources')} SET expires_at='2000-01-01'::timestamptz WHERE kind='math.practice'`);
    const detail={path:'/api/question_list/GetQuestionByQuestionNew',query:{ID:164731}};
    assert.equal((await read(second,detail)).data[0].ID,164731);
    await app.app.locals.resourceSync.waitForIdle();
    offline=true;const before=calls.length;
    const current=(await read(second,detail)).data[0];
    assert.equal(current.ID,164731);assert.equal(current.QuestionID,'2');
    const created=await read(second,practice);assert.equal(created.data.selectionMode,'local-group-replay');
    const paper=await read(second,{path:'/api/choice_question_exercise/GetPaper',query:{ID:created.data.ID}});
    assert.deepEqual(paper.data.map(row=>row.QuestionID),[164731,164732]);
    assert.deepEqual(paper.data.map(row=>row._question_list.QuestionID),['2','3']);
    assert.deepEqual(paper.data.map(row=>row._question_list.ID),[164731,164732]);
    assert.equal(calls.length,before,'the refreshed real ID and local group both resolve without a source');
  } finally {await app.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { startHttpApp, testLearner } from '../support/http-app.mjs';

const bookViewType='02bf2d6b67684fce9d087e333cdcfcde';
function offlineSources() {
  const calls=[];
  const unavailable=async()=>{calls.push('upstream');throw new Error('positions do not need a resource source');};
  return {calls,yybRequest:unavailable,loginPlatform:unavailable,mathRequest:unavailable,computerRequest:unavailable};
}
async function learner(app,admin,username) {
  await app.createUser(admin,testLearner(username,''));
  return app.login('learning',username,'learner-password-123');
}
async function position(app,auth,bookId,body) {
  const response=await app.request(`/api/learning/platform/math/books/${bookId}/position`,{auth,...(body===undefined?{}:{method:'PUT',body})});
  const value=await response.json();
  assert.equal(response.status,200,JSON.stringify(value));
  return value.position;
}
async function platform(app,auth,input) {
  const response=await app.request('/api/learning/platform/math',{auth,body:input});
  const value=await response.json();
  assert.equal(response.status,200,JSON.stringify(value));
  return value;
}
const addRecord=(app,auth,data)=>platform(app,auth,{path:'/api/sys_user_record/add',method:'POST',data});
const lastQuestion=(app,auth,BookID)=>platform(app,auth,{path:'/api/Master/AutoModel',method:'POST',data:{command:'GetUserLastViewByBook_math',data:JSON.stringify({BookID})}}).then(value=>value.data[0]);

test('book positions overwrite per book, persist across logins and stay private without changing analysis records',async()=>{
  const sources=offlineSources(),app=await startHttpApp(sources);
  try {
    const admin=await app.setup(),first=await learner(app,admin,'position.first'),second=await learner(app,admin,'position.second');
    assert.equal(await position(app,first,42),null);
    await position(app,first,42,{QuestionID:900001,QuestionPage:'10',QuestionSort:'1',BookID:99,user_id:second.userId,StuID:second.userId,BusType:'forged',MyAnswer:'forged'});
    await position(app,first,43,{QuestionID:900100,QuestionPage:'20',QuestionSort:'2'});
    const updated=await position(app,first,42,{QuestionID:'900002',QuestionPage:'11',QuestionSort:'3'});
    assert.equal(updated.QuestionID,900002);
    const saved=await position(app,first,42);
    assert.equal(saved.BookID,42);
    assert.equal(saved.QuestionID,900002);
    assert.equal(saved.QuestionPage,'11');
    assert.equal(saved.QuestionSort,'3');
    for(const field of ['user_id','StuID','BusType','MyAnswer'])assert.equal(saved[field],undefined);
    assert.equal((await position(app,first,43)).QuestionID,900100);
    assert.equal(await position(app,second,42),null);
    await position(app,second,42,{QuestionID:900200});
    assert.equal((await position(app,first,42)).QuestionID,900002);
    assert.equal((await position(app,second,42)).QuestionID,900200);
    const reconnected=await app.login('learning','position.first','learner-password-123');
    assert.equal((await position(app,reconnected,42)).QuestionID,900002);
    await position(app,first,42,{QuestionID:900003});
    const withoutPrintedPosition=await position(app,reconnected,42);
    assert.equal(withoutPrintedPosition.QuestionID,900003);
    assert.equal(withoutPrintedPosition.QuestionPage,null);
    assert.equal(withoutPrintedPosition.QuestionSort,null);
    const records=await app.app.locals.database.query(`SELECT collection,count(*)::integer AS count FROM ${app.app.locals.database.web('platform_records')} WHERE user_id=$1 GROUP BY collection`,[first.userId]);
    assert.deepEqual(records.rows,[{collection:'book-reading-position',count:2}]);
    assert.deepEqual(await lastQuestion(app,first,42),[],'ordinary visits do not become analysis reads');
    assert.deepEqual(sources.calls,[],'saving and restoring private positions never contacts YYB');
  } finally {await app.close();}
});

test('book positions require a learning login and positive integer book and question identifiers',async()=>{
  const app=await startHttpApp(offlineSources());
  try {
    const admin=await app.setup(),auth=await learner(app,admin,'position.validation');
    assert.equal((await app.request('/api/learning/platform/math/books/42/position')).status,401);
    for(const bookId of ['0','-1','1.5','no-book','9007199254740992']) {
      assert.equal((await app.request(`/api/learning/platform/math/books/${bookId}/position`,{auth})).status,400);
      assert.equal((await app.request(`/api/learning/platform/math/books/${bookId}/position`,{auth,method:'PUT',body:{QuestionID:1}})).status,400);
    }
    for(const QuestionID of [undefined,null,0,-1,1.5,true,[],{},'','no-question',9007199254740992]) {
      assert.equal((await app.request('/api/learning/platform/math/books/42/position',{auth,method:'PUT',body:{QuestionID}})).status,400);
    }
    assert.equal(await position(app,auth,42),null);
  } finally {await app.close();}
});

test('legacy book views resume the BusID question instead of the local record id and ignore unrelated records',async()=>{
  const sources=offlineSources(),app=await startHttpApp(sources);
  try {
    const admin=await app.setup(),auth=await learner(app,admin,'position.legacy'),other=await learner(app,admin,'position.legacyother');
    await addRecord(app,auth,{BookID:42,BusType:bookViewType,BusID:900001,BusValue:'1',QuestionPage:10,QuestionSort:1});
    await addRecord(app,auth,{BookID:42,BusType:bookViewType,BusID:900002,BusValue:'1',QuestionPage:11,QuestionSort:2});
    await addRecord(app,auth,{BookID:42,BusType:'unrelated',BusID:900003,BusValue:'1'});
    await addRecord(app,auth,{BookID:42,BusType:bookViewType,BusID:-1,BusValue:'1'});
    await addRecord(app,auth,{BookID:43,BusType:bookViewType,BusID:900004,BusValue:'1'});
    await addRecord(app,other,{BookID:42,BusType:bookViewType,BusID:900005,BusValue:'1'});
    const rows=await lastQuestion(app,auth,42);
    assert.equal(rows.length,1);
    assert.equal(rows[0].QuestionID,900002);
    assert.notEqual(rows[0].ID,rows[0].QuestionID);
    assert.equal(rows[0].QuestionPage,11);
    assert.equal(rows[0].QuestionSort,2);
    assert.deepEqual(await lastQuestion(app,auth,44),[]);
    assert.deepEqual(sources.calls,[]);
  } finally {await app.close();}
});

test('legacy projected question identifiers take priority over record and business identifiers',async()=>{
  const app=await startHttpApp(offlineSources());
  try {
    const admin=await app.setup(),auth=await learner(app,admin,'position.projection');
    await addRecord(app,auth,{BookID:42,qID:'900001',QuestionID:900002,BusType:bookViewType,BusID:900003,questionPage:'12',questionID:'4'});
    let rows=await lastQuestion(app,auth,42);
    assert.equal(rows[0].QuestionID,900001);
    assert.equal(rows[0].QuestionPage,'12');
    assert.equal(rows[0].QuestionSort,'4');
    await addRecord(app,auth,{BookID:42,QuestionID:'900004',BusType:bookViewType,BusID:900005});
    rows=await lastQuestion(app,auth,42);
    assert.equal(rows.length,1);
    assert.equal(rows[0].QuestionID,900004);
  } finally {await app.close();}
});

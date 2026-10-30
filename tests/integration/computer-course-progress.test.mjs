import test from 'node:test';
import assert from 'node:assert/strict';
import { startHttpApp, testLearner } from '../support/http-app.mjs';

const lessonPath='/api/exam/wx/lesson/lessonList';
const savePath='/api/exam/wx/lessonHistory/add/';
const sourceLesson={id:'lesson-1',lessonName:'共享课时',mediaId:'media-1',duration:100,watchHistoryTime:'90.0',progress:'90%',historyModifyDate:123,lessonBulletComments:[{bulletComments:'来源弹幕'}]};
const progress=(extra={})=>({courseId:'course-1',lessonId:'lesson-1',watchHistoryTime:24.5,progress:'25%',time:10,historyModifyDate:Date.now(),...extra});
async function setup() {
  const calls=[];
  const app=await startHttpApp({
    yybRequest:async()=>[{id:'7',status:'alive'}],
    loginPlatform:async()=>({connected:true,token:'source-token',user:{userId:'source-user'}}),
    computerRequest:async(path,input)=>{
      calls.push({path,input});
      assert.equal(input.method,'GET','no learning writes reach the shared source');
      return {code:200,data:{list:[structuredClone(sourceLesson)],total:1,pages:1}};
    },
  });
  const admin=await app.setup();
  for(const name of ['course.first','course.second'])await app.createUser(admin,testLearner(name,'7'));
  const first=await app.login('learning','course.first','learner-password-123');
  const second=await app.login('learning','course.second','learner-password-123');
  const enabled=await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{enabled:true,revision:0}});
  assert.equal(enabled.status,200);
  const read=async(auth,courseId='course-1')=>{
    const response=await app.request('/api/learning/platform/computer',{auth,body:{path:lessonPath,query:{courseId}}});
    assert.equal(response.status,200);
    return (await response.json()).data.list[0];
  };
  const save=(auth,data)=>app.request('/api/learning/platform/computer',{auth,body:{path:savePath,method:'POST',data}});
  return {app,admin,first,second,calls,read,save};
}

test('course progress saves locally, resumes per Web user and stays out of shared resources',async()=>{
  const {app,first,second,calls,read,save}=await setup();
  try {
    const untouched=await read(first);
    assert.equal(untouched.watchHistoryTime,0);
    assert.equal(untouched.progress,'0%');
    assert.equal(untouched.historyModifyDate,null);
    assert.equal(untouched.duration,100);
    assert.equal(untouched.lessonBulletComments,undefined);
    const saved=await save(first,progress({userId:second.userId}));
    assert.equal(saved.status,200);
    assert.equal((await saved.json()).storage,'web');
    const resumed=await read(first);
    assert.equal(resumed.watchHistoryTime,24.5);
    assert.equal(resumed.progress,'25%');
    assert.equal((await read(second)).watchHistoryTime,0);
    assert.equal(calls.length,1,'both learners reuse the same public lesson directory');
    assert.equal((await read(first,'course-2')).watchHistoryTime,0,'course IDs isolate matching lesson IDs');
    const login=await app.login('learning','course.first','learner-password-123');
    assert.equal((await read(login)).watchHistoryTime,24.5,'a fresh login restores the saved Web progress');
    const back=await save(first,progress({watchHistoryTime:5,progress:'5%'}));
    assert.equal(back.status,200);
    assert.equal((await read(first)).watchHistoryTime,5,'backward seeking can update the resume point');
    const resources=(await app.app.locals.resourceStore.list({platform:'computer',scope:'public'})).resources;
    for(const resource of resources) {
      const detail=await app.app.locals.resourceStore.detail({platform:resource.platform,sourceId:resource.sourceId,key:resource.key});
      const lesson=detail.response.data.list[0];
      for(const field of ['watchHistoryTime','progress','historyModifyDate','lessonBulletComments'])assert.equal(lesson[field],undefined,`${field} must not be cached as shared content`);
    }
    const records=await app.app.locals.privatePlatform.list(first.userId,'computer','lesson-history');
    assert.equal(records.length,1);
    assert.equal(records[0].userId,undefined,'client-supplied source identities are never stored');
  } finally {await app.close();}
});

test('invalid progress and removed danmaku fail before contacting the shared YYB account',async()=>{
  const {app,first,calls,save}=await setup();
  try {
    for(const extra of [{courseId:''},{lessonId:null},{watchHistoryTime:-1},{watchHistoryTime:'5'},{time:-1},{historyModifyDate:null},{progress:'101%'},{progress:'bad'}]) {
      const response=await save(first,progress(extra));
      assert.equal(response.status,400,JSON.stringify(extra));
    }
    const removed=await app.request('/api/learning/platform/computer',{auth:first,body:{path:'/api/exam/wx/bulletComment/add/',method:'POST',data:{lessonId:'lesson-1',bulletComments:'removed',releaseTime:1}}});
    assert.equal(removed.status,403);
    assert.equal(calls.length,0);
    assert.equal((await app.app.locals.privatePlatform.list(first.userId,'computer','lesson-history')).length,0);
    assert.equal((await save(first,progress())).status,200,'saving progress works before acquiring any YYB source');
    assert.equal(calls.length,0);
  } finally {await app.close();}
});

test('a previously saved source lesson never supplies another account’s progress or danmaku',async()=>{
  const {app,first,second,read,calls}=await setup();
  try {
    await read(first);
    await app.app.locals.database.query(`UPDATE ${app.app.locals.database.upstream('resources')} SET response=$1::jsonb WHERE platform='computer'`,[JSON.stringify({code:200,data:{list:[sourceLesson],total:1,pages:1}})]);
    const clean=await read(second);
    assert.equal(clean.watchHistoryTime,0);
    assert.equal(clean.progress,'0%');
    assert.equal(clean.historyModifyDate,null);
    assert.equal(clean.lessonBulletComments,undefined);
    assert.equal(clean.duration,100);
    assert.equal(calls.length,1,'reading an older cache needs no new source authentication');
  } finally {await app.close();}
});

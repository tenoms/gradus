import test from 'node:test';
import assert from 'node:assert/strict';
import {startHttpApp,testLearner} from '../support/http-app.mjs';

const input=number=>({path:'/api/exam/wx/practice/exerciseList',query:{majorId:'membership-major',chapterId:'membership-chapter',examGroupId:'membership-group',examExerciseType:1,examType:3,examCategory:1,number}});
async function value(response){const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;}
const read=(app,auth,number)=>app.request('/api/learning/platform/computer',{auth,body:input(number)}).then(value);

for(const original of ['numbered','whole-paper'])test(`new membership with a missing body cannot fall back to an older exact ${original} snapshot`,async()=>{
  let changed=false,offline=false;
  const calls=[];
  const app=await startHttpApp({
    yybRequest:async()=>[{id:'7',status:'alive'}],
    loginPlatform:async()=>({connected:true,token:'membership-token',user:{userId:'membership-source'}}),
    computerRequest:async(path,request)=>{
      if(path.endsWith('/group'))return {code:200,data:true};
      calls.push({path,number:Number(request.query.number||0)});
      if(offline)throw new Error('source unavailable');
      const ids=changed?['q1','q3']:['q1','q2'],number=Number(request.query.number||0),selected=number?[ids[number-1]]:ids;
      return {code:200,data:{examId:'membership-paper',exerciseTotalNumber:ids.length,examExerciseIdList:ids,exercises:selected.map(id=>({exerciseId:id,exerciseType:1,exerciseStems:`${id}完整正文${changed?'新':'旧'}`,exerciseAnswer:'A'}))}};
    },
  });
  try{
    const admin=await app.setup();
    for(const username of ['membership.first','membership.second'])await app.createUser(admin,testLearner(username,'7'));
    const first=await app.login('learning','membership.first','learner-password-123'),second=await app.login('learning','membership.second','learner-password-123');
    await value(await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:0,enabled:true}}));
    if(original==='numbered'){await read(app,first,1);assert.equal((await read(app,first,2)).data.exercises[0].exerciseId,'q2');}
    else assert.deepEqual((await read(app,first,0)).data.examExerciseIdList,['q1','q2']);
    const page=await value(await app.request('/api/admin/resources?platform=computer&scope=public',{auth:admin}));
    let prior;
    for(const resource of page.resources){
      const path=`/api/admin/resources/${resource.platform}/${resource.sourceId}/${resource.key}`;
      const detail=await value(await app.request(path,{auth:admin}));
      if(Number(detail.request.query.number)===(original==='numbered'?1:0)){prior={path,revision:detail.revision};break;}
    }
    assert.ok(prior,'the original request response remains a real exact snapshot');
    await value(await app.request(`${prior.path}/invalidate`,{auth:admin,body:{revision:prior.revision}}));
    changed=true;
    assert.equal((await read(app,first,1)).data.exercises[0].exerciseId,'q1');
    await app.app.locals.resourceSync.waitForIdle();
    offline=true;const before=calls.length;
    const known=await read(app,second,1);assert.deepEqual(known.data.examExerciseIdList,['q1','q3']);assert.equal(known.data.exercises[0].exerciseStems,'q1完整正文新');assert.equal(calls.length,before);
    const missing=await app.request('/api/learning/platform/computer',{auth:second,body:input(original==='numbered'?2:0)});
    assert.ok([502,503].includes(missing.status),'a missing current member needs its source instead of returning the obsolete q2');
    assert.ok(calls.length>before,'the source is consulted for the actually missing current group body');
    const settings=(await value(await app.request('/api/admin/resource-sync',{auth:admin}))).settings;
    await value(await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:settings.revision,enabled:false}}));
    const beforeDisabled=calls.length;
    const missingWhileDisabled=await app.request('/api/learning/platform/computer',{auth:first,body:input(original==='numbered'?2:0)});
    assert.ok([502,503].includes(missingWhileDisabled.status),'disabled synchronization cannot resurrect q2 from this learner’s old owned practice');
    assert.ok(calls.length>beforeDisabled,'a missing current member still needs a source while saving is disabled');
  }finally{await app.close();}
});

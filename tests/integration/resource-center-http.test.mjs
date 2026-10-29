import test from 'node:test';
import assert from 'node:assert/strict';
import {startHttpApp,testLearner} from '../support/http-app.mjs';
import {resourceIdentity,inferResourceRequest} from '../../server/modules/resources/catalog.mjs';

const selector=({platform,sourceId,key,revision})=>({platform,sourceId,key,revision});
const resourcePath=item=>`/api/admin/resources/${item.platform}/${item.sourceId}/${item.key}`;
async function json(app,path,{status=200,...options}={}){
  const response=await app.request(path,options),value=await response.json();
  assert.equal(response.status,status,JSON.stringify(value));return value;
}

test('resource batch HTTP enforces admin identity, audits committed actions and preserves personal learning data',async()=>{
  let upstreamCalls=0;
  const app=await startHttpApp({yybRequest:async()=>{upstreamCalls++;return [];},mathRequest:async()=>{upstreamCalls++;return {data:[]};}});
  try{
    const admin=await app.setup();
    await app.createUser(admin,testLearner('resources.owner',''));
    const learner=await app.login('learning','resources.owner','learner-password-123');
    const store=app.app.locals.resourceStore,config=app.app.locals.configuration.snapshot(),rows=[];
    for(const id of [41,42]){
      const identity=resourceIdentity('math',{user:{id:learner.userId},account:{ref:'source'}},config,{path:'/api/question_list/GetQuestionByQuestionNew',method:'GET',query:{ID:id},data:{}});
      rows.push(await store.save(identity.source,inferResourceRequest('math',identity.request),{data:[{QuestionID:id,QuestionTitle:`缓存题目 ${id}`,file:`https://media.example/${id}.pdf`}]}));
    }
    const now=new Date().toISOString();
    const study={tasks:[{id:'own-task',title:'极限复习',platform:'math',date:now.slice(0,10),done:false,createdAt:now}],activities:[{id:'own-time',platform:'math',type:'study-time',at:now,title:'阅读题目',durationSeconds:300,studyMode:'reading'}],goalMinutes:60};
    await json(app,'/api/learning/study/data',{auth:learner,method:'PUT',body:{data:study,revision:0}});
    await json(app,'/api/learning/platform/math/books/7/position',{auth:learner,method:'PUT',body:{QuestionID:41,QuestionPage:1}});
    const beforeStudy=await json(app,'/api/learning/study/data',{auth:learner});
    const beforePosition=await json(app,'/api/learning/platform/math/books/7/position',{auth:learner});
    const body={action:'invalidate',resources:rows.map(selector)};
    await json(app,'/api/admin/resources/batch',{status:401,body});
    await json(app,'/api/admin/resources/batch',{status:401,auth:learner,body});
    await json(app,'/api/admin/resources/batch',{status:403,auth:admin,headers:{'X-Study-User':learner.userId},body});
    for(const invalid of [null,{}, {...body,action:'refresh'}, {...body,resources:[]}, {...body,resources:Array.from({length:101},()=>selector(rows[0]))}, {...body,resources:[selector(rows[0]),selector(rows[0])]}, {...body,resources:[{...selector(rows[0]),revision:'1'}]}]){
      await json(app,'/api/admin/resources/batch',{status:400,auth:admin,body:invalid});
    }
    await json(app,'/api/admin/resources/batch',{status:400,auth:admin,body:'{invalid JSON'});
    assert.equal((await json(app,'/api/admin/audit?action=resource.invalidated',{auth:admin})).pagination.total,0);
    assert.deepEqual(await json(app,'/api/admin/resources/batch',{auth:admin,body}),{ok:true,count:2,action:'invalidate'});
    let current=await Promise.all(rows.map(row=>json(app,resourcePath(row),{auth:admin})));
    assert.ok(current.every(row=>row.expired&&row.revision===2));
    assert.equal(current[0].media.length,1);assert.equal(current[0].entities[0].kind,'question');
    const invalidationAudit=await json(app,'/api/admin/audit?action=resource.invalidated',{auth:admin});
    assert.equal(invalidationAudit.pagination.total,1);assert.equal(invalidationAudit.entries[0].targetName,'2 份资源');assert.match(invalidationAudit.entries[0].detail,/批量标记/);
    const updated=await json(app,resourcePath(current[1]),{auth:admin,method:'PATCH',body:{revision:current[1].revision,response:{data:[{QuestionID:42,QuestionTitle:'已更新题干'}]}}});
    await json(app,'/api/admin/resources/batch',{status:409,auth:admin,body:{action:'delete',resources:current.map(selector)}});
    assert.equal((await json(app,resourcePath(current[0]),{auth:admin})).revision,current[0].revision,'the first delete rolls back when a later version is stale');
    await json(app,'/api/admin/resources/batch',{status:404,auth:admin,body:{action:'delete',resources:[selector(current[0]),{...selector(updated),key:'f'.repeat(64)}]}});
    assert.equal((await json(app,resourcePath(current[0]),{auth:admin})).revision,current[0].revision,'the first delete rolls back when a later resource is missing');
    assert.equal((await json(app,'/api/admin/audit?action=resource.deleted',{auth:admin})).pagination.total,0,'rejected batches do not create success audit records');
    current=[current[0],updated];
    assert.deepEqual(await json(app,'/api/admin/resources/batch',{auth:admin,body:{action:'delete',resources:current.map(selector)}}),{ok:true,count:2,action:'delete'});
    const after=await json(app,'/api/admin/resources',{auth:admin});assert.equal(after.pagination.total,0);assert.equal(after.summary.mediaReferences,0);
    const deletionAudit=await json(app,'/api/admin/audit?action=resource.deleted',{auth:admin});
    assert.equal(deletionAudit.pagination.total,1);assert.equal(deletionAudit.entries[0].targetName,'2 份资源');assert.match(deletionAudit.entries[0].detail,/保留个人学习记录/);
    assert.deepEqual(await json(app,'/api/learning/study/data',{auth:learner}),beforeStudy);
    assert.deepEqual(await json(app,'/api/learning/platform/math/books/7/position',{auth:learner}),beforePosition);
    assert.equal(upstreamCalls,0,'management never launches source requests');
  }finally{await app.close();}
});

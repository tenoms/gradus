import test from 'node:test';
import assert from 'node:assert/strict';
import { startHttpApp,testLearner } from './http-app.mjs';

test('learning sync management is administrator-only, revisioned and cannot launch crawling',async()=>{
  let directoryReads=0,logins=0,resourceReads=0;
  const app=await startHttpApp({yybRequest:async()=>{directoryReads++;return [{id:'source',nickname:'系统来源',status:'alive'}];},loginPlatform:async()=>{logins++;return {connected:true,token:'private-token',stuId:'source-student',user:{StuID:'source-student'}};},mathRequest:async()=>{resourceReads++;return {data:[]};},computerRequest:async()=>{resourceReads++;return {code:200,data:[]};}});
  try {
    const admin=await app.setup();
    await app.createUser(admin,testLearner('data.learner','source'));
    const learner=await app.login('learning','data.learner','learner-password-123');
    for(const route of ['/api/admin/resource-sync','/api/admin/resources?page=1&pageSize=5','/api/admin/account-pool']) {
      assert.equal((await app.request(route,{auth:learner})).status,401);
      assert.equal((await app.request(route,{auth:admin,headers:{'X-Study-User':learner.userId}})).status,403);
    }
    const initial=await (await app.request('/api/admin/resource-sync',{auth:admin})).json();
    assert.equal(initial.settings.enabled,false);assert.deepEqual(initial.sources,[]);assert.equal(initial.mode,'learning');
    const changes={revision:initial.settings.revision,enabled:true};
    const response=await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:changes});
    assert.equal(response.status,200);
    const enabled=await response.json();assert.equal(enabled.settings.enabled,true);
    assert.equal(directoryReads,0);assert.equal(logins,0);assert.equal(resourceReads,0);
    assert.equal((await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:changes})).status,409);
    for(const invalid of [{...changes,revision:enabled.settings.revision,enabled:'false'},{...changes,revision:enabled.settings.revision,batchSize:2},{...changes,revision:enabled.settings.revision,intervalMs:1000}])assert.equal((await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:invalid})).status,400);
    for(const action of ['enqueue','run','retry'])assert.equal((await app.request(`/api/admin/resource-sync/${action}`,{auth:admin,body:{}})).status,404);
    assert.equal((await app.request('/api/learning/auth/session',{auth:learner})).status,200);
    const afterLogin={directoryReads,logins,resourceReads};
    assert.deepEqual(afterLogin,{directoryReads:0,logins:0,resourceReads:0},'Web login and enabling synchronization do not contact a source');
    await new Promise(resolve=>setTimeout(resolve,30));
    await app.request('/api/admin/resource-sync',{auth:admin});
    assert.deepEqual({directoryReads,logins,resourceReads},afterLogin,'idle app and status reads make no upstream calls');
    assert.equal((await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:enabled.settings.revision,enabled:false}})).status,200);
    const page=await app.request('/api/admin/resources?page=1&pageSize=5',{auth:admin});assert.equal(page.status,200);assert.equal((await page.json()).pagination.pageSize,5);
    assert.equal((await app.request('/api/admin/resources?page=abc',{auth:admin})).status,400);
  } finally {await app.close();}
});

test('resource detail and lifecycle mutations require the administrator principal and preserve CAS',async()=>{
  const app=await startHttpApp();
  try {
    const admin=await app.setup();
    await app.createUser(admin,testLearner('resource.reader',''));
    const learner=await app.login('learning','resource.reader','learner-password-123');
    const {resourceIdentity,inferResourceRequest}=await import('../server/resource-catalog.mjs');
    const identity=resourceIdentity('math',{user:{id:learner.userId},account:{ref:'source'}},app.app.locals.configuration.snapshot(),{path:'/api/question_list/GetQuestionByQuestionNew',method:'GET',data:{},query:{ID:42}});
    const saved=await app.app.locals.resourceStore.save(identity.source,inferResourceRequest('math',identity.request),{data:[{QuestionID:42,QuestionTitle:'管理权限验收'}]});
    const path=`/api/admin/resources/${saved.platform}/${saved.sourceId}/${saved.key}`;
    for(const [method,suffix,body]of [['GET','',undefined],['PATCH','',{revision:1,response:{data:[]}}],['POST','/invalidate',{revision:1}],['DELETE','',{revision:1}]]) {
      assert.equal((await app.request(path+suffix,{auth:learner,method,body})).status,401);
      assert.equal((await app.request(path+suffix,{auth:admin,method,body,headers:{'X-Study-User':learner.userId}})).status,403);
    }
    assert.equal((await app.request(path,{auth:admin})).status,200);
    assert.equal((await app.request(path,{auth:admin,method:'PATCH',body:{revision:1,response:'invalid-body'}})).status,400);
    assert.equal((await app.request(path,{auth:admin,method:'PATCH',body:{revision:0,response:{data:[]}}})).status,400);
    assert.equal((await app.request(path+'/invalidate',{auth:admin,body:{revision:1}})).status,200);
    assert.equal((await app.request(path,{auth:admin,method:'DELETE',body:{revision:1}})).status,409);
    assert.equal((await app.request(path,{auth:admin,method:'DELETE',body:{revision:2}})).status,200);
    assert.equal((await app.request(path,{auth:admin})).status,404);
  }finally{await app.close();}
});

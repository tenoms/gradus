import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestDatabase} from '../support/database.mjs';
import {createResourceStore} from '../../server/modules/resources/store.mjs';
import {resourceIdentity,inferResourceRequest,publicResourceResponse} from '../../server/modules/resources/catalog.mjs';
import { platformConfigFixture } from "../support/platform-config.mjs";

const config=platformConfigFixture({ yyb: { baseUrl: 'https://yyb.example' } });
const a={user:{id:'web-a'},account:{ref:'yyb-a'},yybBaseUrl:'https://yyb-a.example'};
const b={user:{id:'web-b'},account:{ref:'yyb-b'},yybBaseUrl:'https://yyb-b.example'};
const question={path:'/api/question_list/GetQuestionByQuestionNew',method:'GET',query:{ID:42,StuID:'student-a',t:1},data:{}};
const body={SuccessResponse:true,data:[{QuestionID:42,QuestionTitle:'第一题',MyAnswer:'private-answer',StuID:'student-a',phone:'private-phone',_c_course_users_record:{MyAnswer:'B'},image:'https://media.example/q.png'}]};

test('public namespaces and actor-normalized requests are shared across YYB accounts while personal and tenant identities remain separate',()=>{
  const one=resourceIdentity('math',a,config,question),two=resourceIdentity('math',b,config,{...question,query:{ID:'42',StuID:'student-b',t:2}});
  assert.equal(one.scope,'public');assert.equal(one.source.id,two.source.id);assert.deepEqual(one.request,two.request);
  assert.deepEqual(one.request,resourceIdentity('math',b,config,{...question,query:{},data:{ID:'42',StuID:'student-b',t:2}}).request,'GET data and query fields encode the same upstream URL');
  assert.equal(one.source.accountRef,'');assert.equal(one.request.query.StuID,undefined);
  assert.notEqual(one.source.id,resourceIdentity('math',b,{...config,math:{...config.math,stationId:2}},question).source.id);
  const personal={path:'/api/Master/AutoModel',method:'POST',query:{},data:{command:'GetUserInfoByStuID',data:JSON.stringify({StuID:'source'})}};
  assert.equal(resourceIdentity('math',a,config,personal).scope,'account');
  assert.notEqual(resourceIdentity('math',a,config,personal).source.id,resourceIdentity('math',{...a,user:b.user},config,personal).source.id);
  assert.equal(resourceIdentity('computer',a,config,{path:'/api/exam/wx/course/get_play_info/v2',query:{mediaId:'media'}}).scope,'volatile');
  assert.equal(resourceIdentity('computer',a,config,{path:'/api/exam/wx/practice/random/exercise',query:{}}).scope,'volatile');
});

test('public payload sanitization keeps question content and correct answers but removes source credentials, identity and personal state',()=>{
  const clean=publicResourceResponse({...body,token:'private-token'});
  assert.equal(clean.data[0].QuestionTitle,'第一题');assert.equal(clean.data[0].QuestionID,42);
  assert.equal(JSON.stringify(clean).includes('private-'),false);
  assert.equal(clean.data[0]._c_course_users_record,undefined);
});

test('persisted day-based review settings rebase public review dates and preserve explicit review markers',async()=>{
  const database=await createTestDatabase();
  try{
    const store=await createResourceStore(database,{publicRefreshAfterDays:45});
    assert.equal((await store.status()).settings.refreshAfterDays,45);
    const save=(id,options)=>{
      const identity=resourceIdentity('math',a,config,{...question,query:{ID:id}});
      return store.save(identity.source,{...inferResourceRequest('math',identity.request),scope:'public'},{data:[{QuestionID:id,QuestionTitle:`题目${id}`}]},options);
    };
    const selector=({sourceId,platform,key,revision})=>({sourceId,platform,key,revision});
    const ordinary=await save(42),marked=await save(43),withoutDate=await save(44,{expiresAt:null});
    const started=Date.now();
    assert.ok(Date.parse(ordinary.expiresAt)>=Date.parse(ordinary.syncedAt)+45*86_400_000-1000);
    await database.query(`UPDATE ${database.upstream('resources')} SET synced_at=now()-interval '5 day' WHERE request_key=$1`,[marked.key]);
    const invalidated=await store.invalidate(selector(marked));
    assert.ok(Date.parse(invalidated.expiresAt)<=Date.parse(invalidated.syncedAt),'an explicit marker remains distinguishable on older content');
    const changed=await store.updateSettings({revision:0,enabled:true,refreshAfterDays:7});
    assert.equal(changed.refreshAfterDays,7);assert.equal(changed.revision,1);
    const rebased=await store.detail(selector(ordinary));
    assert.equal(Date.parse(rebased.expiresAt)-Date.parse(rebased.syncedAt),7*86_400_000);
    assert.equal((await store.detail(selector(invalidated))).expiresAt,invalidated.expiresAt);
    assert.equal((await store.detail(selector(withoutDate))).expiresAt,null);
    assert.equal((await store.updateSettings({revision:1,enabled:false})).refreshAfterDays,7,'omitting days retains the configured cycle');
    const reopened=await createResourceStore(database,{publicRefreshAfterDays:2});
    assert.equal((await reopened.getSettings()).refreshAfterDays,7,'startup defaults do not replace a persisted setting');
    const saved=await save(45);
    assert.ok(Date.parse(saved.expiresAt)>=started+7*86_400_000);
    const edited=await store.update({...selector(saved),response:{data:[{QuestionID:45,QuestionTitle:'已修订'}]}});
    assert.ok(Date.parse(edited.expiresAt)>=started+7*86_400_000);
    for(const refreshAfterDays of [0,3651,1.5,'7',null])await assert.rejects(()=>store.updateSettings({revision:2,enabled:true,refreshAfterDays}),{status:400});
    await assert.rejects(()=>store.updateSettings({revision:0,enabled:true,refreshAfterDays:1}),{status:409});
    assert.equal((await store.getSettings()).refreshAfterDays,7);
    assert.equal((await store.detail(selector(ordinary))).expiresAt,rebased.expiresAt,'a rejected settings write leaves resource dates intact');
    assert.equal((await store.updateSettings({revision:2,enabled:true,refreshAfterDays:1})).refreshAfterDays,1);
    assert.equal((await store.updateSettings({revision:3,enabled:true,refreshAfterDays:3650})).refreshAfterDays,3650);
  }finally{await database.close();}
});

test('public entity reads keep saved content usable while account and volatile sources require explicit inspection',async()=>{
  const database=await createTestDatabase();
  try{
    const store=await createResourceStore(database),identity=resourceIdentity('math',a,config,question);
    const observation={...inferResourceRequest('math',identity.request),scope:'public'};
    await store.save(identity.source,observation,body,{expiresAt:'2000-01-01T00:00:00Z'});
    assert.equal((await store.findEntities({sourceId:identity.source.id,platform:'math'})).length,1);
    await store.save(identity.source,observation,body,{expiresAt:null});
    assert.equal((await store.findEntities({sourceId:identity.source.id,platform:'math'})).length,1,'a missing review date does not hide saved public content');
    const privateResources=[];
    for(const scope of ['account','volatile']){
      const source={id:`${scope}-source`,platform:'math',accountRef:'account-a',scope};
      privateResources.push(await store.save(source,{...observation,scope},body,{expiresAt:'2100-01-01T00:00:00Z'}));
      assert.equal((await store.findEntities({sourceId:source.id,platform:'math'})).length,0,`${scope} entities do not become shared content`);
      assert.equal((await store.findEntities({sourceId:source.id,platform:'math',includeExpired:true})).length,1,'legacy inspection remains scoped to the explicitly chosen source');
    }
    await store.updateSettings({revision:0,enabled:true,refreshAfterDays:1});
    for(const saved of privateResources)assert.equal((await store.detail({sourceId:saved.sourceId,platform:saved.platform,key:saved.key})).expiresAt,saved.expiresAt,'public review settings leave private resource dates alone');
    assert.equal((await store.findEntities({sourceId:'another-account',platform:'math',includeExpired:true})).length,0);
  }finally{await database.close();}
});

test('resource management queries, CAS editing, invalidation and deletion operate on shared PostgreSQL content without touching Web records',async()=>{
  const database=await createTestDatabase();
  try{
    const store=await createResourceStore(database),identity=resourceIdentity('math',a,config,question),observation={...inferResourceRequest('math',identity.request),scope:identity.scope};
    const saved=await store.save(identity.source,observation,body);
    assert.equal(saved.scope,'public');assert.equal(saved.expired,false);assert.ok(saved.expiresAt);
    const selector={sourceId:saved.sourceId,platform:saved.platform,key:saved.key};
    const detail=await store.detail(selector);assert.equal(detail.response.data[0].MyAnswer,undefined);assert.equal(detail.path,question.path);
    const same=resourceIdentity('math',b,config,{...question,query:{ID:42,StuID:'student-b'}});
    assert.equal((await store.lookup(same.source.id,'math',same.request)).response.data[0].QuestionTitle,'第一题');
    assert.equal((await store.list({q:'第一题',scope:'public',platform:'math'})).pagination.total,1);
    assert.equal((await store.list({q:'不存在'})).pagination.total,0);
    const edited=await store.update({...selector,revision:saved.revision,response:{SuccessResponse:true,data:[{QuestionID:42,QuestionTitle:'管理员修订',MyAnswer:'private-injected'}]}});
    assert.equal(edited.revision,saved.revision+1);assert.equal(edited.response.data[0].QuestionTitle,'管理员修订');assert.equal(edited.response.data[0].MyAnswer,undefined);
    await assert.rejects(()=>store.update({...selector,revision:saved.revision,response:body}),{status:409});
    const expired=await store.invalidate({...selector,revision:edited.revision});assert.equal(expired.expired,true);assert.equal(expired.revision,edited.revision+1);
    assert.equal((await store.lookup(identity.source.id,'math',identity.request)).expired,true);
    assert.equal((await store.findEntities({sourceId:identity.source.id,platform:'math'})).length,1,'public content remains available to personal records after its review date');
    assert.equal((await store.findEntities({sourceId:identity.source.id,platform:'math',includeExpired:true})).length,1);
    const refreshed=await store.save(identity.source,observation,{SuccessResponse:true,data:[{QuestionID:42,QuestionTitle:'上游更新'}]});assert.equal(refreshed.expired,false);assert.ok(refreshed.revision>expired.revision);
    await assert.rejects(()=>store.remove({...selector,revision:expired.revision}),{status:409});
    assert.deepEqual(await store.remove({...selector,revision:refreshed.revision}),{ok:true});
    assert.equal(await store.lookup(identity.source.id,'math',identity.request),null);
    assert.equal((await store.findEntities({sourceId:identity.source.id,platform:'math'})).length,0);
    await assert.rejects(()=>store.detail(selector),{status:404});
    assert.equal((await store.status()).resources.total,0);
  }finally{await database.close();}
});

test('resource catalog filters and sorts the complete selection with global facets and derived detail indexes',async()=>{
  const database=await createTestDatabase();
  try{
    const store=await createResourceStore(database),math={id:'math-source',platform:'math',accountRef:'',scope:'public'},computer={id:'computer-source',platform:'computer',accountRef:'account-c'};
    const save=(source,id,title,kind,expiresAt)=>store.save(source,{kind,scope:source.scope||'account',request:{path:'/api/question_list/GetQuestionByQuestionNew',method:'GET',query:{ID:id},data:{}},context:{BookID:42,CatalogID:7}},{data:[{QuestionID:id,QuestionTitle:title,Image:`https://media.example/${id}.png`}]},{expiresAt});
    const alpha=await save(math,1,'Alpha','math.question','2100-01-01T00:00:00Z');
    const beta=await save(math,2,'Beta','math.catalog','2000-01-01T00:00:00Z');
    const gamma=await save(computer,3,'Gamma','computer.question',null);
    const selector=resource=>({platform:resource.platform,sourceId:resource.sourceId,key:resource.key});
    await database.query(`UPDATE ${database.upstream('resources')} SET synced_at=CASE title WHEN 'Alpha' THEN '2025-01-01'::timestamptz WHEN 'Beta' THEN '2025-02-01'::timestamptz ELSE '2025-03-01'::timestamptz END,changed_at=CASE title WHEN 'Alpha' THEN '2025-03-01'::timestamptz WHEN 'Beta' THEN '2025-02-01'::timestamptz ELSE '2025-01-01'::timestamptz END`);
    const all=await store.list({pageSize:1});
    assert.deepEqual(all.summary,{total:3,fresh:1,expired:2,mediaReferences:3});
    assert.equal(all.pagination.total,3);assert.equal(all.resources.length,1);
    assert.equal(all.resources[0].mediaCount,1);assert.equal(all.resources[0].entityCount,1);
    assert.deepEqual(all.facets.kinds.map(({value,count})=>({value,count})),[{value:'computer.question',count:1},{value:'math.catalog',count:1},{value:'math.question',count:1}]);
    assert.deepEqual(all.facets.sources.map(({id,platform,accountRef,count})=>({id,platform,accountRef,count})),[{id:'computer-source',platform:'computer',accountRef:'account-c',count:1},{id:'math-source',platform:'math',accountRef:'',count:2}]);
    const fresh=await store.list({validity:'fresh'});
    assert.deepEqual(fresh.resources.map(row=>row.title),['Alpha']);
    assert.deepEqual(fresh.summary,{total:1,fresh:1,expired:0,mediaReferences:1});
    assert.equal(fresh.facets.sources.length,2,'filter options remain available outside the current selection');
    const filtered=await store.list({platform:'math',sourceId:math.id,scope:'public',validity:'expired',kind:'math.catalog',q:'Beta'});
    assert.deepEqual(filtered.resources.map(row=>row.title),['Beta']);
    assert.deepEqual(filtered.summary,{total:1,fresh:0,expired:1,mediaReferences:1});
    assert.deepEqual((await store.list({q:'missing'})).summary,{total:0,fresh:0,expired:0,mediaReferences:0});
    for(const [sort,expected] of [['synced-desc',['Gamma','Beta','Alpha']],['synced-asc',['Alpha','Beta','Gamma']],['changed-desc',['Alpha','Beta','Gamma']],['title-asc',['Alpha','Beta','Gamma']],['expires-asc',['Gamma','Beta','Alpha']]])assert.deepEqual((await store.list({sort})).resources.map(row=>row.title),expected,sort);
    assert.equal((await store.list({q:alpha.key})).resources[0].key,alpha.key);
    const detail=await store.detail(selector(alpha));
    assert.deepEqual(detail.context,{BookID:42,CatalogID:7});
    assert.equal(detail.source.id,math.id);assert.equal(detail.source.accountRef,'');
    assert.deepEqual(detail.entities,[{kind:'question',count:1}]);
    assert.equal(detail.media[0].url,'https://media.example/1.png');assert.ok(detail.media[0].observedAt);
    assert.equal(detail.entityCount,1);assert.equal(detail.mediaCount,1);
    for(const query of [{validity:'unknown'},{sort:'title; DELETE'},{sourceId:['math-source']},{sourceId:'s'.repeat(161)},{kind:['math.question']},{platform:['math']},{scope:['public']},{q:1},{page:0},{pageSize:101}])await assert.rejects(()=>store.list(query),{status:400});
    assert.equal(beta.platform,'math');assert.equal(gamma.platform,'computer');
  }finally{await database.close();}
});

test('resource batch operations apply every selected revision together and roll back on conflicts or missing resources',async()=>{
  const database=await createTestDatabase();
  try{
    const store=await createResourceStore(database),source={id:'batch-source',platform:'math',accountRef:'',scope:'public'};
    const save=id=>store.save(source,{kind:'math.question',scope:'public',request:{path:'/api/question_list/GetQuestionByQuestionNew',query:{ID:id},data:{}},context:{}},{data:[{QuestionID:id,QuestionTitle:`题目${id}`,Image:`https://media.example/${id}.png`}]});
    const one=await save(1),two=await save(2),selected=[one,two].map(({sourceId,platform,key,revision})=>({sourceId,platform,key,revision}));
    await assert.rejects(()=>store.batch({action:'invalidate',resources:[selected[0],{...selected[1],revision:2}]}),{status:409});
    assert.equal((await store.detail(selected[0])).revision,1);assert.equal((await store.detail(selected[0])).expired,false);
    await assert.rejects(()=>store.batch({action:'delete',resources:[selected[0],{...selected[1],key:'0'.repeat(64)}]}),{status:404});
    assert.equal((await store.list()).pagination.total,2,'first deletion is rolled back when a later resource is missing');
    assert.deepEqual(await store.batch({action:'invalidate',resources:selected}),{ok:true,count:2,action:'invalidate'});
    const expired=await store.list({validity:'expired'});assert.equal(expired.pagination.total,2);assert.ok(expired.resources.every(row=>row.revision===2));
    assert.deepEqual(await store.batch({action:'delete',resources:expired.resources.map(({sourceId,platform,key,revision})=>({sourceId,platform,key,revision}))}),{ok:true,count:2,action:'delete'});
    assert.deepEqual((await store.list()).summary,{total:0,fresh:0,expired:0,mediaReferences:0});
    assert.equal((await database.query(`SELECT count(*)::integer AS count FROM ${database.upstream('resource_entities')}`)).rows[0].count,0);
    for(const input of [null,{action:'other',resources:selected},{action:'delete',resources:[]},{action:'delete',resources:[selected[0],selected[0]]},{action:'delete',resources:Array(101).fill(selected[0])},{action:'delete',resources:[{...selected[0],revision:'1'}]},{action:'delete',resources:[{...selected[0],key:'invalid'}]}])await assert.rejects(()=>store.batch(input),{status:400});
  }finally{await database.close();}
});

test('account and volatile snapshots remain visit-time updates even with a future expiry',async()=>{
  const database=await createTestDatabase();
  try{
    const store=await createResourceStore(database),source={id:'private-source',platform:'computer',accountRef:'account-private'};
    const saved=[];
    for(const scope of ['public','account','volatile'])saved.push(await store.save(source,{kind:`computer.${scope}`,scope,request:{path:'/api/exam/wx/course/courseList',query:{scope},data:{}},context:{}},{data:[{id:scope,Title:scope}]},{expiresAt:'2100-01-01T00:00:00Z'}));
    assert.deepEqual(saved.map(row=>row.expired),[false,true,true]);
    assert.deepEqual((await store.list()).summary,{total:3,fresh:1,expired:2,mediaReferences:0});
    assert.deepEqual((await store.list({validity:'fresh'})).resources.map(row=>row.scope),['public']);
    assert.deepEqual((await store.list({validity:'expired',sort:'title-asc'})).resources.map(row=>row.scope),['account','volatile']);
    for(const item of saved){
      const selected={platform:item.platform,sourceId:item.sourceId,key:item.key};
      assert.equal((await store.detail(selected)).expired,item.scope!=='public');
    }
  }finally{await database.close();}
});

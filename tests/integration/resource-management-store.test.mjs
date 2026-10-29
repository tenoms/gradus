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
    assert.equal((await store.findEntities({sourceId:identity.source.id,platform:'math'})).length,0,'invalidated resources cannot leak through entity reads');
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

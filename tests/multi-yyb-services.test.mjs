import test from 'node:test';
import assert from 'node:assert/strict';
import {startHttpApp,testLearner} from './http-app.mjs';
import {readPlatformDefaults} from '../server/platform-config.mjs';

function fixture(){
  const calls=[],state={offlineDefault:false,denyDefaultLogin:false};
  return {calls,state,configurationDefaults:readPlatformDefaults({env:{YYB_BASE_URL:'https://first-yyb.example',YYB_API_KEY:'default-private-key'},readLocal:false}),
    yybRequest:async(path,data,options,override)=>{
      const endpoint=override?.baseUrl||'https://first-yyb.example';calls.push({type:'directory',endpoint,override});
      if(endpoint==='https://offline-yyb.example'||endpoint==='https://first-yyb.example'&&state.offlineDefault)throw Object.assign(new Error('offline'),{status:502});
      return endpoint==='https://first-yyb.example'?[{id:'shared-ref',openid:'wechat-a',nickname:'微信甲',status:'alive'}]:[{id:'shared-ref',openid:'wechat-b',nickname:'微信乙',status:'alive'},{id:'alternate-ref',openid:'wechat-a',nickname:'微信甲另一入口',status:'alive'}];
    },
    loginPlatform:async(name,account,override)=>{const endpoint=override?.baseUrl||'https://first-yyb.example';calls.push({type:'login',endpoint,ref:account.ref,openid:account.openid});if(state.denyDefaultLogin&&endpoint==='https://first-yyb.example')throw Object.assign(new Error('source code unavailable'),{status:502});return {connected:true,token:`test-${name}-${account.openid}`,stuId:account.openid,user:name==='math'?{StuID:account.openid}:{userId:account.openid}};},
    mathRequest:async()=>({SuccessResponse:true,data:[{QuestionID:42,QuestionTxt:'测试题目'}]}),
  };
}
const json=async(app,path,{expected=200,...options}={})=>{const response=await app.request(path,options),value=await response.json();assert.equal(response.status,expected,`${path}: ${JSON.stringify(value)}`);return value;};
async function add(app,admin,baseUrl='https://second-yyb.example'){return json(app,'/api/admin/yyb-services',{auth:admin,expected:201,body:{name:'第二 YYB',baseUrl,apiKey:'extra-private-key',enabled:true}});}

test('multiple YYB services keep secrets private and aggregate one scheduling account per openid',async()=>{
  const f=fixture(),app=await startHttpApp(f);
  try{
    const admin=await app.setup(),initial=await json(app,'/api/admin/yyb-services',{auth:admin});assert.equal(initial.services.length,1);assert.equal(f.calls.length,0);
    const saved=await add(app,admin);assert.equal(saved.services.length,2);assert.equal(f.calls.length,0,'saving transports does not read upstream');
    const pool=await json(app,'/api/admin/account-pool',{auth:admin});
    assert.equal(pool.accounts.length,2);assert.deepEqual(pool.accounts.map(account=>account.ref).sort(),['openid:wechat-a','openid:wechat-b']);
    assert.equal(pool.accounts.find(account=>account.openid==='wechat-a').routes.length,2);
    assert.equal(pool.accounts.find(account=>account.openid==='wechat-b').routes[0].rawRef,'shared-ref');
    assert.equal(JSON.stringify({saved,pool}).includes('extra-private-key'),false);assert.equal(JSON.stringify({saved,pool}).includes('default-private-key'),false);
    assert.equal(await app.app.locals.accountPool.resolve('one'),'openid:wechat-a');assert.equal(await app.app.locals.accountPool.resolve('two'),'openid:wechat-b');assert.equal(await app.app.locals.accountPool.resolve('three'),'openid:wechat-a');
    const counts=await json(app,'/api/admin/account-pool',{auth:admin});assert.equal(counts.accounts.find(account=>account.openid==='wechat-a').activeUsers,2);
    const accounts=await json(app,'/api/admin/accounts',{auth:admin});assert.equal(accounts.accounts.length,2);assert.equal(accounts.accounts[0].routes.length,2);
  }finally{await app.close();}
});

test('one unavailable YYB service does not prevent another route for the same WeChat account',async()=>{
  const f=fixture(),app=await startHttpApp(f);
  try{
    const admin=await app.setup();await add(app,admin);await app.createUser(admin,testLearner('multi.reader','openid:wechat-a'));const learner=await app.login('learning','multi.reader','learner-password-123');
    f.state.denyDefaultLogin=true;
    const response=await json(app,'/api/learning/platform/math',{auth:learner,body:{path:'/api/question_list/GetQuestionByQuestionNew',query:{ID:42}}});assert.equal(response.data[0].QuestionID,42);
    assert.deepEqual(f.calls.filter(call=>call.type==='login').map(call=>call.endpoint),['https://first-yyb.example','https://second-yyb.example']);
    f.state.offlineDefault=true;
    const pool=await json(app,'/api/admin/account-pool',{auth:admin});assert.equal(pool.accounts.length,2);assert.equal(pool.issues.length,1);assert.equal(pool.accounts.find(account=>account.openid==='wechat-a').routes.length,1);
    assert.equal(await app.app.locals.accountPool.resolve('fixed',{fixedRef:'openid:wechat-a'}),'openid:wechat-a');
    assert.equal((await json(app,'/api/learning/auth/session',{auth:learner})).authenticated,true);
  }finally{await app.close();}
});

test('YYB service CRUD is administrator-only and uses revisions with explicit credential clearing',async()=>{
  const f=fixture(),app=await startHttpApp(f);
  try{
    const admin=await app.setup();await app.createUser(admin,testLearner('multi.owner',''));const learner=await app.login('learning','multi.owner','learner-password-123');
    assert.equal((await app.request('/api/admin/yyb-services',{auth:learner})).status,401);
    const saved=await add(app,admin),source=saved.services.find(source=>source.id!=='default');
    await json(app,`/api/admin/yyb-services/${source.id}`,{auth:admin,method:'PATCH',body:{revision:source.revision,name:'修改名称'}});
    await json(app,`/api/admin/yyb-services/${source.id}`,{auth:admin,method:'PATCH',body:{revision:source.revision,name:'过期版本'},expected:409});
    const cleared=await json(app,`/api/admin/yyb-services/${source.id}`,{auth:admin,method:'PATCH',body:{revision:source.revision+1,clearApiKey:true,enabled:false}});assert.equal(cleared.services.find(item=>item.id===source.id).apiKeyConfigured,false);
    const pool=await json(app,'/api/admin/account-pool',{auth:admin});assert.equal(pool.accounts.length,1);
    const removed=await json(app,`/api/admin/yyb-services/${source.id}`,{auth:admin,method:'DELETE',body:{revision:source.revision+2}});assert.equal(removed.services.length,1);
    const bad=await app.request('/api/admin/yyb-services',{auth:admin,body:{name:'bad',baseUrl:'https://user:password@example.com',enabled:true}});assert.equal(bad.status,400);
  }finally{await app.close();}
});

test('default YYB remains a live view of legacy platform configuration until explicitly edited',async()=>{
  const f=fixture(),app=await startHttpApp(f);
  try{
    const admin=await app.setup(),before=await json(app,'/api/admin/yyb-services',{auth:admin});assert.equal(before.services[0].usesPlatformConfig,true);
    const config=await json(app,'/api/admin/configuration',{auth:admin});await json(app,'/api/admin/configuration',{auth:admin,method:'PUT',body:{revision:config.revision,config:{yyb:{baseUrl:'https://changed-default.example'}}}});
    assert.equal((await json(app,'/api/admin/yyb-services',{auth:admin})).services[0].baseUrl,'https://changed-default.example');
    const changed=await json(app,'/api/admin/yyb-services/default',{auth:admin,method:'PATCH',body:{revision:0,name:'主服务',baseUrl:'https://explicit-default.example',enabled:true}});assert.equal(changed.services[0].usesPlatformConfig,false);assert.equal(changed.services[0].apiKeyConfigured,false);
  }finally{await app.close();}
});

test('switching YYB routes for the same openid reuses a still-valid platform token',async()=>{
  const f=fixture(),app=await startHttpApp(f);
  try{
    const admin=await app.setup();await add(app,admin);await app.createUser(admin,testLearner('multi.reuse','openid:wechat-a'));const learner=await app.login('learning','multi.reuse','learner-password-123');
    const read=ID=>json(app,'/api/learning/platform/math',{auth:learner,body:{path:'/api/question_list/GetQuestionByQuestionNew',query:{ID}}});
    await read(42);assert.equal(f.calls.filter(call=>call.type==='login').length,1);
    f.state.offlineDefault=true;await read(43);
    assert.equal(f.calls.filter(call=>call.type==='login').length,1,'a route change is not a platform token expiry');
    const source=await app.app.locals.accountPool.acquireSource(learner.userId,'math');assert.equal(source.account.openid,'wechat-a');assert.equal(source.account.serviceName,'第二 YYB');assert.equal(source.expires,null);
  }finally{await app.close();}
});

test('unknown WeChat identities remain service-scoped when raw refs collide',async()=>{
  const f=fixture(),request=f.yybRequest;
  f.yybRequest=async(...args)=>(await request(...args)).map(({openid,...row})=>row);
  const app=await startHttpApp(f);
  try{
    const admin=await app.setup();const saved=await add(app,admin),source=saved.services.find(source=>source.id!=='default');
    const pool=await json(app,'/api/admin/account-pool',{auth:admin});assert.equal(pool.accounts.length,3);
    assert.ok(pool.accounts.some(account=>account.ref==='shared-ref'));assert.ok(pool.accounts.some(account=>account.ref===`${source.id}::shared-ref`));
    assert.ok(pool.accounts.every(account=>account.openid===''));
  }finally{await app.close();}
});

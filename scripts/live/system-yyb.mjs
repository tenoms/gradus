import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {createApp} from '../../server/app.mjs';
import {createDatabase} from '../../server/infrastructure/database.mjs';
import {createUpstreamClient,requestJson} from '../../server/integrations/upstream.mjs';

if(!process.env.DATABASE_URL&&existsSync('.env'))process.loadEnvFile('.env');
const database=await createDatabase({schemaPrefix:`verify_${randomUUID().replaceAll('-','')}`});
const closeDb=database.close;
database.close=async()=>{await database.drop();await closeDb();};
const calls=[],results=[],mirrorKey=randomBytes(20).toString('hex'),password=randomBytes(22).toString('base64url');
const transport=async(url,options={})=>{
  const path=new URL(url).pathname,method=options.method||'GET';
  assert.ok(['GET','HEAD'].includes(method)||['/wxapp/getCode','/api/auth/wx/token','/api/OAuth2/Login'].includes(path),'live verification must not write source learning records');
  calls.push({path,method});return requestJson(url,options);
};
const app=await createApp({database,requestJson:transport});
const original=createUpstreamClient(()=>app.locals.configuration.snapshot(),{requestJson:transport});
const aliases=new Map();let mirrorCodes=0;
// This second local YYB address forwards real read/auth requests to the provided service.
// It changes only service-local refs, retaining the original directory openid.
const mirror=createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');
  try{
    if(req.headers.authorization!==`Bearer ${mirrorKey}`){res.writeHead(401);res.end(JSON.stringify({error:'mirror key rejected'}));return;}
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/accounts'){
      const rows=await original.yybRequest('/accounts');
      const mapped=rows.map((row,index)=>{const ref=String(row.id??row.ref);const alias=`mirror-${index}`;aliases.set(alias,ref);return {...row,id:alias,ref:alias};});
      res.end(JSON.stringify({code:0,data:mapped}));return;
    }
    if(path==='/wxapp/getCode'){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
      const ref=aliases.get(String(input.ref));assert.ok(ref,'mirror ref must resolve to its original source');
      mirrorCodes++;const value=await original.yybRequest(path,{...input,ref});
      res.end(JSON.stringify({code:0,data:value}));return;
    }
    res.writeHead(404);res.end(JSON.stringify({error:'unsupported test transport path'}));
  }catch{res.writeHead(502);res.end(JSON.stringify({error:'read-only mirror failed'}));}
});
mirror.listen(0,'127.0.0.1');await once(mirror,'listening');
const server=app.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}`;
async function api(path,{auth,body,method=body===undefined?'GET':'POST',expected=200}={}){
  const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(auth?{cookie:auth.cookie,'X-Study-User':auth.id}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();assert.equal(response.status,expected,`${path}: ${response.status} ${value.error||''}`);return {response,value};
}
const credentials=({response,value})=>({id:value.user.id,cookie:response.headers.get('set-cookie').split(';')[0],session:value});
const record=(name,evidence={})=>{results.push({name,passed:true,...evidence});console.log(JSON.stringify(results.at(-1)));};
try{
  assert.equal(calls.length,0);
  const admin=credentials(await api('/api/system/setup',{body:{username:'verify.admin',displayName:'系统配置验收',password},expected:201}));
  assert.equal((await api('/api/system/registration')).value.registrationEnabled,false);
  await api('/api/learning/auth/register',{body:{username:'verify.closed',password},expected:403});
  const policy=(await api('/api/admin/registration',{auth:admin})).value;
  await api('/api/admin/registration',{auth:admin,method:'PUT',body:{enabled:true,revision:policy.revision}});
  const a=credentials(await api('/api/learning/auth/register',{body:{username:'verify.first',displayName:'注册验收',password,role:'admin',yybRef:'forbidden'},expected:201}));
  assert.equal(a.session.user.role,'learner');assert.equal(a.session.user.yybRef,undefined);assert.equal(calls.length,0);
  record('开放注册仅创建Web学习者，不联系YYB',{sourceRequests:0});
  let pool=(await api('/api/admin/account-pool',{auth:admin})).value;
  const selected=pool.accounts.find(row=>row.openid&&row.status==='alive');assert.ok(selected,'real YYB requires a live openid account');
  const initial=await app.locals.accountPool.acquireSource(a.id,'computer');
  assert.ok(initial.platformState.auth.expiresAt>Date.now());
  const loginCount=app.locals.tokenLifecycle.snapshot().logins;
  const add=(await api('/api/admin/yyb-services',{auth:admin,body:{name:'真实来源只读镜像入口',baseUrl:`http://127.0.0.1:${mirror.address().port}`,apiKey:mirrorKey},expected:201})).value;
  const additional=add.services.find(row=>row.id!=='default');assert.ok(additional);
  pool=(await api('/api/admin/account-pool',{auth:admin})).value;
  const duplicate=pool.accounts.find(row=>row.openid===selected.openid);
  assert.equal(pool.accounts.filter(row=>row.openid===selected.openid).length,1);assert.equal(duplicate.routes.length,2);
  assert.ok(duplicate.routes.some(row=>row.rawRef.startsWith('mirror-')));
  record('两个真实访问地址按openid合并一个微信账号',{accountCount:1,routes:2,transport:'第二地址为本地只读代理，转发用户提供的真实YYB'});
  await api('/api/admin/account-pool',{auth:admin,method:'PUT',body:{revision:pool.revision,algorithm:'least_loaded',enabledRefs:[duplicate.ref]}});
  const bootstrap=add.services.find(row=>row.id==='default');
  await api('/api/admin/yyb-services/default',{auth:admin,method:'PATCH',body:{revision:bootstrap.revision,enabled:false}});
  const routed=await app.locals.accountPool.acquireSource(a.id,'computer');
  assert.equal(routed.account.serviceId,additional.id);assert.equal(routed.platformState.token,initial.platformState.token);assert.equal(app.locals.tokenLifecycle.snapshot().logins,loginCount);assert.equal(mirrorCodes,0);
  record('同openid切换YYB路径复用仍有效的真实平台token',{additionalLogins:0,additionalCodes:0});
  app.locals.tokenLifecycle.clear();
  const relogged=await app.locals.accountPool.acquireSource(a.id,'computer');assert.ok(relogged.platformState.connected);assert.equal(mirrorCodes,1);
  record('无缓存时选定服务的局部ref正确换取真实微信code',{mirrorCodes:1});
  await api('/api/admin/yyb-services',{auth:admin,body:{name:'故障来源验收',baseUrl:'http://127.0.0.1:1'},expected:201});
  pool=(await api('/api/admin/account-pool',{auth:admin})).value;
  assert.ok(pool.issues.length);assert.ok(pool.accounts.some(row=>row.openid===selected.openid));
  record('单个YYB目录故障保留其他来源和统一账号',{issues:pool.issues.length});
  const sync=(await api('/api/admin/resource-sync',{auth:admin})).value;
  await api('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{enabled:true,revision:sync.settings.revision}});
  const input={path:'/api/exam/wx/practice/knowledge',query:{majorId:'701769479767592960',examType:3}};
  const first=(await api('/api/learning/platform/computer',{auth:a,body:input})).value;assert.equal(first.code,200);
  const b=credentials(await api('/api/learning/auth/register',{body:{username:'verify.second',password},expected:201}));
  const before=calls.length,second=(await api('/api/learning/platform/computer',{auth:b,body:input})).value;
  assert.deepEqual(second,first);assert.equal(calls.length,before);
  record('注册用户通过多YYB来源补齐资源，另一用户直接复用PostgreSQL',{additionalSourceRequests:0});
  const updated=(await api('/api/admin/registration',{auth:admin})).value;
  await api('/api/admin/registration',{auth:admin,method:'PUT',body:{enabled:false,revision:updated.revision}});
  await api('/api/learning/auth/register',{body:{username:'verify.after.close',password},expected:403});
  assert.equal((await api('/api/learning/auth/session',{auth:a})).value.authenticated,true);
  record('关闭注册拒绝新账号，已有学习会话仍有效');
}finally{
  mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/system-yyb-live.json',JSON.stringify({checkedAt:new Date().toISOString(),results,sourceRequests:calls.length,sourceLearningWrites:0},null,2));
  await new Promise(resolve=>server.close(resolve));await new Promise(resolve=>mirror.close(resolve));await app.locals.close();
}

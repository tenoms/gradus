import systemConfig from "../../config/system.json" with { type: "json" };
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {once} from 'node:events';
import {createApp} from '../../server/app.mjs';
import {createDatabase} from '../../server/infrastructure/database.mjs';
import {requestJson as upstreamRequestJson} from '../../server/integrations/upstream.mjs';
import {readLivePlatformConfig} from './managed-config.mjs';

const publicConfig=systemConfig.public;
const configurationDefaults=await readLivePlatformConfig();
const database=await createDatabase({schemaPrefix:`verify_${randomUUID().replaceAll('-','')}`});
const close=database.close;database.close=async()=>{await database.drop();await close();};
const calls=[],results=[];
let sourceOffline=false;
const app=await createApp({database,configurationDefaults,configurationEnv:{},requestJson:async(url,options={})=>{
  const parsed=new URL(url),method=String(options.method||'GET').toUpperCase();
  const body=options.body instanceof URLSearchParams?Object.fromEntries(options.body):typeof options.body==='string'?(()=>{try{return JSON.parse(options.body);}catch{return {};}})():{};
  const control=['/accounts','/wxapp/getCode','/api/auth/wx/token','/api/OAuth2/Login'].includes(parsed.pathname)||/^\/api\/wx\/CheckCode/.test(parsed.pathname);
  const readCommand=/^\/api\/Master\/(?:AutoModel|Model)$/.test(parsed.pathname)&&/^(?:Get|get)/.test(body.command||'');
  if(method!=='GET'&&!control&&!readCommand)throw new Error(`验收禁止源写操作: ${method} ${parsed.pathname}`);
  calls.push({path:parsed.pathname,method,command:body.command||undefined});
  if(sourceOffline)throw Object.assign(new Error('验收来源暂不可用'),{status:502});
  return upstreamRequestJson(url,options);
}});
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
const password=randomBytes(20).toString('base64url'),ROOT='/api/learning/personal-sync';
async function request(path,{auth,body,method=body===undefined?'GET':'POST',expected=200}={}){
  const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(auth?{cookie:auth.cookie,'X-Study-User':auth.id}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();assert.equal(response.status,expected,`${path}: ${response.status} ${value.error||''}`);return {response,value};
}
const value=async(path,options)=>(await request(path,options)).value;
async function login(username){const {response,value:session}=await request('/api/learning/auth/login',{body:{username,password}});return {cookie:response.headers.get('set-cookie').split(';')[0],id:session.user.id,session};}
const record=(name,evidence={})=>{const item={name,passed:true,...evidence};results.push(item);console.log(JSON.stringify(item));};
const records=(auth,platform,scope)=>value(`${ROOT}/records?${new URLSearchParams({platform,scope})}`,{auth});
const refresh=(auth,platform,scope,extra={})=>value(`${ROOT}/refresh`,{auth,body:{platform,scope,page:1,pageSize:20,...extra}});
const context={majorId:publicConfig.computer.subjects[0].id,examType:3,examCategory:1,dateFlag:1};
try{
  const setup=await request('/api/system/setup',{expected:201,body:{username:'sync.admin',displayName:'个人同步验收',password}});
  const admin={cookie:setup.response.headers.get('set-cookie').split(';')[0],id:setup.value.user.id};
  for(const username of ['sync.first','sync.second'])await request('/api/admin/users',{auth:admin,expected:201,body:{username,displayName:username,password}});
  const a=await login('sync.first'),b=await login('sync.second');assert.equal(calls.length,0);
  assert.equal((await value(ROOT,{auth:a})).settings.enabled,false);
  record('Web登录与个人同步状态读取不访问YYB',{sourceRequests:0});
  const webProfile={nickname:'Web账号资料验收',avatar:'',examYear:'2027',province:'浙江省',major:'软件工程',preparationStatus:'应届',reviewMonth:'3月'};
  const studyBeforeProfile=await value('/api/learning/study/data',{auth:a});
  const profileSaved=await value('/api/learning/profile',{auth:a,method:'PUT',body:webProfile});
  assert.deepEqual(profileSaved.profile,webProfile);
  const assertWebProfile=async name=>{
    const sourceRequestsBefore=calls.length;
    assert.deepEqual((await value('/api/learning/profile',{auth:a})).profile,webProfile);
    const session=await value('/api/learning/auth/session',{auth:a});
    assert.equal(session.user.displayName,webProfile.nickname);
    assert.equal(session.user.avatar,webProfile.avatar);
    assert.equal(session.platforms.math.user.UserNick,webProfile.nickname);
    assert.deepEqual(await value('/api/learning/study/data',{auth:a}),studyBeforeProfile);
    assert.equal(calls.length,sourceRequestsBefore);
    record(name,{profileFields:Object.keys(webProfile).length,studyRevision:studyBeforeProfile.revision,mathPlan:studyBeforeProfile.data.mathPlan||null,additionalSourceRequests:0});
  };
  await assertWebProfile('通用Web资料保存后会话昵称一致且学习计划与版本不变');
  assert.equal(calls.length,0);
  const runtime=app.locals.configuration.snapshot();
  await request(`${ROOT}/connection`,{auth:a,method:'PUT',body:{baseUrl:runtime.yyb.baseUrl,apiKey:runtime.yyb.apiKey}});
  assert.equal(calls.length,0);record('保存个人YYB连接不触发同步',{sourceRequests:0});
  const directory=(await value(`${ROOT}/accounts`,{auth:a})).accounts;
  const selected=directory.find(row=>row.status==='alive'&&row.openid);assert.ok(selected,'真实目录需要带openid的可用个人账号');
  const binding=await value(`${ROOT}/binding`,{auth:a,body:{ref:selected.ref}});
  const serialized=JSON.stringify(binding);assert.equal(serialized.includes('access_token'),false);assert.equal(serialized.includes('refresh_token'),false);
  record('个人关联使用真实目录openid及两科学习身份',{accountIdentityHash:createHash('sha256').update(selected.openid).digest('hex').slice(0,12)});
  await assertWebProfile('本人YYB绑定后Web资料和会话昵称保持独立');
  const resourceBefore=await value('/api/admin/resource-sync',{auth:admin});assert.equal(resourceBefore.settings.enabled,false);
  await value(`${ROOT}/settings`,{auth:a,method:'PUT',body:{enabled:true,scopes:['bookshelf','favorites','mistakes','notes','answers','reports','progress']}});
  assert.equal((await value('/api/admin/resource-sync',{auth:admin})).settings.enabled,false);
  record('个人同步开关独立于公共资源同步');
  const beforePreview=(await records(a,'computer','reports')).records.length;
  const preview=await value(`${ROOT}/preview`,{auth:a,body:{platform:'computer',scope:'reports',context,page:1,pageSize:20}});
  assert.equal((await records(a,'computer','reports')).records.length,beforePreview);
  record('真实报告预览不保存个人记录',{previewCount:preview.records?.length??preview.rows?.length??preview.count??null});
  const reportImport=await refresh(a,'computer','reports',{context});assert.ok(reportImport.added>0,'实际已有报告应导入非空记录');
  const reportRows=(await records(a,'computer','reports')).records;assert.ok(reportRows.length>0);
  assert.equal((await records(b,'computer','reports')).records.length,0);
  record('真实计算机历史报告导入且按Web用户隔离',{added:reportImport.added,records:reportRows.length});
  const repeated=await refresh(a,'computer','reports',{context});assert.equal(repeated.added,0);assert.equal((await records(a,'computer','reports')).records.length,reportRows.length);
  record('重复导入同一openid的真实报告不生成重复记录',{unchanged:repeated.unchanged,updated:repeated.updated});
  const bookshelf=await refresh(a,'math','bookshelf');
  record('真实数学书架读取与导入',{added:bookshelf.added,updated:bookshelf.updated,unchanged:bookshelf.unchanged});
  const progress=await refresh(a,'math','progress');
  record('真实数学阅读进度按页导入',{added:progress.added,updated:progress.updated,unchanged:progress.unchanged});
  for(const scope of ['favorites','mistakes','notes']){
    try{const imported=await refresh(a,'math',scope);record(`真实数学${scope}读取`,{added:imported.added,updated:imported.updated,unchanged:imported.unchanged});}
    catch(error){results.push({name:`真实数学${scope}读取`,passed:false,message:error.message});}
  }
  for(const scope of ['favorites','mistakes','notes']){
    const imported=await refresh(a,'computer',scope,{context});
    assert.equal(imported.status,'ready');assert.ok(imported.count<=20);
    record(`真实计算机${scope}按页读取`,{added:imported.added,count:imported.count,hasMore:imported.hasMore});
  }
  const computerProgress=await refresh(a,'computer','progress',{context});
  assert.equal(computerProgress.status,'ready');assert.ok(computerProgress.count<=20);assert.equal(computerProgress.hasMore,true);
  record('真实计算机进度非分页源按当前页导入',{added:computerProgress.added,count:computerProgress.count,hasMore:computerProgress.hasMore});
  const sourceReportId=reportRows[0].data.id||reportRows[0].data.examRecordId;
  assert.ok(sourceReportId);
  const answerImport=await refresh(a,'computer','answers',{context:{...context,examRecordId:sourceReportId}});
  assert.equal(answerImport.status,'ready');record('真实计算机历史作答按已导入报告上下文读取',{added:answerImport.added,count:answerImport.count});
  const historyRecords=(await records(a,'math','progress')).records,sourceQuestion=historyRecords.find(row=>row.data?.QuestionID||row.data?.ID);
  assert.ok(sourceQuestion);
  const mathAnswers=await refresh(a,'math','answers',{context:{QuestionID:sourceQuestion.data.QuestionID||sourceQuestion.data.ID}});
  assert.equal(mathAnswers.status,'ready');record('真实数学个人答案按题目上下文读取',{added:mathAnswers.added,count:mathAnswers.count});
  assert.equal((await records(a,'math','reports')).records.length,0);
  const beforeOnDemand=calls.length;
  const reports=await value('/api/learning/platform/math',{auth:a,body:{path:'/api/Master/AutoModel',method:'POST',data:{command:'GetCatalogHistoryList',data:JSON.stringify({BusType:'数一',Type:'精选10题',ExanType:'真题模式',CatalogCode:0,CodeLength:1})}}});
  assert.ok((await records(a,'math','reports')).records.length>0,'访问个人历史页面自动导入对应范围');
  assert.equal(calls.slice(beforeOnDemand).filter(call=>call.command==='GetCatalogHistoryList').length,1);
  record('真实数学历史页面触发单向按需更新',{imported:(await records(a,'math','reports')).records.length,returned:Array.isArray(reports.data?.[0])?reports.data[0].length:null});
  await assertWebProfile('本人两科学习记录导入后Web资料和会话昵称不变');
  const resourceAfter=await value('/api/admin/resource-sync',{auth:admin});assert.equal(resourceAfter.resources.total,resourceBefore.resources.total);
  record('个人导入未写入公共资源库',{publicResources:resourceAfter.resources.total});
  const beforeIdle=calls.length;await value(ROOT,{auth:a});assert.equal(calls.length,beforeIdle);record('查看同步状态不会后台遍历学习记录',{additionalSourceRequests:0});
  await value(`${ROOT}/settings`,{auth:a,method:'PUT',body:{enabled:false,scopes:['reports','progress','bookshelf']}});
  const beforeDisabled=calls.length;
  const disabled=await fetch(base+`${ROOT}/refresh`,{method:'POST',headers:{'content-type':'application/json',cookie:a.cookie,'X-Study-User':a.id},body:JSON.stringify({platform:'computer',scope:'reports',context})});
  assert.ok([403,409].includes(disabled.status));assert.equal(calls.length,beforeDisabled);assert.equal((await records(a,'computer','reports')).records.length,reportRows.length);
  record('关闭个人同步保留导入历史且不回源');
  await value(`${ROOT}/settings`,{auth:a,method:'PUT',body:{enabled:true,scopes:['reports','progress','bookshelf']}});sourceOffline=true;
  const failed=await fetch(base+`${ROOT}/refresh`,{method:'POST',headers:{'content-type':'application/json',cookie:a.cookie,'X-Study-User':a.id},body:JSON.stringify({platform:'computer',scope:'reports',context})});
  assert.ok([409,502,503].includes(failed.status));assert.equal((await records(a,'computer','reports')).records.length,reportRows.length);assert.equal((await value('/api/learning/auth/session',{auth:a})).authenticated,true);
  record('来源不可用仍可读导入记录且Web会话有效');
  await value(`${ROOT}/binding`,{auth:a,method:'DELETE'});assert.equal((await value(ROOT,{auth:a})).binding,null);assert.equal((await records(a,'computer','reports')).records.length,reportRows.length);
  record('解除个人关联保留Web拥有的导入数据');
  await assertWebProfile('解除本人YYB关联后Web资料和会话昵称仍保留');
}catch(error){results.push({name:'验收失败',passed:false,message:error.message});console.error(error.message);process.exitCode=1;}
finally{
  if(results.some(row=>!row.passed))process.exitCode=1;
  mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/personal-sync-live.json',JSON.stringify({checkedAt:new Date().toISOString(),results,sourceRequests:calls,sourceWrites:0},null,2)+'\n');
  await new Promise(resolve=>server.close(resolve));await app.locals.close();
}

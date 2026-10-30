import systemConfig from '../../config/system.json' with {type:'json'};
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {once} from 'node:events';
import {createApp} from '../../server/app.mjs';
import {createDatabase} from '../../server/infrastructure/database.mjs';
import {requestJson as upstreamRequestJson} from '../../server/integrations/upstream.mjs';
import {readLivePlatformConfig} from './managed-config.mjs';

const configurationDefaults=await readLivePlatformConfig();
const database=await createDatabase({schemaPrefix:`verify_${randomUUID().replaceAll('-','')}`});
const close=database.close;database.close=async()=>{await database.drop();await close();};
const calls=[],results=[];
let offline=false,blocked,forwardedRequests=0;
const app=await createApp({database,configurationDefaults,configurationEnv:{},requestJson:async(url,options={})=>{
  const parsed=new URL(url),method=String(options.method||'GET').toUpperCase();
  const body=options.body instanceof URLSearchParams?Object.fromEntries(options.body):{};
  const control=['/wxapp/getCode','/api/auth/wx/token','/api/OAuth2/Login'].includes(parsed.pathname);
  const readCommand=/^\/api\/Master\/(?:AutoModel|Model)$/.test(parsed.pathname)&&/^(?:Get|get)/.test(body.command||'');
  const prepareGroup=parsed.pathname==='/api/exam/wx/practice/cache/examination/group';
  assert.ok(method==='GET'||control||readCommand||prepareGroup,`验收禁止源个人写操作: ${method} ${parsed.pathname}`);
  calls.push({path:parsed.pathname,method,forwarded:!offline});
  if(blocked)await blocked.promise;
  if(offline)throw Object.assign(new Error('验收模拟来源暂不可用'),{status:502});
  forwardedRequests++;
  return upstreamRequestJson(url,options);
}});
const server=app.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}`,password=randomBytes(20).toString('base64url');
async function request(path,{auth,body,method=body===undefined?'GET':'POST',expected=200,signal}={}) {
  const response=await fetch(base+path,{method,signal,headers:{'content-type':'application/json',...(auth?{cookie:auth.cookie,'X-Study-User':auth.id}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();
  assert.equal(response.status,expected,`${path}: ${response.status} ${value.error||''}`);
  return {response,value};
}
const value=async(path,options)=>(await request(path,options)).value;
const platform=(auth,name,input)=>value(`/api/learning/platform/${name}`,{auth,body:input,signal:AbortSignal.timeout(offline?5000:60000)});
const get=(auth,name,path,query={})=>platform(auth,name,{path,query});
const command=(auth,command,data={},model=false)=>platform(auth,'math',{path:model?'/api/Master/Model':'/api/Master/AutoModel',method:'POST',data:{command,data:JSON.stringify(data)}});
const rows=response=>{const data=response?.data??response?.Data??[];return Array.isArray(data?.[0])?data[0]:Array.isArray(data)?data:data?.list||data?.exercises||data?.groupList||[];};
const record=(name,evidence={})=>{const result={name,passed:true,...evidence};results.push(result);console.log(JSON.stringify(result));};
const idle=()=>app.locals.resourceSync.waitForIdle();
const resourcePath=row=>`/api/admin/resources/${row.platform}/${row.sourceId}/${row.key}`;
function questionObject(value,questionId) {
  if(!value||typeof value!=='object')return null;
  if(Array.isArray(value))return value.map(item=>questionObject(item,questionId)).find(Boolean)||null;
  const nested=questionObject(value._question_list,questionId);if(nested)return nested;
  const matches=[value.ID,value.QuestionID].some(id=>id!==undefined&&String(id)===String(questionId));
  if(matches&&['QuestionTxt','QuestionContent','Content','QuestionImg','Title'].some(field=>typeof value[field]==='string'&&value[field].trim()))return value;
  for(const [key,item]of Object.entries(value))if(key!=='_question_list') {const found=questionObject(item,questionId);if(found)return found;}
  return null;
}
try {
  const setup=await request('/api/system/setup',{expected:201,body:{username:'local.admin',displayName:'本地优先验收',password}});
  const admin={cookie:setup.response.headers.get('set-cookie').split(';')[0],id:setup.value.user.id};
  const pool=await value('/api/admin/account-pool',{auth:admin}),account=pool.accounts.find(row=>row.status==='alive');
  assert.ok(account,'真实YYB需要一个可用账号');
  await value('/api/admin/account-pool',{auth:admin,method:'PUT',body:{revision:pool.revision,algorithm:'least_loaded',enabledRefs:[account.ref]}});
  for(const username of ['local.first','local.second'])await request('/api/admin/users',{auth:admin,expected:201,body:{username,displayName:username,password}});
  const login=async username=>{const result=await request('/api/learning/auth/login',{body:{username,password}});return {cookie:result.response.headers.get('set-cookie').split(';')[0],id:result.value.user.id};};
  const beforeLogin=calls.length,a=await login('local.first'),b=await login('local.second');
  assert.equal(calls.length,beforeLogin);
  let settings=(await value('/api/admin/resource-sync',{auth:admin})).settings;
  assert.equal(settings.refreshAfterDays,30);
  settings=(await value('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:settings.revision,enabled:true,refreshAfterDays:30}})).settings;
  record('独立临时Web用户登录且默认更新周期30天',{additionalSourceRequests:0});

  const papers=await command(a,'GetBookListCountAndLookCount_New',{IsValid:1,BusType:'试卷',IsBook:1,IsBeta:0,IsRecommend:''},true);
  assert.ok(rows(papers).length);
  const book=rows(papers).find(row=>String(row.Name||row.BookName||'').includes('2025'))||rows(papers)[0];
  const catalog=await command(a,'GetQuestionNexts2',{BookID:book.ID});assert.ok(rows(catalog).length);
  const first=rows(catalog)[0],questionId=first.QuestionID||first.ID;
  const questionQuery={ID:questionId},analysisQuery={ID:questionId,SortDesc:'Sort'};
  const questionRow=response=>rows(response).find(row=>[row.ID,row.QuestionID].some(id=>id!==undefined&&String(id)===String(questionId)));
  const questionOrigin=async auth=>{
    const current=await app.locals.resourceSync.peek({platform:'math',session:{user:{id:auth.id}},config:app.locals.configuration.snapshot(),request:{path:'/api/question_list/GetQuestionByQuestionNew',method:'GET',query:questionQuery,data:{}}});
    assert.ok(current.resource,'当前题目应有已保存的实际来源响应');
    return {platform:'math',sourceId:current.identity.source.id,key:current.resource.key,state:current.state};
  };
  const question=await get(a,'math','/api/question_list/GetQuestionByQuestionNew',questionQuery);
  const analysis=await get(a,'math','/api/question_list/GetQuestionByIDSoleDes',analysisQuery);
  assert.ok(rows(question).length);assert.ok(rows(analysis).length);
  assert.equal(String(questionRow(question)?.ID),String(questionId),'跨入口单题使用真实题目ID，不使用目录关系ID');
  record('真实数学题干与解析同步到临时PostgreSQL',{catalogueEntries:rows(catalog).length,questionRows:rows(question).length,analysisRows:rows(analysis).length});

  const majorId=systemConfig.public.computer.subjects[0].id;
  const chapters=await get(a,'computer','/api/exam/wx/practice/knowledge',{majorId,examType:3});assert.ok(rows(chapters).length);
  const flatten=value=>Array.isArray(value)?value.flatMap(flatten):value&&typeof value==='object'?[value,...Object.values(value).filter(item=>item&&typeof item==='object').flatMap(flatten)]:[];
  let chosenChapter,chosenGroup;
  for(const chapter of flatten(rows(chapters)).filter(row=>row.id).slice(0,8)) {
    const groups=await get(a,'computer','/api/exam/wx/practice/examination/group/list',{chapterId:chapter.id,examExerciseType:1});
    if(rows(groups).length){chosenChapter=chapter;chosenGroup=rows(groups)[0];break;}
  }
  assert.ok(chosenGroup,'需要一个真实计算机章节练习组');
  const practiceQuery={majorId,chapterId:chosenChapter.id,examGroupId:chosenGroup.id,examExerciseType:1,examType:3,examCategory:1,number:1};
  const exercise=await get(a,'computer','/api/exam/wx/practice/exerciseList',practiceQuery);
  assert.equal(rows(exercise).length,1);
  record('真实计算机仅同步当前题目',{visitedQuestions:1,questionReferences:exercise.data.exerciseTotalNumber});

  const beforeAnswers=calls.length;
  await platform(a,'math',{path:'/api/rel_question_log/Inner_rel_question_log',method:'POST',data:{QuestionID:questionId,Type:'题目',MyAnswer:'本地优先验收答案',State:1,ID:0}});
  await platform(a,'computer',{path:'/api/exam/wx/practice/submitExam',method:'POST',data:{examinationId:exercise.data.examId,answers:[{exerciseId:rows(exercise)[0].exerciseId,answer:'B',answerType:2,score:0}],submitStatus:0}});
  assert.equal(calls.length,beforeAnswers);
  const managed=await value(resourcePath(await questionOrigin(a)),{auth:admin});
  const edited=structuredClone(managed.response),editedQuestion=questionObject(edited,questionId);
  assert.ok(editedQuestion,'实际来源响应应包含当前题目的完整正文');
  editedQuestion.WebResourceLabel='临时本地验收标记';
  await value(resourcePath(managed),{auth:admin,method:'PATCH',body:{revision:managed.revision,response:edited}});
  await database.query(`UPDATE ${database.upstream('resources')} SET expires_at='2000-01-01'::timestamptz WHERE scope='public'`);

  let release;blocked={promise:new Promise(resolve=>{release=resolve;}),release};offline=true;
  const beforeOffline=calls.length,beforeOfflineForwarded=forwardedRequests;
  try {
    const localQuestion=await get(b,'math','/api/question_list/GetQuestionByQuestionNew',questionQuery);
    assert.equal(questionRow(localQuestion)?.WebResourceLabel,'临时本地验收标记');
    assert.deepEqual(await get(b,'math','/api/question_list/GetQuestionByIDSoleDes',analysisQuery),analysis);
    const localExercise=await get(a,'computer','/api/exam/wx/practice/exerciseList',practiceQuery);
    assert.equal(rows(localExercise)[0].exerciseId,rows(exercise)[0].exerciseId);assert.equal(localExercise.data.answers[0].answer,'B');
    assert.equal((await get(b,'computer','/api/exam/wx/practice/exerciseList',practiceQuery)).data.answers.length,0);
    record('源请求挂起时过期题干解析和计算机题目直接返回本地且个人答案隔离',{cachedReads:4});
  } finally { blocked.release();blocked=undefined; }
  await idle();assert.ok(calls.length>beforeOffline);assert.equal(forwardedRequests,beforeOfflineForwarded);
  assert.equal(questionObject((await value(resourcePath(managed),{auth:admin})).response,questionId)?.WebResourceLabel,'临时本地验收标记');
  record('模拟来源不可用时后台刷新失败保留已存正文',{interceptedSourceAttempts:calls.length-beforeOffline,realSourceRequests:0});

  const missing=await fetch(base+'/api/learning/platform/math',{method:'POST',headers:{'content-type':'application/json',cookie:a.cookie,'X-Study-User':a.id},body:JSON.stringify({path:'/api/question_list/GetQuestionByQuestionNew',query:{ID:Number(questionId)+1000000000}})});
  assert.ok([502,503].includes(missing.status));assert.equal((await value('/api/learning/auth/session',{auth:a})).authenticated,true);
  record('来源不可用时真正缺失内容明确失败且Web会话继续有效',{status:missing.status});

  settings=(await value('/api/admin/resource-sync',{auth:admin})).settings;
  settings=(await value('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:settings.revision,enabled:false,refreshAfterDays:30}})).settings;
  const beforeDisabled=calls.length;
  assert.equal(questionRow(await get(b,'math','/api/question_list/GetQuestionByQuestionNew',questionQuery))?.WebResourceLabel,'临时本地验收标记');
  await get(b,'math','/api/question_list/GetQuestionByIDSoleDes',analysisQuery);
  await get(a,'computer','/api/exam/wx/practice/exerciseList',practiceQuery);await idle();assert.equal(calls.length,beforeDisabled);
  record('关闭同步后继续使用全部过期公共内容且不尝试刷新',{additionalSourceRequests:0});

  offline=false;
  await value('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:settings.revision,enabled:true,refreshAfterDays:30}});
  assert.equal(questionRow(await get(b,'math','/api/question_list/GetQuestionByQuestionNew',questionQuery))?.WebResourceLabel,'临时本地验收标记');
  await get(b,'math','/api/question_list/GetQuestionByIDSoleDes',analysisQuery);
  await get(a,'computer','/api/exam/wx/practice/exerciseList',practiceQuery);await idle();
  const refreshedOrigin=await questionOrigin(b);assert.equal(refreshedOrigin.state,'hit');
  const refreshed=await value(resourcePath(refreshedOrigin),{auth:admin});assert.equal(refreshed.expired,false);assert.equal(questionObject(refreshed.response,questionId)?.WebResourceLabel,undefined);
  const beforeFresh=calls.length;
  const freshQuestion=questionRow(await get(a,'math','/api/question_list/GetQuestionByQuestionNew',questionQuery));
  assert.equal(freshQuestion?.WebResourceLabel,undefined);assert.equal(String(freshQuestion?.ID),String(questionId));
  assert.equal((await get(a,'computer','/api/exam/wx/practice/exerciseList',practiceQuery)).data.answers[0].answer,'B');
  assert.equal((await command(a,'GetQuestionLogInfo_rel2',{QuestionID:questionId})).data[5][0].MyAnswer,'本地优先验收答案');
  assert.equal((await command(b,'GetQuestionLogInfo_rel2',{QuestionID:questionId})).data[5].length,0);
  assert.equal(calls.length,beforeFresh);
  record('来源恢复后异步更新真实正文且两科本地答案保留',{additionalFreshReadSourceRequests:0});
} catch(error) {
  const result={name:'验收失败',passed:false,message:error.message};results.push(result);console.log(JSON.stringify(result));process.exitCode=1;
} finally {
  blocked?.release();blocked=undefined;await idle();
  mkdirSync('artifacts',{recursive:true});
  writeFileSync('artifacts/resource-local-first-live.json',JSON.stringify({checkedAt:new Date().toISOString(),results,sourceRequests:{attempted:calls.length,forwarded:forwardedRequests},sourceEffects:{personalWrites:0,groupSelectionRequests:calls.filter(row=>row.forwarded&&row.path==='/api/exam/wx/practice/cache/examination/group').length},isolatedDatabase:true},null,2)+'\n');
  await new Promise(resolve=>server.close(resolve));await app.locals.close();
}

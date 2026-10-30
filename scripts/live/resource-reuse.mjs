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
const computerOnly=process.argv.includes('--computer-only');
let offline=false;
const app=await createApp({database,configurationDefaults,configurationEnv:{},requestJson:async(url,options={})=>{
  const parsed=new URL(url),method=String(options.method||'GET').toUpperCase();
  const body=options.body instanceof URLSearchParams?Object.fromEntries(options.body):{};
  const control=['/wxapp/getCode','/api/auth/wx/token','/api/OAuth2/Login'].includes(parsed.pathname);
  const readCommand=/^\/api\/Master\/(?:AutoModel|Model)$/.test(parsed.pathname)&&/^(?:Get|get)/.test(body.command||'');
  const sourceSelection=['/api/exam/wx/practice/cache/examination/group','/api/choice_question_exercise/RelPaper'].includes(parsed.pathname);
  assert.ok(method==='GET'||control||readCommand||sourceSelection,`验收禁止上游个人写入: ${method} ${parsed.pathname}`);
  calls.push({path:parsed.pathname,method,forwarded:!offline});
  if(offline)throw Object.assign(new Error('验收模拟来源不可用'),{status:502});
  return upstreamRequestJson(url,options);
}});
const server=app.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}`,password=randomBytes(20).toString('base64url');
async function request(path,{auth,body,method=body===undefined?'GET':'POST',expected=200}={}) {
  const response=await fetch(base+path,{method,signal:AbortSignal.timeout(offline?5000:60000),headers:{'content-type':'application/json',...(auth?{cookie:auth.cookie,'X-Study-User':auth.id}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();assert.equal(response.status,expected,`${path}: ${response.status} ${value.error||''}`);return {response,value};
}
const value=async(path,options)=>(await request(path,options)).value;
const platform=(auth,name,input)=>value(`/api/learning/platform/${name}`,{auth,body:input});
const get=(auth,name,path,query={})=>platform(auth,name,{path,query});
const command=(auth,command,data={})=>platform(auth,'math',{path:'/api/Master/AutoModel',method:'POST',data:{command,data:JSON.stringify(data)}});
const rows=response=>{const data=response?.data??response?.Data??[];return Array.isArray(data?.[0])?data[0]:Array.isArray(data)?data:data?.exercises||data?.groupList||data?.list||(data&&typeof data==='object'?[data]:[]);};
const record=(name,evidence={})=>{const result={name,passed:true,...evidence};results.push(result);console.log(JSON.stringify(result));};
const mathParams={BusType:'数一',CatalogID:18,ExanType:'真题模式',Type:'精选10题'};
const createMath=auth=>platform(auth,'math',{path:'/api/choice_question_exercise/RelPaper',method:'POST',data:mathParams});
const mathId=response=>response.data?.ID||response.data;
const mathPaper=(auth,id)=>get(auth,'math','/api/choice_question_exercise/GetPaper',{ID:id});
const finishMath=(auth,id)=>platform(auth,'math',{path:'/api/choice_question_exercise/Inner_choice_question_exercise',method:'POST',data:{ID:id,IsFinish:1,UpdateColumns:'ID,IsFinish'}});
try {
  const setup=await request('/api/system/setup',{expected:201,body:{username:'reuse.admin',displayName:'资源复用验收',password}});
  const admin={cookie:setup.response.headers.get('set-cookie').split(';')[0],id:setup.value.user.id};
  const pool=await value('/api/admin/account-pool',{auth:admin}),account=pool.accounts.find(row=>row.status==='alive');assert.ok(account,'需要一个真实可用YYB账号');
  await value('/api/admin/account-pool',{auth:admin,method:'PUT',body:{revision:pool.revision,algorithm:'least_loaded',enabledRefs:[account.ref]}});
  for(const username of ['reuse.first','reuse.second'])await request('/api/admin/users',{auth:admin,expected:201,body:{username,displayName:username,password}});
  const login=async username=>{const result=await request('/api/learning/auth/login',{body:{username,password}});return {cookie:result.response.headers.get('set-cookie').split(';')[0],id:result.value.user.id};};
  const a=await login('reuse.first'),b=await login('reuse.second');
  const settings=(await value('/api/admin/resource-sync',{auth:admin})).settings;
  assert.equal(settings.refreshAfterDays,30);
  await value('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:settings.revision,enabled:true,refreshAfterDays:30}});

  if(!computerOnly) {
    const created=await createMath(a),firstMathId=mathId(created),firstMath=await mathPaper(a,firstMathId);
    assert.ok(rows(firstMath).length>0&&rows(firstMath).length<=10,'只对一个精选10题题组做真实源选题');
    const mathQuestions=rows(firstMath),qid=mathQuestions[0].QuestionID||mathQuestions[0]._question_list?.ID;
    assert.ok(qid);
    const afterMathPrime=calls.length;
    const direct=await get(b,'math','/api/question_list/GetQuestionByQuestionNew',{ID:qid});
    assert.ok(rows(direct).some(row=>row.QuestionTxt||row.QuestionContent||row.QuestionImg||row.Content||row.Title));
    assert.equal(calls.length,afterMathPrime,'题组已含完整正文时单题入口不再回源');
    record('真实数学精选题组正文由另一用户单题入口复用',{questions:mathQuestions.length,additionalSourceRequests:0});

    const sole=await get(a,'math','/api/question_list/GetQuestionByIDSoleDes',{ID:qid,SortDesc:'Sort'});
    const resolved=await command(a,'GetQuestionInfoByResolve',{QuestionID:qid});
    assert.ok(rows(sole).length);assert.ok(rows(resolved).length);
    offline=true;
    const beforeMathReuse=calls.length;
    assert.deepEqual(rows(await get(b,'math','/api/question_list/GetQuestionByIDSoleDes',{ID:String(qid)})),rows(sole));
    assert.deepEqual(rows(await command(b,'GetQuestionInfoByResolve',{QuestionID:String(qid)})),rows(resolved));
    await finishMath(a,firstMathId);
    const replayA=mathId(await createMath(a)),replayB=mathId(await createMath(b));
    assert.notEqual(replayA,firstMathId);assert.notEqual(replayB,replayA);
    const paperA=await mathPaper(a,replayA),paperB=await mathPaper(b,replayB);
    assert.deepEqual(rows(paperA).map(row=>String(row.QuestionID)),mathQuestions.map(row=>String(row.QuestionID)));
    assert.deepEqual(rows(paperB).map(row=>String(row.QuestionID)),mathQuestions.map(row=>String(row.QuestionID)));
    assert.ok(rows(paperA).every(row=>!row.MyAnswer));assert.ok(rows(paperB).every(row=>!row.MyAnswer));
    await platform(a,'math',{path:'/api/choice_question_exercise_log/Inner_choice_question_exercise_log',method:'POST',data:{ID:rows(paperA)[0].ID,MyAnswer:'A',State:1,UpdateColumns:'ID,MyAnswer,State'}});
    assert.equal(rows(await mathPaper(a,replayA))[0].MyAnswer,'A');assert.ok(!rows(await mathPaper(b,replayB))[0].MyAnswer);
    assert.equal(calls.length,beforeMathReuse,'两次本地重练、解析跨入口与本地答案操作不获取来源账号');
    record('断源后数学多行解析独立复用并创建两次个人本地重练',{localPractices:2,questionsPerPractice:mathQuestions.length,additionalSourceRequests:0});
  }

  offline=false;
  const majorId=systemConfig.public.computer.subjects[0].id;
  const chapters=await get(a,'computer','/api/exam/wx/practice/knowledge',{majorId,examType:3});
  const flatten=value=>Array.isArray(value)?value.flatMap(flatten):value&&typeof value==='object'?[value,...Object.values(value).filter(item=>item&&typeof item==='object').flatMap(flatten)]:[];
  const candidates=[];
  for(const chapter of flatten(rows(chapters)).filter(row=>row.id).slice(0,4)) {
    const groups=await get(a,'computer','/api/exam/wx/practice/examination/group/list',{chapterId:chapter.id,examExerciseType:1});
    for(const group of rows(groups)) {
      const count=Number(group.totalNumber??group.exerciseNumber);
      if(Number.isInteger(count)&&count>0&&count<=120)candidates.push({chapter,group,count});
    }
  }
  candidates.sort((a,b)=>a.count-b.count);const chosen=candidates[0];assert.ok(chosen,'前4个章节需要一个不超过120题的完整练习组');
  const query={majorId,chapterId:chosen.chapter.id,examGroupId:chosen.group.id,examExerciseType:1,examType:3,examCategory:1,number:0};
  const whole=await get(a,'computer','/api/exam/wx/practice/exerciseList',query);
  const computerQuestions=rows(whole),ids=whole.data.examExerciseIdList;
  assert.ok(Array.isArray(ids)&&ids.length>0);assert.equal(computerQuestions.length,ids.length);assert.equal(Number(whole.data.exerciseTotalNumber),ids.length);
  record('只对一个有界计算机题组读取完整卷面',{questions:ids.length,metadataCandidates:candidates.length});
  offline=true;const beforeComputerReuse=calls.length;
  const next=await get(b,'computer','/api/exam/wx/practice/exerciseList',{...query,number:Math.min(2,ids.length)});
  assert.equal(rows(next).length,1);assert.equal(String(rows(next)[0].exerciseId),String(ids[Math.min(2,ids.length)-1]));
  const detail=await get(b,'computer',`/api/exam/wx/searchExercise/info/${encodeURIComponent(ids[0])}`);
  assert.ok(rows(detail)[0].exerciseStems||rows(detail)[0].exerciseTitle);
  const localWhole=await get(b,'computer','/api/exam/wx/practice/exerciseList',query);assert.equal(rows(localWhole).length,ids.length);assert.equal(localWhole.data.answers.length,0);
  const submit=await platform(b,'computer',{path:'/api/exam/wx/practice/submitExam',method:'POST',data:{examinationId:localWhole.data.examId,answers:[{exerciseId:ids[0],answer:'B',answerType:2,score:0}],submitStatus:1}});
  assert.ok(submit.data.examRecordId);
  const reopened=await get(b,'computer','/api/exam/wx/practice/exerciseList',query);assert.notEqual(reopened.data.examRecordId,localWhole.data.examRecordId);assert.equal(reopened.data.answers.length,0);
  assert.equal((await get(a,'computer','/api/exam/wx/practice/exerciseList',query)).data.answers.length,0);
  assert.equal(calls.length,beforeComputerReuse,'断源后逐题、单题详情、整卷、交卷后重开及另一用户读取均不访问来源');
  record('断源后计算机完整题组支持跨入口和新个人练习',{questions:ids.length,additionalSourceRequests:0});

  const beforeIdle=calls.length;await app.locals.resourceSync.waitForIdle();assert.equal(calls.length,beforeIdle);
  assert.equal(calls.filter(call=>call.path==='/api/choice_question_exercise/RelPaper'&&call.forwarded).length,computerOnly?0:1,'数学源选题限定为完整验收一次，计算机单科验收零次');
  record('所有来源工作均由限定学习请求触发，停止访问不继续抓取',{additionalSourceRequests:0});
} catch(error) {
  const result={name:'验收失败',passed:false,message:error.message};results.push(result);console.log(JSON.stringify(result));process.exitCode=1;
} finally {
  await app.locals.resourceSync.waitForIdle();
  const sourcePractices=(await database.query(`SELECT data->>'sourcePracticeId' AS id FROM ${database.web('platform_records')} WHERE platform='math' AND collection='choice_question_exercise' AND data ? 'sourcePracticeId'`)).rows.map(row=>row.id);
  mkdirSync('artifacts',{recursive:true});
  writeFileSync(`artifacts/resource-reuse${computerOnly?'-computer':''}-live.json`,JSON.stringify({checkedAt:new Date().toISOString(),results,sourceRequests:{attempted:calls.length,forwarded:calls.filter(call=>call.forwarded).length},sourceEffects:{mathSelectionRequests:calls.filter(call=>call.forwarded&&call.path==='/api/choice_question_exercise/RelPaper').length,mathEmptyPracticeIds:sourcePractices,answerWrites:0,submittedPractices:0},isolatedDatabase:true},null,2)+'\n');
  await new Promise(resolve=>server.close(resolve));await app.locals.close();
}

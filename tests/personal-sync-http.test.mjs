import test from 'node:test';
import assert from 'node:assert/strict';
import {startHttpApp,testLearner} from './http-app.mjs';

const ROOT='/api/learning/personal-sync';
const SCOPES=['bookshelf','favorites','mistakes','notes','answers','reports','progress'];
function sourceFixture(){
  const calls=[],state={openid:'wechat-owner-a',ref:'personal-a',version:1,offline:false,missingOpenid:false,reportPages:1,extraNote:false,loginError:0,readError:0,mathSubject:'',progressRows:1,emptyCollections:false,emptyCollectionCode:4114};
  const invoke=(kind,input)=>{calls.push({kind,...input});if(state.offline)throw Object.assign(new Error('source offline'),{status:502});};
  return {calls,state,
    yybRequest:async(path,data,options,override)=>{invoke('directory',{path,override});return [{id:state.ref,openid:state.missingOpenid?'':state.openid,nickname:'个人来源',status:'alive'}];},
    loginPlatform:async(name,account,override)=>{invoke('login',{name,ref:account.ref,override});if(state.loginError)throw Object.assign(new Error('source authorization rejected'),{status:state.loginError});const mathSubject=state.mathSubject||`math-${state.openid}`;return {connected:true,token:`source-token-${name}`,stuId:mathSubject,user:name==='math'?{ID:11,StuID:mathSubject,UserNick:'原平台昵称'}:{userId:`computer-${state.openid}`,nickName:'原平台昵称'}};},
    mathRequest:async(path,input,platform)=>{
      invoke('math',{path,input,subject:platform.stuId});
      if(state.readError)throw Object.assign(new Error('source token rejected'),{status:state.readError});
      const p=input.data?.command?JSON.parse(input.data.data||'{}'):{...input.query,...input.data},command=input.data?.command;
      if(command==='GetUserInfoByStuID')return {code:0,SuccessResponse:true,data:[[{ID:11,StuID:`math-${state.openid}`,EBookIDs:'book-1',PaperIDs:'paper-1',AlbumIDs:'album-1',Tel:'private-phone',Pwd:'private-password'}]]};
      if(command==='GetRelQuestionLogMistakesOrFavoriteList')return {code:0,SuccessResponse:true,data:[[{ID:42,RelD:91,QuestionID:42,Type:p.Type,Content:`源笔记 v${state.version}`,BookID:3,AddTime:'2026-10-29T08:00:00Z',StuID:`math-${state.openid}`},...(state.extraNote?[{ID:42,RelD:92,QuestionID:42,Type:p.Type,Content:'同一题的另一条注释',BookID:3,AddTime:'2026-10-29T09:00:00Z'}]:[])],[],[]]};
      if(command==='GetUserCourseQrcodeBookListPager1')return {code:0,SuccessResponse:true,data:[[{ID:71,QuestionID:42,bookID:3,bookName:'来源资料',QuestionPage:1,QuestionSort:1,addTime:'2026-10-20T12:00:00Z',total:1}]]};
      if(command==='GetCatalogHistoryList')return {code:0,SuccessResponse:true,data:[[{ID:81,Name:'来源练习',IsFinish:1,Score:8,BusType:'数一',ExanType:'真题模式'}]]};
      if(command==='GetSysUserBookCatalog')return {code:0,SuccessResponse:true,data:[[]]};
      if(path==='/api/sys_user_book_question/GetListByPage')return {code:0,SuccessResponse:true,data:[{ID:91,QuestionID:42,Type:p.Type,Content:`源笔记 v${state.version}`,BookID:3}],count:1};
      return {code:0,SuccessResponse:true,data:[[]]};
    },
    computerRequest:async(path,input,platform)=>{
      invoke('computer',{path,input,subject:platform.user?.userId});
      const data={id:'source-record',collectExerciseId:'source-record',exerciseId:'question-42',exerciseNote:`源笔记 v${state.version}`,majorId:'701769479767592960',examCategory:1,examType:3,createDate:new Date().toISOString()};
      if(path.endsWith('/examinationRecord'))return {code:200,data:{list:[{id:`source-exam-${input.query?.pageNum||1}`,examinationId:'paper-1',examinationName:'来源考试',majorId:data.majorId,examCategory:1,examType:3,score:8,submitStatus:1}],total:state.reportPages,pages:state.reportPages}};
      if(path.endsWith('/examinationRecord/detail'))return {code:200,data:{examRecord:{id:'source-exam',examinationId:'paper-1',score:8},answerList:[{id:'source-answer',exerciseId:'question-42',answer:'A',score:2}]}};
      if(path.endsWith('/basic/progress/stat'))return {code:200,data:Array.from({length:state.progressRows},(_,i)=>({id:`chapter-${i+1}`,chapterId:`chapter-${i+1}`,correctNumber:1,totalNumber:5}))};
      if(path.endsWith('/answerRecord')||path.endsWith('/exerciseRecord'))return {code:200,data:[{id:'source-answer',exerciseId:'question-42',answer:'A',score:2,examRecordId:'source-exam'}]};
      if(state.emptyCollections&&path.endsWith('/collectExerciseList'))return {code:state.emptyCollectionCode,data:{list:null,total:0,pages:0}};
      return {code:200,data:{list:[data],total:1,pages:1}};
    },
  };
}
async function json(app,path,{status=200,...options}={}){
  const response=await app.request(path,options),value=await response.json();
  assert.equal(response.status,status,`${path}: ${JSON.stringify(value)}`);return value;
}
async function users(app){const admin=await app.setup();await app.createUser(admin,testLearner('sync.first',''));await app.createUser(admin,testLearner('sync.second',''));return {admin,a:await app.login('learning','sync.first','learner-password-123'),b:await app.login('learning','sync.second','learner-password-123')};}
const status=(app,auth)=>json(app,ROOT,{auth});
const configure=(app,auth,baseUrl='https://personal-source.example')=>json(app,`${ROOT}/connection`,{auth,method:'PUT',body:{baseUrl,apiKey:'personal-private-key'}});
const bind=(app,auth,ref='personal-a',extra={})=>json(app,`${ROOT}/binding`,{auth,body:{ref,...extra}});
const settings=(app,auth,enabled=true,scopes=SCOPES)=>json(app,`${ROOT}/settings`,{auth,method:'PUT',body:{enabled,scopes}});
const refresh=(app,auth,scope='notes',platform='math',extra={})=>json(app,`${ROOT}/refresh`,{auth,body:{platform,scope,page:1,pageSize:20,...extra}});
const records=(app,auth,scope='notes',platform='math')=>json(app,`${ROOT}/records?${new URLSearchParams({platform,scope})}`,{auth});
const math=(app,auth,input)=>json(app,'/api/learning/platform/math',{auth,body:input});
const command=(app,auth,name,params={})=>math(app,auth,{path:'/api/Master/AutoModel',method:'POST',data:{command:name,data:JSON.stringify(params)}});
const rows=value=>Array.isArray(value?.data?.[0])?value.data[0]:Array.isArray(value?.data)?value.data:value?.data?.list||[];

test('personal sync settings are independent of resources and never acquire a source on login or saving',async()=>{
  const f=sourceFixture(),app=await startHttpApp(f);
  try{
    const {admin,a}=await users(app);
    assert.equal((await status(app,a)).settings.enabled,false);
    assert.equal(f.calls.length,0);
    await configure(app,a);await settings(app,a,true,['favorites','notes']);
    assert.equal(f.calls.length,0,'saving a personal source and its switch does not read it');
    const resources=await json(app,'/api/admin/resource-sync',{auth:admin});assert.equal(resources.settings.enabled,false);
    await json(app,'/api/admin/resource-sync',{auth:admin,method:'PUT',body:{enabled:true,revision:resources.settings.revision}});
    assert.equal((await status(app,a)).settings.enabled,true);
    await settings(app,a,false,['favorites','notes']);
    assert.equal((await json(app,'/api/admin/resource-sync',{auth:admin})).settings.enabled,true);
    assert.equal(f.calls.length,0);
  }finally{await app.close();}
});

test('an associated personal account never replaces the system pool when a public resource is missing',async()=>{
  const f=sourceFixture(),personalDirectory=f.yybRequest,personalLogin=f.loginPlatform,personalMath=f.mathRequest;
  f.yybRequest=async(path,data,options,override)=>{
    if(override)return personalDirectory(path,data,options,override);
    f.calls.push({kind:'directory',path,override});
    return [{id:'system-pool-ref',openid:'wechat-system-pool',nickname:'系统公共来源',status:'alive'}];
  };
  f.loginPlatform=async(name,account,override)=>{
    if(override)return personalLogin(name,account,override);
    f.calls.push({kind:'login',name,ref:account.ref,override});
    return {connected:true,token:'system-pool-token',stuId:'math-system-pool',user:{ID:99,StuID:'math-system-pool'}};
  };
  f.mathRequest=async(path,input,platform)=>{
    if(path!=='/api/question_list/GetQuestionByQuestionNew')return personalMath(path,input,platform);
    f.calls.push({kind:'math',path,input,subject:platform.stuId});
    return {SuccessResponse:true,data:[{QuestionID:777,QuestionTitle:'系统账号池公共题目'}]};
  };
  const app=await startHttpApp(f);
  try{
    const {a}=await users(app);await configure(app,a);await bind(app,a);await settings(app,a);await refresh(app,a);
    const originalBinding=(await status(app,a)).binding,originalImports=(await records(app,a)).records;
    assert.equal(originalImports.length,1);
    const before=f.calls.length;
    const response=await math(app,a,{path:'/api/question_list/GetQuestionByQuestionNew',method:'GET',query:{ID:777}});
    assert.equal(response.data[0].QuestionTitle,'系统账号池公共题目');
    const publicCalls=f.calls.slice(before),directories=publicCalls.filter(call=>call.kind==='directory'),logins=publicCalls.filter(call=>call.kind==='login');
    assert.ok(directories.length>0);assert.ok(directories.every(call=>call.override===undefined));
    assert.ok(logins.some(call=>call.ref==='system-pool-ref'&&call.override===undefined));
    assert.equal(logins.some(call=>call.ref==='personal-a'),false);
    assert.equal(publicCalls.find(call=>call.kind==='math')?.subject,'math-system-pool');
    assert.deepEqual((await status(app,a)).binding,originalBinding);
    assert.deepEqual((await records(app,a)).records,originalImports);
  }finally{await app.close();}
});

test('personal preview does not persist; imports are idempotent, private and never disclose source credentials',async()=>{
  const f=sourceFixture(),app=await startHttpApp(f);
  try{
    const {a,b}=await users(app);await configure(app,a);await bind(app,a);await settings(app,a);
    const preview=await json(app,`${ROOT}/preview`,{auth:a,body:{platform:'math',scope:'notes',page:1,pageSize:20}});
    assert.ok(preview);assert.equal((await records(app,a)).records.length,0);
    const first=await refresh(app,a);assert.equal(first.added,1);
    const second=await refresh(app,a);assert.equal(second.added,0);assert.equal(second.unchanged,1);
    const imported=await records(app,a);assert.equal(imported.records.length,1);assert.equal((await records(app,b)).records.length,0);
    await refresh(app,a,'bookshelf');const bookshelf=await records(app,a,'bookshelf');
    const publicText=JSON.stringify({preview,imported,bookshelf,status:await status(app,a)});
    for(const secret of ['personal-private-key','source-token-math','private-phone','private-password'])assert.equal(publicText.includes(secret),false,`never expose ${secret}`);
    assert.equal((await json(app,'/api/learning/auth/session',{auth:a})).platforms.math.user.StuID,a.userId);
  }finally{await app.close();}
});

test('personal binding requires an explicit account and a real directory openid',async()=>{
  const f=sourceFixture(),app=await startHttpApp(f);
  try{
    const {a}=await users(app);await configure(app,a);
    await json(app,`${ROOT}/binding`,{auth:a,body:{},status:400});
    f.state.missingOpenid=true;
    const invalid=await app.request(`${ROOT}/binding`,{auth:a,body:{ref:'personal-a',openid:'spoofed-openid'}});
    assert.ok([400,409,502].includes(invalid.status));assert.equal((await status(app,a)).binding,null);
    assert.equal(f.calls.some(call=>call.kind==='login'),false,'do not log in an unidentifiable account');
  }finally{await app.close();}
});

test('refresh imports only the requested report page and exposes the continuation',async()=>{
  const f=sourceFixture(),app=await startHttpApp(f);f.state.reportPages=3;
  try{
    const {a}=await users(app);await configure(app,a);await bind(app,a);await settings(app,a);
    const before=f.calls.length,imported=await refresh(app,a,'reports','computer',{page:2,pageSize:1,context:{majorId:'701769479767592960',examType:3,examCategory:1}});
    const reportCalls=f.calls.slice(before).filter(call=>call.kind==='computer'&&call.path.endsWith('/examinationRecord'));
    assert.equal(reportCalls.length,1);assert.equal(Number(reportCalls[0].input.query.pageNum),2);
    assert.equal(imported.hasMore,true);assert.equal(imported.nextPage,3);assert.equal(imported.added,1);
    assert.equal(f.calls.slice(before).some(call=>call.path?.endsWith('/examinationRecord/detail')),false,'reading a list page does not prefetch report details');
  }finally{await app.close();}
});

test('different source relation records for the same question remain distinct after repeated imports',async()=>{
  const f=sourceFixture(),app=await startHttpApp(f);f.state.extraNote=true;
  try{
    const {a}=await users(app);await configure(app,a);await bind(app,a);await settings(app,a);
    const imported=await refresh(app,a);assert.equal(imported.added,2);
    const first=(await records(app,a)).records;assert.equal(first.length,2);
    const repeated=await refresh(app,a);assert.equal(repeated.added,0);assert.equal(repeated.unchanged,2);assert.equal((await records(app,a)).records.length,2);
  }finally{await app.close();}
});

test('two Web owners importing the same openid keep separate personal records and edits',async()=>{
  const f=sourceFixture(),app=await startHttpApp(f);
  try{
    const {a,b}=await users(app);
    for(const auth of [a,b]){await configure(app,auth);await bind(app,auth);await settings(app,auth);assert.equal((await refresh(app,auth)).added,1);}
    assert.equal((await records(app,a)).records.length,1);assert.equal((await records(app,b)).records.length,1);
    const first=rows(await command(app,a,'GetRelQuestionLogMistakesOrFavoriteList',{Type:'笔记'}))[0];
    await math(app,a,{path:'/api/sys_user_book_question/Inner_sys_user_book_question',method:'POST',data:{ID:first.ID,QuestionID:42,Type:'笔记',Content:'仅用户A的修改',UpdateColumns:'ID,Content'}});
    assert.equal(rows(await command(app,b,'GetRelQuestionLogMistakesOrFavoriteList',{Type:'笔记'}))[0].Content,'源笔记 v1');
  }finally{await app.close();}
});

test('a source without pagination still imports only the requested page of progress',async()=>{
  const f=sourceFixture(),app=await startHttpApp(f);f.state.progressRows=45;
  try{
    const {a}=await users(app);await configure(app,a);await bind(app,a);await settings(app,a);
    const first=await refresh(app,a,'progress','computer',{page:1,pageSize:20});assert.equal(first.added,20);assert.equal(first.hasMore,true);assert.equal(first.nextPage,2);
    const second=await refresh(app,a,'progress','computer',{page:2,pageSize:20});assert.equal(second.added,20);assert.equal((await records(app,a,'progress','computer')).pagination.total,40);
    const last=await refresh(app,a,'progress','computer',{page:3,pageSize:20});assert.equal(last.added,5);assert.equal(last.hasMore,false);
  }finally{await app.close();}
});

test('confirmed empty collection responses are empty imports while unrelated business errors are rejected',async()=>{
  const f=sourceFixture(),app=await startHttpApp(f);f.state.emptyCollections=true;
  try{
    const {a}=await users(app);await configure(app,a);await bind(app,a);await settings(app,a);
    const empty=await refresh(app,a,'favorites','computer');assert.equal(empty.status,'ready');assert.equal(empty.added,0);assert.equal(empty.count,0);
    f.state.emptyCollectionCode=4127;const rejected=await app.request(`${ROOT}/refresh`,{auth:a,body:{platform:'computer',scope:'favorites'}});assert.equal(rejected.status,502,'parameter errors are not classified as empty history');
  }finally{await app.close();}
});

test('personal source login and resource 401 failures cannot revoke the Web login',async()=>{
  const f=sourceFixture(),app=await startHttpApp(f);
  try{
    const {a}=await users(app);await configure(app,a);f.state.loginError=401;await bind(app,a);await settings(app,a);
    const failedLogin=await app.request(`${ROOT}/refresh`,{auth:a,body:{platform:'math',scope:'notes'}});assert.equal(failedLogin.status,502);assert.equal((await json(app,'/api/learning/auth/session',{auth:a})).authenticated,true);
    f.state.loginError=0;await bind(app,a);f.state.readError=401;
    const failedRead=await app.request(`${ROOT}/refresh`,{auth:a,body:{platform:'math',scope:'notes'}});assert.equal(failedRead.status,502);assert.equal((await json(app,'/api/learning/auth/session',{auth:a})).authenticated,true);
  }finally{await app.close();}
});

test('explicit relinking rechecks the true platform subject even when the openid and YYB route are unchanged',async()=>{
  const f=sourceFixture(),app=await startHttpApp(f);
  try{
    const {a}=await users(app);await configure(app,a);await bind(app,a);await settings(app,a);await refresh(app,a);
    f.state.mathSubject='another-real-math-subject';const before=f.calls.filter(call=>call.kind==='login'&&call.name==='math').length;
    const rebound=await bind(app,a);assert.ok(f.calls.filter(call=>call.kind==='login'&&call.name==='math').length>before,'explicit association does not reuse an old source login');
    assert.equal(rebound.binding.platforms.math.status,'unavailable');
    const blocked=await app.request(`${ROOT}/refresh`,{auth:a,body:{platform:'math',scope:'notes'}});assert.equal(blocked.status,409);assert.equal((await records(app,a)).records.length,1);
  }finally{await app.close();}
});

test('the same openid survives YYB endpoint and ref changes without duplicating imported records',async()=>{
  const f=sourceFixture(),app=await startHttpApp(f);
  try{
    const {a}=await users(app);await configure(app,a);await bind(app,a);await settings(app,a);await refresh(app,a);
    const before=await records(app,a);assert.equal(before.records.length,1);
    await configure(app,a,'https://other-personal-source.example');f.state.ref='different-ref';
    await bind(app,a,'different-ref');const repeated=await refresh(app,a);
    assert.equal(repeated.added,0);assert.equal((await records(app,a)).records.length,1);
    assert.ok(f.calls.some(call=>call.kind==='login'&&call.ref==='different-ref'&&call.override?.baseUrl==='https://other-personal-source.example'));
  }finally{await app.close();}
});

test('a personal association never silently changes openid or falls back to a system pool account',async()=>{
  const f=sourceFixture(),app=await startHttpApp(f);
  try{
    const {a}=await users(app);await configure(app,a);await bind(app,a);await settings(app,a);await refresh(app,a);
    f.state.openid='wechat-owner-b';
    const response=await app.request(`${ROOT}/refresh`,{auth:a,body:{platform:'math',scope:'notes'}});assert.ok([409,502].includes(response.status));
    assert.equal((await records(app,a)).records.length,1);
    await json(app,`${ROOT}/binding`,{auth:a,body:{ref:'personal-a'},status:409});
    await bind(app,a,'personal-a',{replace:true});
    assert.ok(f.calls.filter(call=>call.kind==='directory'||call.kind==='login').every(call=>call.override?.baseUrl==='https://personal-source.example'),'all personal access stays on the owner connection');
    assert.equal((await json(app,'/api/learning/auth/session',{auth:a})).authenticated,true);
  }finally{await app.close();}
});

test('disabled personal sync blocks refresh while imported data and Web sessions remain available',async()=>{
  const f=sourceFixture(),app=await startHttpApp(f);
  try{
    const {a}=await users(app);await configure(app,a);await bind(app,a);await settings(app,a);await refresh(app,a);await settings(app,a,false);
    const before=f.calls.length,response=await app.request(`${ROOT}/refresh`,{auth:a,body:{platform:'math',scope:'notes'}});assert.ok([409,403].includes(response.status));assert.equal(f.calls.length,before);
    assert.equal((await records(app,a)).records.length,1);
    await settings(app,a,true);f.state.offline=true;
    const failed=await app.request(`${ROOT}/refresh`,{auth:a,body:{platform:'math',scope:'notes'}});assert.ok([502,503,409].includes(failed.status));
    assert.equal((await records(app,a)).records.length,1);assert.equal((await json(app,'/api/learning/auth/session',{auth:a})).authenticated,true);
  }finally{await app.close();}
});

test('unlinking stops personal sync and keeps imported history owned by the Web user',async()=>{
  const f=sourceFixture(),app=await startHttpApp(f);
  try{
    const {a,b}=await users(app);await configure(app,a);await bind(app,a);await settings(app,a);await refresh(app,a);
    await json(app,`${ROOT}/binding`,{auth:a,method:'DELETE'});
    assert.equal((await status(app,a)).binding,null);assert.equal((await records(app,a)).records.length,1);assert.equal((await records(app,b)).records.length,0);
  }finally{await app.close();}
});

test('ordinary personal reads update the selected scope on demand and preserve local edits and removals',async()=>{
  const f=sourceFixture(),app=await startHttpApp(f);
  try{
    const {a}=await users(app);await configure(app,a);await bind(app,a);await settings(app,a);
    const initial=rows(await command(app,a,'GetRelQuestionLogMistakesOrFavoriteList',{Type:'笔记'}));
    const note=initial.find(row=>row.Content==='源笔记 v1');assert.ok(note,'entering the personal list imports only this scope');assert.ok(Number(note.ID)<0,'import identity does not collide with local record IDs');
    const afterRead=f.calls.length;
    await command(app,a,'GetRelQuestionLogMistakesOrFavoriteList',{Type:'笔记'});assert.equal(f.calls.length,afterRead,'immediate repeated reads use the local import');
    await math(app,a,{path:'/api/sys_user_book_question/Inner_sys_user_book_question',method:'POST',data:{ID:note.ID,QuestionID:42,Type:'笔记',Content:'Web 修改内容',UpdateColumns:'ID,Content'}});
    f.state.version=2;await refresh(app,a);
    assert.equal(rows(await command(app,a,'GetRelQuestionLogMistakesOrFavoriteList',{Type:'笔记'})).find(row=>String(row.ID)===String(note.ID))?.Content,'Web 修改内容');
    await math(app,a,{path:'/api/sys_user_book_question/Dels_sys_user_book_question',method:'POST',data:{ids:String(note.ID)}});
    await refresh(app,a);assert.equal(rows(await command(app,a,'GetRelQuestionLogMistakesOrFavoriteList',{Type:'笔记'})).some(row=>String(row.ID)===String(note.ID)),false);
  }finally{await app.close();}
});

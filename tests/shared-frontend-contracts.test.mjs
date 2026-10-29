import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {startHttpApp,testLearner} from './http-app.mjs';
import {loadBookNotes} from '../src/features/math/notebook/notebook-data.mjs';

async function moduleFrom(relative,replace){
  const source=await readFile(new URL(relative,import.meta.url),'utf8');
  const code=replace(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const frontend=await moduleFrom('../src/features/computer/api/computer.ts',code=>code.replace(/import \{ catalogResource, platformRequest, studyFetch \} from ['"]\.\.\/\.\.\/\.\.\/shared\/api\/client['"];?/,"const catalogResource=(_key,load)=>load();const platformRequest=(...args)=>globalThis.__sharedFrontendTransport(...args);const studyFetch=()=>{throw new Error('upload not in this case')};"));
globalThis.__sharedFrontendComputer=frontend;
const learning=await moduleFrom('../src/features/computer/practice/computer-learning.ts',code=>code.replace(/import \{([^}]+)\} from ['"]\.\.\/api\/computer['"];?/,(_,names)=>`const {${names}}=globalThis.__sharedFrontendComputer;`));
const q=(id,answer='A')=>({exerciseId:id,exerciseType:1,exerciseAnswer:answer,majorId:'major',chapterId:'chapter',questions:[{questionCode:'A',questionContent:'选项A'},{questionCode:'B',questionContent:'选项B'}]});
function fixture(){const sourceCalls=[];return {
  sourceCalls,
  yybRequest:async()=>[{id:'7',nickname:'共享账号',status:'alive'}],
  loginPlatform:async name=>({connected:true,token:'private-token',stuId:'source-student',user:name==='math'?{ID:10,StuID:'source-student'}:{userId:'source-user'}}),
  computerRequest:async(path,input)=>{
    sourceCalls.push({path,input});
    if(path.endsWith('/examination/group/list'))return {code:200,data:{lastExaminationGroupId:'source-private-group',groupList:[{id:'group',totalNumber:3,correctNumber:77,incorrectNumber:66,examRecordId:'source-private-record',score:88}]}};
    if(path.endsWith('/exerciseList')) {
      const number=Number(input.query?.number || 1),id=['first','second','third'][number-1],detail={exerciseStems:['第一题完整题干','第二题完整题干','第三题完整题干'][number-1],exerciseTotalScore:3};
      return {code:200,data:{examId:'source-exam',exerciseTotalNumber:3,examExerciseIdList:['first','second','third'],exercises:[q(id,number===2?'B':'A')],exerciseMap:{[id]:detail},examRecordId:'source-private',answers:[{answer:'source-private'}]}};
    }
    if(path.endsWith('/examExercise'))return {code:200,data:{examId:'source-exam',exercises:[q('first'),q('second','B'),q('third')],exerciseMap:{first:{exerciseStems:'第一题完整题干',exerciseTotalScore:3},second:{exerciseStems:'第二题完整题干',exerciseTotalScore:3},third:{exerciseStems:'第三题完整题干',exerciseTotalScore:3}},answers:[],examRecordId:'source-private'}};
    return {code:200,data:true};
  },
  mathRequest:async(path,input)=>{
    if(path.endsWith('/RelPaper')){assert.equal(input.data.StuID,'source-student');return {SuccessResponse:true,data:'888'};}
    if(path.endsWith('/GetPaper'))return {SuccessResponse:true,data:[{ID:899,QuestionID:'math-second',_question_list:{QuestionTitle:'第二道源题'}},{ID:898,QuestionID:'math-first',_question_list:{QuestionTitle:'第一道源题'}}]};
    return {SuccessResponse:true,data:[]};
  },
};}
async function client(app,admin,name){await app.createUser(admin,testLearner(name,'7'));const auth=await app.login('learning',name,'learner-password-123');return auth;}
function transport(app,auth){globalThis.__sharedFrontendTransport=async(name,input)=>{const response=await app.request(`/api/learning/platform/${name}`,{auth,body:input});const data=await response.json();if(!response.ok)throw new Error(data.error);return data;};}
const mathClient=(app,auth)=>{
  const send=async input=>{const response=await app.request('/api/learning/platform/math',{auth,body:input});const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;};
  return {get:(path,data)=>send({path,data}),post:(path,data)=>send({path,method:'POST',data}),command:(command,data)=>send({path:'/api/Master/AutoModel',method:'POST',data:{command,data:JSON.stringify(data)}})};
};

test('actual frontend adapters save sequential answers and render ordered reports, skips, metrics and review pages',async()=>{
  const f=fixture(),app=await startHttpApp(f);
  try{
    const admin=await app.setup(),auth=await client(app,admin,'contracts.practice');transport(app,auth);
    const freshGroups=await learning.computerLearningApi.groups('chapter');assert.equal(freshGroups.groupList[0].correctNumber,0);assert.equal(freshGroups.groupList[0].examRecordId,undefined);
    const launch=await learning.computerLearningApi.groupExercise({id:'major',examCategory:1},'chapter','group');
    const first=frontend.extractExercises(launch)[0];
    assert.equal(launch.exerciseTotalNumber,3);assert.deepEqual(launch.examExerciseIdList,['first','second','third']);
    assert.deepEqual(f.sourceCalls.filter(row=>row.path.endsWith('/exerciseList')).map(row=>Number(row.input.query.number)),[1]);
    assert.equal(f.sourceCalls.some(row=>row.path.endsWith('/examExercise')),false,'a current-question visit never loads the whole paper');
    const snapshot=(await app.app.locals.database.query(`SELECT data FROM ${app.app.locals.database.web('platform_records')} WHERE user_id=$1 AND collection='exams'`,[auth.userId])).rows[0].data;
    assert.equal(snapshot.questions.length,1);assert.equal(snapshot.exerciseTotalNumber,3);

    assert.equal(first.exerciseStems,'第一题完整题干');assert.equal(first.exerciseTotalScore,3);
    const start=Date.now()-10000,answer=(question,value,skip=false)=>frontend.buildComputerAnswer({question,answer:value,majorId:'major',chapterId:'chapter',examType:3,startedAt:start,endedAt:start+2000,skip});
    const one=answer(first,'A');
    const submit=async(answers,complete=false)=>frontend.computerRequest('/api/exam/wx/practice/submitExam',{},'POST',frontend.buildComputerSubmission({answers,examinationId:launch.examId,examType:3,startedAt:start,endedAt:start+10000,complete,examCategory:1}));
    await submit([one]);const ownGroups=await learning.computerLearningApi.groups('chapter');assert.equal(ownGroups.groupList[0].correctNumber,1);assert.equal(ownGroups.groupList[0].examRecordId,launch.examRecordId);await learning.computerLearningApi.saveSheetIndex(launch.examRecordId,2);
    const reopened=await learning.computerLearningApi.groupExercise({id:'major',examCategory:1},'chapter','group');
    assert.deepEqual(frontend.restoreComputerAnswers(reopened),{first:'A'});assert.equal(reopened.sheetIndex,2);
    const load=number=>frontend.computerRequest('/api/exam/wx/practice/exerciseList',{majorId:'major',chapterId:'chapter',examGroupId:'group',examExerciseType:1,examType:3,examCategory:1,number});
    const second=frontend.extractExercises(await load(2))[0];assert.equal(second.exerciseId,'second');
    const two=answer(second,'A');await submit([two]);
    const third=frontend.extractExercises(await load(3))[0],skip=answer(third,'',true);await submit([skip]);
    const continued=await load(1);assert.deepEqual(frontend.computerSkippedIds(continued),['third']);
    assert.deepEqual(f.sourceCalls.filter(row=>row.path.endsWith('/exerciseList')).map(row=>Number(row.input.query.number)),[1,2,3],'navigation reads only each newly visited question');
    assert.equal(f.sourceCalls.some(row=>row.path.endsWith('/examExercise')),false);
    const submitted=await submit([one,two,skip],true);
    const data=await learning.computerLearningApi.submittedReport({recordId:submitted.examRecordId,examinationId:launch.examId,majorId:'major',examType:3});
    const report=learning.normalizeComputerReport(data);
    assert.deepEqual(report.answers.map(row=>row.exerciseId),['first','second','third']);
    assert.equal(report.answers[0].exercise.exerciseStems,'第一题完整题干');assert.equal(report.score,3);assert.equal(report.correct,1);assert.equal(report.incorrect,1);assert.equal(report.unanswered,1);
    const review=learning.reportLaunch(data,'major');assert.equal(frontend.extractExercises(review.data)[1].exerciseStems,'第二题完整题干');
    const mistakes=await learning.computerLearningApi.reviewPage('mistakes',{majorId:'major',examCategory:1,dateFlag:1,pageNum:1,pageSize:1});
    assert.equal(mistakes.total,1);assert.equal(mistakes.pages,1);assert.equal(mistakes.list[0].incorrectNumber,1);
    assert.equal(mistakes.list[0].exerciseStems,'第二题完整题干');
    const stats=await frontend.computerRequest('/api/exam/wx/personal/exercise/stat');assert.equal(stats.answerTotal,2);assert.equal(stats.correctNumber,1);assert.equal(stats.accuracy,.5);
    const dates=await learning.computerLearningApi.dates('major',1,2);assert.equal(dates[1],1);
    const chapters=await learning.computerLearningApi.chapterCounts('major',1,'1');assert.equal(chapters[0].incorrectChapterNumber,1);
  }finally{await app.close();}
});

test('frontend paper extraction keeps exerciseMap details through a whole-paper submission and report playback',async()=>{
  const app=await startHttpApp(fixture());
  try{
    const admin=await app.setup(),auth=await client(app,admin,'contracts.paper');transport(app,auth);
    const data=await frontend.computerRequest('/api/exam/wx/practice/examExercise',{examId:'source-exam'}),questions=frontend.extractExercises(data),start=Date.now()-5000;
    const answers=questions.map(question=>frontend.buildComputerAnswer({question,answer:question.exerciseAnswer,majorId:'major',chapterId:'chapter',examType:1,startedAt:start,endedAt:start+1000}));
    const submission=frontend.buildComputerSubmission({answers,examinationId:data.examId,examType:1,startedAt:start,complete:true});
    const saved=await frontend.computerRequest('/api/exam/wx/practice/submitExam',{},'POST',submission),report=learning.normalizeComputerReport(await learning.computerLearningApi.report(saved.examRecordId));
    assert.equal(report.answers.length,3);assert.equal(report.score,9);assert.equal(report.answers[2].exercise.exerciseStems,'第三题完整题干');
    await learning.computerLearningApi.updateSubject({id:'major',name:'考研科目',examCategory:1});await learning.computerLearningApi.updateSubject({id:'major',name:'期末科目',examCategory:2});
    assert.equal(learning.normalizeComputerSubjects(await learning.computerLearningApi.subjects()).length,2);
    await learning.computerLearningApi.updateSubject({id:'major',examCategory:1},true);const subjects=learning.normalizeComputerSubjects(await learning.computerLearningApi.subjects());assert.equal(subjects.length,1);assert.equal(subjects[0].examCategory,2);
  }finally{await app.close();}
});

test('math notebook joins, category counts, bulk moves and practice order match actual frontend reads',async()=>{
  const app=await startHttpApp(fixture());
  try{
    const admin=await app.setup(),auth=await client(app,admin,'contracts.math'),api=mathClient(app,auth);
    const a=(await api.post('/api/sys_user_book_catalog/Inner_sys_user_book_catalog',{Name:'分类甲',Type:'用户笔记本',BusType:'笔记'})).data,b=(await api.post('/api/sys_user_book_catalog/Inner_sys_user_book_catalog',{Name:'分类乙',Type:'用户笔记本',BusType:'笔记'})).data;
    const note=(await api.post('/api/sys_user_book_question/Inner_sys_user_book_question',{QuestionID:'m',BookID:11,CatalogID:a,Type:'笔记',Content:'我的笔记'})).data;
    let catalogs=(await api.command('GetSysUserBookCatalog',{Type:'用户笔记本',BusType:'笔记'})).data[0];assert.equal(catalogs.find(row=>row.ID===a).counts,1);
    await api.post('/api/sys_user_book_catalog/InnerAll_sys_user_book_catalog',{Content:JSON.stringify([{ID:a,Sort:1},{ID:b,Sort:0}])});
    catalogs=(await api.command('GetSysUserBookCatalog',{Type:'用户笔记本',BusType:'笔记'})).data[0];assert.equal(catalogs.length,2);
    await api.post('/api/sys_user_book_question/Updatesys_user_book_question',{UpdateIds:String(note),CatalogID:b,UpdateColumns:'CatalogID'});
    const loaded=await loadBookNotes({get:api.get,command:api.command,stuid:'source-student',kind:'笔记',bookId:11,catalogId:b});assert.equal(loaded.data[0].length,1);assert.equal(loaded.data[0][0].Content,'我的笔记');
    const created=(await api.post('/api/choice_question_exercise/RelPaper',{CatalogID:18,BusType:'数一',Type:'精选10题'})).data.ID;
    const paper=()=>api.get('/api/choice_question_exercise/GetPaper',{ID:created});const before=(await paper()).data;
    assert.deepEqual(before.map(row=>row.QuestionID),['math-second','math-first']);
    await api.post('/api/choice_question_exercise_log/Inner_choice_question_exercise_log',{ID:before[0].ID,MyAnswer:'A',State:1});assert.deepEqual((await paper()).data.map(row=>row.QuestionID),['math-second','math-first']);
  }finally{await app.close();}
});

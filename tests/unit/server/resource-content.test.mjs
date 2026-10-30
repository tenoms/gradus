import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanMathPractice,contentRequest,groupRequest,normalizeMathPractice,observeContent,rebuildContent} from '../../../server/modules/resources/content.mjs';

const question={path:'/api/question_list/GetQuestionByQuestionNew',method:'GET',query:{ID:42},data:{}};
const practice={path:'/api/choice_question_exercise/RelPaper',method:'POST',query:{},data:{BusType:'数一',CatalogID:7,Type:'精选10题',ExanType:'真题模式'}};
const exercise=number=>({path:'/api/exam/wx/practice/exerciseList',method:'GET',data:{},query:{majorId:'major',chapterId:'chapter',examGroupId:'group',examExerciseType:1,number}});

test('semantic requests normalize actor and number transport values while preserving representation filters',()=>{
  assert.deepEqual(contentRequest('math',question),contentRequest('math',{...question,query:{ID:'42',StuID:'another',System_Station_ID:1,t:2}}));
  const sole={path:'/api/question_list/GetQuestionByIDSoleDes',query:{ID:42,SortDesc:'Sort'}};
  assert.deepEqual(contentRequest('math',sole),contentRequest('math',{...sole,query:{ID:'42'}}));
  assert.notEqual(contentRequest('math',sole).variant,contentRequest('math',{...sole,query:{ID:42,SortDesc:'Sort desc'}}).variant);
  const resolve={path:'/api/Master/AutoModel',method:'POST',data:{command:'GetQuestionInfoByResolve',data:JSON.stringify({QuestionID:42})}};
  assert.notEqual(contentRequest('math',sole).variant,contentRequest('math',resolve).variant);
  assert.equal(groupRequest('computer',exercise(1)).key,groupRequest('computer',exercise(2)).key);
  assert.notEqual(groupRequest('computer',exercise(1)).key,groupRequest('computer',{...exercise(1),query:{...exercise(1).query,examExerciseType:4}}).key);
  assert.notEqual(groupRequest('computer',{path:'/api/exam/wx/practice/examExercise',query:{examId:'paper'}}).key,groupRequest('computer',{path:'/api/exam/wx/practice/examExercise',query:{examId:'paper',examExerciseType:4}}).key);
  assert.deepEqual(normalizeMathPractice({...practice,data:{...practice.data,StuID:'source',System_Station_ID:1,t:2}}),{...practice,data:{BusType:'数一',CatalogID:'7',ExanType:'真题模式',Type:'精选10题'}});
  assert.notEqual(groupRequest('math',practice).key,groupRequest('math',{...practice,data:{...practice.data,CatalogID:8}}).key);
  assert.equal(normalizeMathPractice({...practice,data:{...practice.data,Type:'无限随机'}}),null);
});

test('outline references, course titles and analysis row IDs cannot become renderable questions',()=>{
  const catalog={kind:'math.catalog',request:{path:'/api/Master/AutoModel',data:{command:'GetQuestionNexts2',data:'{}'}}};
  assert.deepEqual(observeContent('math',catalog,{data:[[{ID:1,QuestionID:42,QuestionTitle:'第一题',Title:'短标题',QuestionSort:1}]]}).entities,[]);
  assert.deepEqual(observeContent('math',{kind:'math.courses',request:{path:'/api/c_course_list/GetListByPage'}},{data:[{ID:42,Title:'课程名'}]}).entities,[]);
  const analysis=observeContent('math',{kind:'math.analysis',request:{path:'/api/question_list/GetQuestionByIDSoleDes',query:{ID:42}}},{data:[{ID:900,QuestionID:42,Content:'解题解析'}]});
  assert.deepEqual(analysis.entities.map(row=>row.variant),['math.analysis.sole']);
  const full=observeContent('math',{kind:'math.question',request:question},{SuccessResponse:true,trace:'preserved',data:[{ID:42,QuestionTxt:'<p>求函数的导数。</p>',_book_list:{ID:7,Title:'书名'}}]});
  assert.equal(full.entities.length,1);assert.equal(full.entities[0].id,'42');
  assert.equal(full.entities[0].payload.question.QuestionTxt,'<p>求函数的导数。</p>');
  assert.equal(rebuildContent('math',contentRequest('math',question),full.entities[0].payload).trace,'preserved');
});

test('mathematics practice cleans relation identities and keeps nested real question bodies',()=>{
  const raw={SuccessResponse:true,data:[{ID:7001,QuestionID:42,ExerciseID:7000,sourceExerciseLogId:7001,MyAnswer:'source-answer',Answer:'source-mastery',State:2,Type:'题目',StuID:'source-user',_question_list:{ID:42,QuestionTxt:'完整正文',TypeAnswer:'A',Answer:'correct-answer',StuID:'source-user'}}]};
  const clean=cleanMathPractice(raw),row=clean.data[0];
  assert.equal(row.ID,undefined);assert.equal(row.QuestionID,42);assert.equal(row._question_list.ID,42);
  assert.equal(row._question_list.Answer,'correct-answer');
  assert.equal(/source-answer|source-mastery|source-user|7001|7000/.test(JSON.stringify(clean)),false);
  const observed=observeContent('math',{kind:'math.practice',request:normalizeMathPractice(practice)},clean);
  assert.equal(observed.entities[0].id,'42');assert.equal(observed.entities[0].payload.question.QuestionTxt,'完整正文');
  assert.deepEqual(observed.groups[0].ids,['42']);
  assert.equal(observed.groups[0].selector.data.Type,'精选10题');
  assert.equal(cleanMathPractice({data:[{ID:7001,QuestionTxt:'没有真实QuestionID的练习日志'}]}).data.length,0);
  assert.equal(cleanMathPractice({data:[...raw.data,{ID:7002,QuestionTxt:'缺少真实题号'}]}).data.length,0,'one malformed member cannot silently produce a smaller complete group');
});

test('math relation IDs and printed question numbers stay separate from canonical question identities',()=>{
  const catalog={kind:'math.catalog',request:{path:'/api/Master/AutoModel',data:{command:'GetQuestionNexts2',data:'{}'}}};
  const relation=observeContent('math',catalog,{data:[[{ID:411444,QuestionID:164731,QuestionImg:'https://media.example/question.png'}]]}).entities[0];
  assert.equal(relation.id,'164731');assert.equal(relation.payload.question.ID,164731,'a catalogue relation ID cannot leak into a question response');
  const direct=observeContent('math',{kind:'math.question',request:{...question,query:{ID:164731}}},{data:[{ID:164731,QuestionID:'2',QuestionTxt:'完整单题正文'}]}).entities[0];
  assert.equal(direct.id,'164731');assert.equal(direct.payload.question.ID,164731);assert.equal(direct.payload.question.QuestionID,'2','the printed number remains source data');
  const raw={data:[{ID:7001,QuestionID:164731,_question_list:{ID:164731,QuestionID:'2',QuestionTxt:'嵌套题干'}}]};
  const clean=cleanMathPractice(raw);
  assert.equal(clean.data[0].QuestionID,164731);assert.equal(clean.data[0]._question_list.QuestionID,'2');
  const nested=observeContent('math',{kind:'math.practice',request:normalizeMathPractice(practice)},clean).entities[0];
  assert.equal(nested.id,'164731');assert.equal(nested.payload.question.QuestionID,'2');
});

test('analysis row sets preserve their source envelope and keep their distinct representations',()=>{
  for(const [request,rows,expected]of [
    [{path:'/api/question_list/GetQuestionByIDSoleDes',query:{ID:42}},[{ID:901,Context:'第一种解法'},{ID:902,Context:'第二种解法'}],'math.analysis.sole'],
    [{path:'/api/Master/AutoModel',data:{command:'GetQuestionInfoByResolve',data:JSON.stringify({QuestionID:42})}},[{ID:801,Type:'题干',Content:'结构化题干'},{ID:802,Type:'选项',Content:'A',IsAnswer:1}],'math.analysis.resolve'],
  ]){
    const response={SuccessResponse:true,data:[rows],extra:'keep'};
    const observed=observeContent('math',{kind:'math.analysis',request},response);
    assert.deepEqual(observed.entities.map(row=>row.variant),[expected]);
    assert.deepEqual(rebuildContent('math',contentRequest('math',request),observed.entities[0].payload),response);
  }
});

test('computer content merges exerciseMap without losing choices and indexes only authoritative ordered group lists',()=>{
  const choices=[{questionCode:'A',questionContent:'选项A'}];
  const response={code:200,data:{examId:'paper',exerciseTotalNumber:2,examExerciseIdList:['q2','q1'],exercises:[{exerciseId:'q2',questions:choices}],exerciseMap:{q2:{exerciseStems:'完整题干',questions:null}},answers:[{answer:'private'}]}};
  const observed=observeContent('computer',{kind:'computer.question',request:exercise(1)},response);
  assert.deepEqual(observed.entities[0].payload.question.questions,choices);
  assert.deepEqual(observed.entities[0].payload.question.questionList,choices);
  assert.deepEqual(observed.groups.map(group=>group.ids),[['q2','q1']]);
  for(const data of [{...response.data,examExerciseIdList:undefined},{...response.data,exerciseTotalNumber:3},{...response.data,examExerciseIdList:['q2','q2']}])assert.equal(observeContent('computer',{kind:'computer.question',request:exercise(1)},{code:200,data}).groups.length,0);
  assert.equal(observeContent('computer',{kind:'computer.question',request:exercise(1)},{code:200,data:{exercises:[{exerciseId:'q2',exerciseTitle:'短标题'}]}}).entities.length,0);
});

test('only the trusted unfiltered whole-paper endpoint can derive membership from its complete ordered rows',()=>{
  const response={code:200,data:{exercises:[{exerciseId:'q2',applicationCode:2,exerciseStems:'第二题'},{exerciseId:'q1',applicationCode:1,exerciseStems:'第一题'}]}};
  const request={path:'/api/exam/wx/practice/examExercise',query:{examId:'paper'}};
  const observed=observeContent('computer',{kind:'computer.paper',request},response);
  assert.equal(observed.groups.length,1);assert.equal(observed.groups[0].key,'computer.paper:paper');
  assert.deepEqual(observed.groups[0].ids,['q1','q2']);
  assert.equal(observeContent('computer',{kind:'computer.paper',request:{...request,query:{examId:'paper',examExerciseType:4}}},response).groups.length,0);
  assert.equal(observeContent('computer',{kind:'computer.question',request:exercise(0)},response).groups.length,0);
  assert.equal(observeContent('computer',{kind:'computer.paper',request},{code:200,data:{...response.data,exerciseTotalNumber:3}}).groups.length,0);
  const filtered=observeContent('computer',{kind:'computer.paper',request:{...request,query:{examId:'paper',examExerciseType:4}}},{code:200,data:{...response.data,examExerciseIdList:['q1','q2'],exerciseTotalNumber:2}});
  assert.equal(filtered.groups.length,1);assert.notEqual(filtered.groups[0].key,'computer.paper:paper');
});

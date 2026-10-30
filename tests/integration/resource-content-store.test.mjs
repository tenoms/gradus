import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestDatabase} from '../support/database.mjs';
import {createResourceStore} from '../../server/modules/resources/store.mjs';
import {createResourceContentStore} from '../../server/modules/resources/content-store.mjs';
import {normalizeMathPractice} from '../../server/modules/resources/content.mjs';

const question=id=>({path:'/api/question_list/GetQuestionByQuestionNew',method:'GET',query:{ID:id},data:{}});
const exercise=number=>({path:'/api/exam/wx/practice/exerciseList',method:'GET',data:{},query:{majorId:'major',chapterId:'chapter',examGroupId:'group',examExerciseType:1,number}});
const selector=row=>({sourceId:row.sourceId,platform:row.platform,key:row.key,revision:row.revision});
async function setup(){const database=await createTestDatabase(),store=await createResourceStore(database),content=await createResourceContentStore(database);return {database,store,content};}

test('public content resolves across learning entries, updates from its latest origin and cascades on deletion',async()=>{
  const {database,store,content}=await setup();
  try{
    const source={id:'math-domain',platform:'math',scope:'public',accountRef:''};
    const request=normalizeMathPractice({path:'/api/choice_question_exercise/RelPaper',data:{CatalogID:7,BusType:'数一',Type:'章节模式',ExanType:'真题模式'}});
    const first=await store.save(source,{kind:'math.practice',scope:'public',request},{data:[{QuestionID:42,_question_list:{ID:42,QuestionTxt:'练习中的完整题干'}}]});
    const resolved=await content.resolve({sourceId:source.id,platform:'math',request:question('42')});
    assert.equal(resolved.response.data[0].QuestionTxt,'练习中的完整题干');
    assert.equal(await content.resolve({sourceId:'other-domain',platform:'math',request:question(42)}),null);
    const second=await store.save(source,{kind:'math.question',scope:'public',request:question(42)},{SuccessResponse:true,data:[{ID:42,QuestionTxt:'更新后的单题正文'}]});
    assert.equal((await content.resolve({sourceId:source.id,platform:'math',request:question(42)})).response.data[0].QuestionTxt,'更新后的单题正文');
    await store.invalidate(selector(second));
    assert.equal((await content.resolve({sourceId:source.id,platform:'math',request:question(42)})).expired,true);
    await store.remove({...selector(second),revision:second.revision+1});
    assert.equal((await content.resolve({sourceId:source.id,platform:'math',request:question(42)})).response.data[0].QuestionTxt,'练习中的完整题干');
    await store.update({...selector(first),response:{data:[{QuestionID:43,_question_list:{ID:43,QuestionTxt:'替换成另一题'}}]}});
    assert.equal(await content.resolve({sourceId:source.id,platform:'math',request:question(42)}),null);
    assert.equal((await content.resolve({sourceId:source.id,platform:'math',request:question(43)})).response.data[0].QuestionTxt,'替换成另一题');
  }finally{await database.close();}
});

test('catalogue relation IDs and direct printed numbers cannot misidentify a reused math question or practice',async()=>{
  const {database,store,content}=await setup();
  try{
    const source={id:'math-domain',platform:'math',scope:'public',accountRef:''};
    const catalog=await store.save(source,{kind:'math.catalog',scope:'public',request:{path:'/api/Master/AutoModel',method:'POST',query:{},data:{command:'GetQuestionNexts2',data:{BookID:7}}}},{data:[[{ID:411444,QuestionID:164731,QuestionImg:'https://media.example/original.png'}]]});
    const reused=await content.resolve({sourceId:source.id,platform:'math',request:question(164731)});
    assert.equal(reused.response.data[0].ID,164731);assert.equal(await content.resolve({sourceId:source.id,platform:'math',request:question(411444)}),null);
    const request=normalizeMathPractice({path:'/api/choice_question_exercise/RelPaper',data:{CatalogID:7,BusType:'数一',Type:'章节模式',ExanType:'真题模式'}});
    await store.save(source,{kind:'math.practice',scope:'public',request},{data:[{ID:7001,QuestionID:164731,_question_list:{ID:164731,QuestionID:'2',QuestionTxt:'最初练习正文'}}]});
    await store.invalidate(selector(catalog));
    const detail=await store.save(source,{kind:'math.question',scope:'public',request:question(164731)},{SuccessResponse:true,data:[{ID:164731,QuestionID:'2',QuestionTxt:'来源刷新后的完整正文'}]});
    const fresh=await content.resolve({sourceId:source.id,platform:'math',request:question(164731)});
    assert.equal(fresh.expired,false);assert.equal(fresh.key,detail.key);assert.equal(fresh.response.data[0].ID,164731);assert.equal(fresh.response.data[0].QuestionID,'2');
    assert.equal(await content.resolve({sourceId:source.id,platform:'math',request:question(2)}),null,'a printed number cannot create another canonical entity');
    const practice=await content.questions({sourceId:source.id,platform:'math',request});
    assert.deepEqual(practice.questionIds,['164731']);assert.equal(practice.questions[0].QuestionID,164731);
    assert.equal(practice.questions[0]._question_list.QuestionID,'2');assert.equal(practice.questions[0]._question_list.QuestionTxt,'来源刷新后的完整正文');
    assert.equal(practice.response.data[0].QuestionID,164731);assert.equal(practice.response.data[0]._question_list.QuestionID,'2');
  }finally{await database.close();}
});

test('authoritative manifests allow numbered reuse while complete papers require every ordered body',async()=>{
  const {database,store,content}=await setup();
  try{
    const source={id:'computer-domain',platform:'computer',scope:'public',accountRef:''};
    await store.save(source,{kind:'computer.question',scope:'public',request:exercise(1)},{code:200,data:{examId:'paper',exerciseTotalNumber:2,examExerciseIdList:['q2','q1'],exercises:[{exerciseId:'q2',exerciseStems:'原顺序第一题'}]}});
    const one=await content.questions({sourceId:source.id,platform:'computer',request:exercise(1)});
    assert.equal(one.questions[0].exerciseId,'q2');assert.equal(one.complete,false);assert.deepEqual(one.questionIds,['q2','q1']);
    assert.equal(await content.questions({sourceId:source.id,platform:'computer',request:exercise(0)}),null);
    assert.equal(await content.questions({sourceId:source.id,platform:'computer',request:exercise(2)}),null);
    assert.equal(await content.questions({sourceId:source.id,platform:'computer',request:{...exercise(1),query:{...exercise(1).query,examExerciseType:4}}}),null);
    const detailRequest={path:'/api/exam/wx/searchExercise/info/q1',method:'GET',query:{},data:{}};
    await store.save(source,{kind:'computer.question',scope:'public',request:detailRequest},{code:200,data:{exerciseId:'q1',exerciseStems:'从单题页面保存的第二题'}});
    const whole=await content.questions({sourceId:source.id,platform:'computer',request:exercise(0)});
    assert.equal(whole.complete,true);assert.deepEqual(whole.questions.map(row=>row.exerciseId),['q2','q1']);
    assert.deepEqual(whole.response.data.exercises.map(row=>row.exerciseId),['q2','q1']);
    assert.equal(await content.questions({sourceId:source.id,platform:'computer',request:{path:'/api/exam/wx/practice/examExercise',query:{examId:'paper'}}}),null,'a filtered practice manifest cannot claim to be the unfiltered paper');
    assert.equal((await content.resolve({sourceId:source.id,platform:'computer',request:{...detailRequest,path:'/api/exam/wx/searchExercise/info/q2'}})).response.data.exerciseStems,'原顺序第一题');
  }finally{await database.close();}
});

test('filtered subsets sharing an exam ID cannot impersonate the full paper, whose source rows establish their own order',async()=>{
  const {database,store,content}=await setup();
  try{
    const source={id:'computer-domain',platform:'computer',scope:'public',accountRef:''};
    const base={path:'/api/exam/wx/practice/examExercise',method:'GET',query:{examId:'paper'},data:{}};
    const filtered={...base,query:{examId:'paper',examExerciseType:4}};
    await store.save(source,{kind:'computer.paper',scope:'public',request:filtered},{code:200,data:{examId:'paper',exerciseTotalNumber:1,examExerciseIdList:['short'],exercises:[{exerciseId:'short',exerciseStems:'仅简答题'}]}});
    assert.equal((await content.questions({sourceId:source.id,platform:'computer',request:filtered})).total,1);
    assert.equal(await content.questions({sourceId:source.id,platform:'computer',request:base}),null);
    const full=await store.save(source,{kind:'computer.paper',scope:'public',request:base},{code:200,data:{examId:'paper',exercises:[{exerciseId:'short',applicationCode:2,exerciseStems:'仅简答题'},{exerciseId:'choice',applicationCode:1,exerciseStems:'完整卷内选择题'}]}});
    const paper=await content.questions({sourceId:source.id,platform:'computer',request:base});
    assert.equal(paper.complete,true);assert.deepEqual(paper.questionIds,['choice','short']);
    assert.deepEqual(paper.response.data.exercises.map(row=>row.exerciseId),['choice','short']);
    assert.equal((await content.questions({sourceId:source.id,platform:'computer',request:filtered})).total,1,'a full-paper response does not overwrite the filtered selector');
    await store.remove(selector(full));
    assert.equal(await content.questions({sourceId:source.id,platform:'computer',request:base}),null,'after removing the full source, the filtered subset cannot fill its place');
  }finally{await database.close();}
});

test('a changed authoritative manifest reports missing current content instead of endorsing an older numbered snapshot',async()=>{
  const {database,store,content}=await setup();
  try{
    const source={id:'computer-domain',platform:'computer',scope:'public',accountRef:''};
    const save=(number,ids,exerciseId)=>store.save(source,{kind:'computer.question',scope:'public',request:exercise(number)},{code:200,data:{examId:'paper',exerciseTotalNumber:ids.length,examExerciseIdList:ids,exercises:[{exerciseId,exerciseStems:`题干${exerciseId}`}]}});
    await save(1,['q1','q2'],'q1');await save(2,['q1','q2'],'q2');
    assert.equal((await content.questions({sourceId:source.id,platform:'computer',request:exercise(2)})).questions[0].exerciseId,'q2');
    await save(1,['q1','q3'],'q1');
    assert.equal(await content.questions({sourceId:source.id,platform:'computer',request:exercise(2)}),null);
    const missing=await content.questions({sourceId:source.id,platform:'computer',request:exercise(2),includeIncomplete:true});
    assert.equal(missing.missing,true);assert.equal(missing.complete,false);assert.deepEqual(missing.questionIds,['q1','q3']);assert.equal(missing.response,undefined);
    assert.equal((await content.questions({sourceId:source.id,platform:'computer',request:exercise(3),includeIncomplete:true})).missing,true,'a removed position also blocks fallback to a superseded numbered response');
    assert.equal(await content.questions({sourceId:'unknown-domain',platform:'computer',request:exercise(2),includeIncomplete:true}),null,'an absent manifest remains distinguishable from an incomplete known group');
  }finally{await database.close();}
});

test('scattered questions cannot create a group and nonpublic snapshots do not enter the public content index',async()=>{
  const {database,store,content}=await setup();
  try{
    const source={id:'computer-domain',platform:'computer',scope:'public',accountRef:''};
    await store.save(source,{kind:'computer.question',scope:'public',request:exercise(1)},{code:200,data:{examId:'paper',exercises:[{exerciseId:'q1',exerciseStems:'第一题'},{exerciseId:'q2',exerciseStems:'第二题'}]}});
    assert.equal(await content.questions({sourceId:source.id,platform:'computer',request:exercise(0)}),null);
    const privateSource={id:'private-domain',platform:'math',scope:'account',accountRef:'private-account'};
    await store.save(privateSource,{kind:'math.question',scope:'account',request:question(42)},{data:[{QuestionID:42,QuestionTxt:'账号私人正文'}]});
    assert.equal(await content.resolve({sourceId:privateSource.id,platform:'math',request:question(42)}),null);
    assert.equal((await database.query(`SELECT count(*)::integer AS count FROM ${database.upstream('resource_content')} WHERE source_id=$1`,[privateSource.id])).rows[0].count,0);
  }finally{await database.close();}
});

test('existing saved public snapshots gain semantic indexes locally without upstream reads',async()=>{
  const {database,store}=await setup();
  try{
    const source={id:'existing-domain',platform:'math',scope:'public',accountRef:''};
    const saved=await store.save(source,{kind:'math.question',scope:'public',request:question(42)},{data:[{QuestionID:42,QuestionTxt:'此前已保存的正文'}]});
    await database.query(`DELETE FROM ${database.upstream('resource_content')}`);
    const content=await createResourceContentStore(database);
    assert.equal((await content.resolve({sourceId:source.id,platform:'math',request:question(42)})).response.data[0].QuestionTxt,'此前已保存的正文');
    assert.equal((await store.detail(selector(saved))).revision,saved.revision,'local indexing does not change the saved resource revision');
  }finally{await database.close();}
});

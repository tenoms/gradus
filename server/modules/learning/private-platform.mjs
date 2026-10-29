import { mergeExerciseDetail } from '../resources/exercise-content.mjs';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../infrastructure/api-error.mjs';
import { mathParameters, sharedOperation, stripSharedPersonalState } from '../../integrations/shared-account-policy.mjs';
import { sourceForSession,resourceIdentity } from '../resources/catalog.mjs';

const unwrap = response => {let value=response?.data ?? response?.Data ?? response;if(typeof value==='string'){try{value=JSON.parse(value);}catch{}}return value;};
const success = (name, data) => name === 'math' ? { SuccessResponse: true, data, storage: 'web' } : { code: 200, data, storage: 'web' };
const ownKeys = data => Object.fromEntries(Object.entries(data).filter(([key]) => !['StuID','stuid','StuId','userId','UserID','UpdateColumns','System_Station_ID'].includes(key)));
const collectionFor = path => path.split('/')[2];
const records = value => Array.isArray(value) ? value : value?.list || value?.records || value?.exercises || value?.exerciseList || value?.questionList || value?.groupList || [];
function computerQuestions(response) {
  const data=unwrap(response),map=data?.exerciseMap || {};
  return records(data?.exercises || data?.exerciseList || data?.questionList || (data?.exerciseId?[data]:data)).map(row=>({...mergeExerciseDetail(row,map[row.exerciseId]),exerciseId:row.exerciseId || row.id}));
}
const dateBucket = value => {
  const day=86400000,offset=28800000,today=Math.floor((Date.now()+offset)/day),monday=today-((today+3)%7),created=Math.floor((Date.parse(value || '')+offset)/day);
  return Number.isFinite(created)?Math.min(4,Math.max(1,Math.floor((monday-created+6)/7)+1)):4;
};
const ownerDate = row => row.collectDate || row.incorrectDate || row.createDate || row.at || row.createdAt;
const pageQuery = p => {
  const page=Number(p.pageNum || 1),pageSize=Number(p.pageSize || 20);
  if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100) throw new ApiError('分页参数需为有效正整数，每页最多100条',400);
  return {page,pageSize};
};

/** JSONB rows carry the Web owner on every operation, independent of YYB assignment. */
export async function createPrivatePlatformStore({ database, resourceStore, personalSync }) {
  const table = database.web('platform_records');
  await database.query(`CREATE TABLE IF NOT EXISTS ${table} (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id text NOT NULL,platform text NOT NULL,collection text NOT NULL,record_key text NOT NULL,data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,platform,collection,record_key));
    CREATE INDEX IF NOT EXISTS platform_records_owner ON ${table}(user_id,platform,collection)`);
  const annotationCollections = ['sys_user_book_question','rel_question_log'];
  const aliases = (name,collection) => name==='math' && annotationCollections.includes(collection) ? annotationCollections : [collection];
  async function imported(userId,name,collection) {
    if(!personalSync)return [];
    const rows=await personalSync.records(userId,name,collection);
    const catalog= name==='math' && annotationCollections.includes(collection) ? await personalSync.records(userId,name,'sys_user_book_catalog') : [];
    const exams= name==='computer' && collection==='answers' ? await personalSync.records(userId,name,'exams') : [];
    const originalId=row=>row.data?.ID ?? row.data?.id ?? row.data?.examRecordId ?? row.data?.examinationRecordId ?? row.sourceRecordId;
    return rows.map(row=>{
      const id=Number(row._importId),data=row.data || {};
      const sourceMatch=(item,foreignId)=>item.openid===row.openid && String(originalId(item))===String(foreignId);
      return {...data,_key:`import:${id}`,_importId:id,_sourceRecordId:row.sourceRecordId,
        _imported:{id,openid:row.openid,scope:row.scope,importedAt:row.importedAt,sourceRecordId:row.sourceRecordId},
        ...(name==='math'?{ID:-id}:{id:`import:${id}`}),
        ...(name==='math' && catalog.some(item=>sourceMatch(item,data.CatalogID))?{CatalogID:-Number(catalog.find(item=>sourceMatch(item,data.CatalogID))._importId)}:{}),
        ...(name==='computer' && collection==='exams'?{submitted:true,importedReport:true}:{}),
        ...(name==='computer' && collection==='answers' && exams.some(item=>sourceMatch(item,data.examRecordId))?{examRecordId:`import:${exams.find(item=>sourceMatch(item,data.examRecordId))._importId}`}:{})};
    });
  }
  const setKey=(name,collection,row)=>name==='computer' && ['collection','mistakes'].includes(collection)?String(row.exerciseId || ''):
    name==='math' && annotationCollections.includes(collection) && ['收藏','错题'].includes(row.Type)?`${row.Type}:${row.QuestionID || ''}`:'';
  async function list(userId, name, collection) {
    const locals=(await database.query(`SELECT id,record_key,collection,data FROM ${table} WHERE user_id=$1 AND platform=$2 AND (collection=$3 OR (collection=ANY($4::text[]) AND data ? '_importId')) ORDER BY updated_at DESC,id DESC`, [userId,name,collection,aliases(name,collection)])).rows.map(row=>({...row.data,_key:row.data._key || row.record_key,ID:name==='math'?(row.data._importId?-Number(row.data._importId):Number(row.id)):row.data.ID,...(name==='computer'?{id:row.data._importId?`import:${row.data._importId}`:row.data.id || String(row.id)}:{})}));
    const source=await imported(userId,name,collection);
    if(collection==='profile') {
      if(!source.length)return locals;
      const merged=Object.assign({},...source.slice().reverse());
      const local=Object.assign({},...locals.slice().reverse());
      const profile={...merged,...local};
      for(const field of ['EBookIDs','PaperIDs','AlbumIDs']) {
        const removed=new Set(local._importShelfRemoved?.[field] || []);
        profile[field]=[...new Set([...source,...locals].flatMap(row=>String(row[field] || '').split(',').filter(Boolean)))].filter(id=>!removed.has(id)).join(',');
      }
      return [profile];
    }
    const byImport=new Map(locals.filter(row=>row._importId).reverse().map(row=>[Number(row._importId),row]));
    const represented=new Set();
    const combined=source.map(row=>{
      const overlay=byImport.get(row._importId) || locals.find(item=>setKey(name,collection,row) && setKey(name,collection,item)===setKey(name,collection,row));
      if(overlay)represented.add(overlay);
      return overlay?{...row,...overlay}:row;
    });
    return [...locals.filter(row=>!represented.has(row)),...combined];
  }
  async function put(userId,name,collection,key,data) {
    if(name==='math' && collection==='profile' && personalSync && ['EBookIDs','PaperIDs','AlbumIDs'].some(field=>Object.hasOwn(data,field))) {
      const previous=(await list(userId,name,collection))[0] || {},removed={...previous._importShelfRemoved};
      for(const field of ['EBookIDs','PaperIDs','AlbumIDs'])if(Object.hasOwn(data,field)) {
        const next=new Set(String(data[field] || '').split(',').filter(Boolean));
        removed[field]=[...new Set([...(removed[field] || []),...String(previous[field] || '').split(',').filter(id=>id&&!next.has(id))])].filter(id=>!next.has(id));
      }
      data={...data,_importShelfRemoved:removed};
    }
    if(String(key).startsWith('import:'))data={...data,_importId:Number(String(key).slice(7))};
    const result = await database.query(`INSERT INTO ${table} AS existing(user_id,platform,collection,record_key,data) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(user_id,platform,collection,record_key) DO UPDATE SET data=existing.data || excluded.data,updated_at=now() RETURNING id,data`, [userId,name,collection,String(key),JSON.stringify(ownKeys(data))]);
    const saved=result.rows[0].data,importId=saved._importId;
    return { ...saved, id: importId?`import:${importId}`:saved.id || String(result.rows[0].id), ID: importId?-Number(importId):Number(result.rows[0].id) };
  }
  async function remove(userId,name,collection,ids) {
    if (!ids.length) return;
    const keys=ids.map(String),rows=await list(userId,name,collection);
    const importedIds=rows.filter(row=>row._importId && [row._key,row.ID,row.id,row.exerciseId].some(value=>keys.includes(String(value)))).map(row=>`import:${row._importId}`);
    if(importedIds.length) {
      await personalSync.hide(userId,name,collection,importedIds);
      await database.query(`DELETE FROM ${table} WHERE user_id=$1 AND platform=$2 AND collection=ANY($3::text[]) AND ('import:' || (data->>'_importId'))=ANY($4::text[])`,[userId,name,aliases(name,collection),importedIds]);
    }
    await database.query(`DELETE FROM ${table} WHERE user_id=$1 AND platform=$2 AND collection=$3 AND (record_key=ANY($4::text[]) OR id::text=ANY($4::text[]))`, [userId,name,collection,ids.map(String)]);
  }
  async function profile(userId,name,baseUser,displayName) {
    const data = (await list(userId,name,'profile'))[0] || {};
    const identity = name === 'math' ? { ID: baseUser.ID, StuID: baseUser.StuID, UserNick: displayName || baseUser.UserNick || baseUser.nickName || '学习者', HeadImg: '', EBookIDs:'', PaperIDs:'', AlbumIDs:'', SubjectType:'', ChoiceType:'' }
      : { userId:baseUser.userId,nickName:displayName || baseUser.UserNick || baseUser.nickName || '学习者',previewUrl:'',modelInfo:0 };
    const { ID: localId, id, _importShelfRemoved, _importId, _imported, _sourceRecordId, _key, ...fields } = data;
    return { ...identity,...fields, ...(name === 'math' ? { ID: baseUser.ID, StuID:baseUser.StuID } : { userId:baseUser.userId }) };
  }
  async function rememberQuestions(userId,name,response,sourceId,input) {
    // A book outline contains question references, not visits to every question.
    if(name==='math'&&input?.data?.command==='GetQuestionNexts2')return;
    const found = new Map();
    const content=value=>['QuestionTxt','QuestionContent','QuestionTitle','QuestionImg','exerciseStems','exerciseTitle','exerciseProperty','exerciseAnswer','_question_list','questions','questionList'].some(field=>value[field]!==undefined&&value[field]!==null&&value[field]!=='');
    const remember=(id,value)=>{if(id&&content(value))found.set(String(id),{...found.get(String(id)),...stripSharedPersonalState(value)});};
    function walk(value) {
      if (Array.isArray(value)) { value.forEach(walk); return; }
      if (!value || typeof value !== 'object') return;
      const questionId = value.exerciseId || value.QuestionID || ((value.exerciseType || value.QuestionTitle || value.QuestionTxt || value.QuestionContent || value.QuestionImg || value.exerciseProperty) ? value.id || value.ID : undefined);
      remember(questionId,value);
      Object.values(value).forEach(walk);
    }
    walk(unwrap(response));
    if(name==='computer') for(const row of computerQuestions(response)) remember(row.exerciseId,row);
    if(!found.size)return;
    const items=[...found].map(([record_key,data])=>({record_key,data:ownKeys(data)}));
    await database.query(`INSERT INTO ${table} AS existing(user_id,platform,collection,record_key,data) SELECT $1,$2,$3,item.record_key,item.data FROM jsonb_to_recordset($4::jsonb) AS item(record_key text,data jsonb) ON CONFLICT(user_id,platform,collection,record_key) DO UPDATE SET data=existing.data || excluded.data,updated_at=now() WHERE NOT existing.data @> excluded.data`,[userId,name,`questions:${sourceId}`,JSON.stringify(items)]);
  }
  async function question(userId,name,id,sourceId,resourceContext) {
    const cached=(await database.query(`SELECT data FROM ${table} WHERE user_id=$1 AND platform=$2 AND collection=$3 AND record_key=$4`, [userId,name,`questions:${sourceId}`,String(id)])).rows[0]?.data;
    if (cached) return cached;
    const resourceSourceId=resourceContext?resourceIdentity(name,resourceContext.session,resourceContext.config,{path:name==='computer'?`/api/exam/wx/searchExercise/info/${encodeURIComponent(String(id))}`:'/api/question_list/GetQuestionByQuestionNew',method:'GET',data:{},query:name==='computer'?{}:{ID:id}}).source.id:sourceId;
    const entities=resourceStore?await resourceStore.findEntities({sourceId:resourceSourceId,platform:name,kind:'question',id:String(id),limit:1}):[];
    return entities[0]?.payload || { ...(name === 'computer' ? {exerciseId:id} : {QuestionID:id}) };
  }
  async function computer(userId,input,platform,sourceId,resourceContext) {
    const p = { ...input.query,...input.data }, path=input.path, action=path.split('/').at(-1);
    if (/\/user\/(?:detail|updateUserInfo|modelInfo\/update)$/.test(path)) {
      if (action !== 'detail') await put(userId,'computer','profile','profile',{...p,...(p.name ? {nickName:p.name} : {})});
      return success('computer',await profile(userId,'computer',platform.user || {}));
    }
    if (/\/(?:targetSchool|addTargetSchool)$/.test(path)) {
      if (action === 'addTargetSchool') await put(userId,'computer','target-school','target',p);
      return success('computer',(await list(userId,'computer','target-school'))[0] || {});
    }
    if (/\/(?:majorCustomList|addMajorCustom|deleteMajor)$/.test(path)) {
      if (action === 'addMajorCustom') await put(userId,'computer','majors',`${p.majorId}:${p.examCategory || 1}`,{...p,id:p.majorId,name:p.majorName});
      if (action === 'deleteMajor') await remove(userId,'computer','majors',[`${p.majorId}:${p.examCategory || 1}`]);
      return success('computer',action==='majorCustomList' ? await list(userId,'computer','majors') : true);
    }
    if (/\/(?:collectExercise|incorrectExercise|addExerciseNote)$/.test(path)) {
      const id=p.exerciseId || p.incorrectExerciseId || p.collectExerciseId;
      if (!id) throw new ApiError('缺少题目标识',400);
      const collection=action==='incorrectExercise'?'mistakes':'collection';
      if ((action==='collectExercise' && Number(p.collectFlag)===1) || (action==='incorrectExercise' && Number(p.flag)===2)) await remove(userId,'computer',collection,[id]);
      else {
        const previous=(await list(userId,'computer',collection)).find(row=>String(row.exerciseId)===String(id));
        const detail=await question(userId,'computer',id,sourceId,resourceContext);
        await put(userId,'computer',collection,id,{...detail,...previous,...p,exerciseId:String(id),examCategory:p.examCategory || previous?.examCategory || detail.examCategory || 1,createDate:previous?.createDate || new Date().toISOString(),...(collection==='collection'?{collectDate:previous?.collectDate || new Date().toISOString()}:{incorrectDate:new Date().toISOString(),incorrectNumber:previous?.incorrectNumber || 1})});
      }
      return success('computer',true);
    }
    if (/\/(?:submitExam|submit|exerciseRedo)$/.test(path) && (/\/random\/answer\/submit$/.test(path) || action==='submitExam' || action==='exerciseRedo')) {
      const answers=Array.isArray(p.answers)?p.answers:[p];
      let record=(await list(userId,'computer','exams')).find(row=>String(row.examinationId)===String(p.examinationId) && !row.submitted);
      const recordId=record?.id || randomUUID();
      const previousAnswers=(await list(userId,'computer','answers')).filter(row=>row.examRecordId===recordId);
      for (const answer of answers) {
        const id=answer.exerciseId;
        if (!id) throw new ApiError('作答数据缺少题目标识',400);
        const skipped=Number(answer.answerSource)===15 || Number(answer.answerType)===4;
        const saved={...answer,...(skipped?{answerType:4,score:0,answer:''}:{}),examCategory:p.examCategory || answer.examCategory || record?.examCategory || 1,exercise:await question(userId,'computer',id,sourceId,resourceContext),examRecordId:recordId,at:new Date().toISOString()};
        await put(userId,'computer','answers',`${recordId}:${id}`,saved);
        if (Number(saved.answerType)===2) {const previous=(await list(userId,'computer','mistakes')).find(row=>String(row.exerciseId)===String(id));await put(userId,'computer','mistakes',id,{...saved.exercise,...previous,...saved,exerciseId:String(id),createDate:previous?.createDate || saved.at,incorrectDate:saved.at,incorrectNumber:(Number(previous?.incorrectNumber)||0)+(previousAnswers.some(row=>String(row.exerciseId)===String(id) && Number(row.answerType)===2)?0:1)});}
      }
      const merged=(await list(userId,'computer','answers')).filter(answer=>answer.examRecordId===recordId);
      record=await put(userId,'computer','exams',recordId,{...record,...p,id:recordId,examinationId:p.examinationId || record?.examinationId,majorId:p.majorId || answers[0]?.majorId || record?.majorId,identifier:userId,submitted:Number(p.submitStatus)===1 || p.submitFlag===1 || p.isSubmit===1 || !!p.complete,answerCount:merged.length,correctCount:merged.filter(answer=>Number(answer.answerType)===1).length,createdAt:record?.createdAt || new Date().toISOString()});
      const score=merged.reduce((sum,row)=>sum+(Number(row.score)||0),0);
      record=await put(userId,'computer','exams',recordId,{score,aiScoreStatus:1,correctNumber:merged.filter(row=>Number(row.answerType)===1).length,inCorrectNumber:merged.filter(row=>Number(row.answerType)===2).length,exerciseTotalNumber:record.exerciseTotalNumber || record.questionIds?.length || record.questions?.length || merged.length});
      return success('computer',{examRecordId:recordId,score});
    }
    if (/\/submit\/sheet\/index$/.test(path)) {
      const record=(await list(userId,'computer','exams')).find(row=>row.id===p.examRecordId);
      if (!record) throw new ApiError('未找到本人的练习记录',404);
      await put(userId,'computer','exams',record.id,{sheetIndex:p.sheetIndex}); return success('computer',true);
    }
    if (/\/examination\/exercise\/reset$/.test(path)) {
      const ids=p.examRecordIdList || [];
      await remove(userId,'computer','exams',ids);
      const answers=await list(userId,'computer','answers');
      for (const row of answers.filter(row=>ids.includes(row.examRecordId))) await remove(userId,'computer','answers',[row.id]);
      return success('computer',true);
    }
    if (/\/examinationRecord\/detail$/.test(path)) {
      const exam=(await list(userId,'computer','exams')).find(row=>row.id===p.examRecordId);
      if (!exam) throw new ApiError('未找到本人的考试记录',404);
      const order=new Map((exam.questionIds || (exam.questions || []).map(row=>String(row.exerciseId || row.id))).map((id,index)=>[String(id),index]));
      const answers=(await list(userId,'computer','answers')).filter(row=>row.examRecordId===exam.id).sort((a,b)=>(order.get(String(a.exerciseId)) ?? Number.MAX_SAFE_INTEGER)-(order.get(String(b.exerciseId)) ?? Number.MAX_SAFE_INTEGER) || Number(a.startTime || 0)-Number(b.startTime || 0));
      return success('computer',{examRecord:exam,answerList:answers,exerciseMap:Object.fromEntries(answers.map(row=>[row.exerciseId,row.exercise])),examination:{id:exam.examinationId,examinationName:exam.examinationName || exam.examName || '答题报告'}});
    }
    if (/\/(?:exerciseRecord|answerRecord)$/.test(path)) return success('computer',(await list(userId,'computer','answers')).filter(row=>!p.examRecordId || row.examRecordId===p.examRecordId));
    if (/\/exercise\/stat$/.test(path)) { const answers=(await list(userId,'computer','answers')).filter(row=>Number(row.answerType)!==4),collections=await list(userId,'computer','collection'),mistakes=await list(userId,'computer','mistakes'),correct=answers.filter(row=>Number(row.answerType)===1).length; return success('computer',{identifier:userId,answerTotal:answers.length,correctNumber:correct,incorrectNumber:mistakes.length,collectNumber:collections.length,accuracy:answers.length?correct/answers.length:0,answerTime:answers.reduce((sum,row)=>sum+Math.max(0,(Number(row.endTime)-Number(row.startTime))/1000 || 0),0)}); }
    if (/\/basic\/progress\/stat$/.test(path)) return success('computer',await list(userId,'computer','progress'));
    if (/\/(?:collectExerciseList|incorrectExerciseList|examinationRecord)$/.test(path)) {
      const collection=action==='collectExerciseList'?'collection':action==='incorrectExerciseList'?'mistakes':'exams';
      let items=await list(userId,'computer',collection);
      for (const field of ['majorId','examCategory','examType','chapterId']) if (p[field] && p[field]!=='all') items=items.filter(row=>String(row[field] ?? (field==='examCategory'?1:''))===String(p[field]));
      if(collection!=='exams' && p.dateFlag) items=items.filter(row=>dateBucket(ownerDate(row))===Number(p.dateFlag));
      if(p.sort==='incorrect_number') items.sort((a,b)=>(Number(b.incorrectNumber)||0)-(Number(a.incorrectNumber)||0));
      const {page,pageSize}=pageQuery(p);
      return success('computer',{list:items.slice((page-1)*pageSize,page*pageSize),total:items.length,pageNum:page,pageSize,pages:Math.max(1,Math.ceil(items.length/pageSize))});
    }
    if (/\/countDiff(?:Date|Chapter)Exercise$/.test(path)) {
      const collection=action==='countDiffChapterExercise' || Number(p.itemFlag)===2?'mistakes':'collection';
      let items=(await list(userId,'computer',collection)).filter(row=>(!p.majorId || String(row.majorId)===String(p.majorId)) && (!p.examCategory || Number(row.examCategory || 1)===Number(p.examCategory)));
      if(action==='countDiffDateExercise') {const counts={1:0,2:0,3:0,4:0};for(const row of items)counts[dateBucket(ownerDate(row))]++;return success('computer',counts);}
      if(p.dateFlag)items=items.filter(row=>dateBucket(ownerDate(row))===Number(p.dateFlag));
      const counts=new Map();for(const row of items)counts.set(String(row.chapterId || ''),(counts.get(String(row.chapterId || ''))||0)+1);
      return success('computer',[...counts].map(([chapterId,incorrectChapterNumber])=>({chapterId,incorrectChapterNumber})));
    }
    if (sharedOperation('computer',input)==='write') {
      throw new ApiError('此操作尚未提供 Web 本地实现',409);
    }
    return success('computer',[]);
  }
  async function math(userId,input,platform,sourceId,readSource,config) {
    const p=mathParameters(input), path=input.path, command=input.data?.command || '', collection=collectionFor(path), action=path.split('/').at(-1);
    if (['GetUserInfoByStuID','GetUserInfoByWxID_pt','GetSysUserClientInfo'].includes(command)) return success('math',[[await profile(userId,'math',platform.user || {})]]);
    if (/\/sys_users\/(?:Inner_sys_users|UpdateUserNickName)$/.test(path)) { await put(userId,'math','profile','profile',p); return success('math',platform.user?.ID || 1); }
    if (collection==='choice_question_exercise' && /^RelPaper/.test(action)) {
      if(!readSource) throw new ApiError('当前学习请求无法读取题目，请稍后重试',503);
      const sourceInput={...input,data:{...input.data,StuID:platform.stuId || platform.user?.StuID,System_Station_ID:config?.math?.stationId || 1}};
      const created=await readSource(sourceInput),value=unwrap(created);
      if (created?.SuccessResponse===false) throw new ApiError(created.Message || '源平台未能提供练习题',502);
      const sourcePracticeId=value?.ID || value?.[0]?.ID || value?.[0]?.[0]?.ID || (typeof value==='number'?value:null);
      if (!sourcePracticeId) throw new ApiError('源平台未返回可读取的练习编号',502);
      const response=await readSource({path:'/api/choice_question_exercise/GetPaper',method:'GET',data:{},query:{ID:sourcePracticeId,StuID:platform.stuId || platform.user?.StuID}});
      if (response?.SuccessResponse===false) throw new ApiError(response.Message || '源平台题目读取失败',502);
      const rows=unwrap(response);
      const questions=(Array.isArray(rows?.[0])?rows[0]:Array.isArray(rows)?rows:[]).map(stripSharedPersonalState).map(row=>({...row,sourceExerciseLogId:row.ID}));
      if (!questions.length) throw new ApiError('源平台未返回本次练习的题目，请稍后重试',409);
      const practiceKey=randomUUID();
      const record=await put(userId,'math',collection,practiceKey,{...p,IsFinish:0,_key:practiceKey,sourceId,...(sourcePracticeId?{sourcePracticeId}:{})});
      const ids=[];
      for (const item of questions) { const answerKey=randomUUID();const answer=await put(userId,'math','choice_question_exercise_log',answerKey,{...item,_key:answerKey,QuestionID:item.QuestionID || item.ID,ExerciseID:record.ID,MyAnswer:'',State:0}); ids.push(answer.ID); }
      await put(userId,'math',collection,practiceKey,{...record,QuestionIDs:ids});
      return success('math',{ID:record.ID});
    }
    if (collection==='choice_question_exercise' && action==='GetPaper') {
      const record=(await list(userId,'math',collection)).find(row=>String(row.ID)===String(p.ID));
      if (!record) throw new ApiError('未找到本人的练习',404);
      const order=new Map((record.QuestionIDs || []).map((id,index)=>[String(id),index]));
      return success('math',(await list(userId,'math','choice_question_exercise_log')).filter(row=>String(row.ExerciseID)===String(record.ID)).sort((a,b)=>(order.get(String(a.ID))??0)-(order.get(String(b.ID))??0)));
    }
    if (collection==='choice_question_exercise' && action==='UpdateChoiceInfo') {
      const record=(await list(userId,'math',collection)).find(row=>String(row.ID)===String(p.ID || p.id));
      if (!record) throw new ApiError('未找到本人的练习',404);
      if(record._imported)throw new ApiError('这是小程序历史报告，请新建 Web 练习后作答',409);
      await put(userId,'math',collection,record._key,{IsFinish:Number(p.IsFinish)});
      if (Number(p.IsFinish)===0) for (const row of (await list(userId,'math','choice_question_exercise_log')).filter(row=>String(row.ExerciseID)===String(record.ID))) await put(userId,'math','choice_question_exercise_log',row._key,{MyAnswer:'',State:0});
      return success('math',true);
    }
    const commandCollections={GetRelQuestionLogMistakesOrFavoriteList:'rel_question_log',GetQuestionLogInfo_rel:'rel_question_log',GetQuestionLogInfo_rel2:'rel_question_log',GetSysUserBookCatalog:'sys_user_book_catalog',GetSysUserBookQuestionList:'sys_user_book_question',GetSysUserQuestionBookList:'sys_user_book_question',GetUserRecordListPager1:'sys_user_record',GetUserRecordListType:'sys_user_record',GetCatalogHistoryList:'choice_question_exercise',GetUserExtrapolationList:'quesiton_extrapolation_log',GetSysGiveAuto:'sys_give',GetSysGiveAutoLimit:'sys_give',GetUserFristScores_cscj:'first-score',GetBookListCountAndLookCount_LastTop3:'sys_user_record',GetBookListSysUserRecordPlan:'sys_user_record',GetUserLastViewByBook_math:'sys_user_record',GetUserCourseQrcodeBookListPager11:'sys_user_record',GetUserCourseQrcodeBookListPager1:'sys_user_record',GetUserCourseQrcodePhotoBookListPager1:'sys_user_record',GetUserCourseQrcodeBookList2:'sys_user_record',GeKstUserPaperInfo:'ks_user_paper',GetKsPaperQuestionAndksUserRecordListNew:'ks_user_record',GetDryAppliInfoStuID:'sys_users_dryrun_paperlog',GetUserCommentGiveList_lt:'sys_give'};
    if (command) {
      let rows=await list(userId,'math',commandCollections[command] || `command:${command}`);
      for (const field of ['QuestionID','Type','BusType','BusID','BookID','CatalogID','ExanType']) if (p[field]!==undefined && p[field]!=='') rows=rows.filter(row=>String(row[field] ?? (field==='CatalogID'?0:''))===String(p[field]));
      if (/^GetQuestionLogInfo_rel/.test(command)) { const annotations=rows.filter(row=>row.Type!=='题目'), answers=rows.filter(row=>row.Type==='题目'); return success('math',[[],[],[],[],annotations,answers]); }
      if(command==='GetSysUserBookCatalog') {const notes=await list(userId,'math','sys_user_book_question');rows=rows.map(row=>({...row,counts:notes.filter(note=>String(note.CatalogID)===String(row.ID)).length}));}
      if(command==='GetSysUserQuestionBookList') {const books=new Map();for(const note of rows){const key=String(note.BookID || 0);const previous=books.get(key);books.set(key,{BookID:note.BookID || 0,bookName:note.bookName || note.BookName || `资料 ${key}`,counts:(previous?.counts || 0)+1});}rows=[...books.values()];}
      if(p.Page!==undefined && p.PageSize!==undefined){const offset=Number(p.Page),size=Number(p.PageSize);if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(size)||size<1||size>1000)throw new ApiError('学习记录分页参数不正确',400);rows=rows.slice(offset,offset+size);}
      return success('math',[rows]);
    }
    if (sharedOperation('math',input)==='private') {
      let rows=await list(userId,'math',collection);
      for (const field of ['QuestionID','Type','BusType','BusID','BookID','CatalogID','ExanType']) if (p[field]!==undefined && p[field]!=='') rows=rows.filter(row=>String(row[field] ?? (field==='CatalogID'?0:''))===String(p[field]));
      const total=rows.length;if(p.page!==undefined || p.limit!==undefined){const page=Number(p.page || 1),limit=Number(p.limit || 20);if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(limit)||limit<1||limit>1000)throw new ApiError('分页参数不正确',400);rows=rows.slice((page-1)*limit,page*limit);}
      return {...success('math',rows),count:total};
    }
    const localCollections=new Set(['rel_question_log','sys_user_book_catalog','sys_user_book_question','sys_user_record','sys_users_info','sys_users_function_allocation','choice_question_exercise','choice_question_exercise_log','sys_users_dryrun_paperlog','sys_users_dryrun_questionlog','book_highscorealbum_studylog','question_files_give','sys_give','c_course_users_progress','c_course_users_record','c_course_product_log','c_paper_users_record','c_paper_student_record','c_paper_student','ks_user_record','ks_user_paper','quesiton_extrapolation_log','sys_msg_push']);
    if (!localCollections.has(collection)) throw new ApiError('此操作尚未提供 Web 本地实现',409);
    if(collection==='sys_user_book_question' && p.UpdateIds) {
      const ids=String(p.UpdateIds).split(',');
      for(const row of (await list(userId,'math',collection)).filter(row=>ids.includes(String(row.ID)))) await put(userId,'math',collection,row._key,{CatalogID:Number(p.CatalogID)||0});
      return success('math',true);
    }
    if (/^(?:Del|Dels)/i.test(action)) {
      await remove(userId,'math',collection,String(p.ids || p.ID || '').split(',').filter(Boolean)); return success('math',true);
    }
    if (/^(?:Submit|ResetSubmit)/i.test(action)) {
      const ids=String(p.ids || '').split(',');
      for (const row of (await list(userId,'math',collection)).filter(row=>ids.includes(String(row.ID)))) await put(userId,'math',collection,row._key || String(row.ID),{...row,IsSubmit:/^Reset/i.test(action)?0:1});
      return success('math',true);
    }
    if (/^InnerAll/i.test(action)) {
      let records; try { records=JSON.parse(p.Content || p.content || '[]'); } catch { throw new ApiError('批量记录格式不正确',400); }
      if (!Array.isArray(records)) throw new ApiError('批量记录格式不正确',400);
      const ids=[];
      const existing=await list(userId,'math',collection);
      for (const row of records) { const previous=row.ID?existing.find(item=>String(item.ID)===String(row.ID)):null;const key=previous?previous._key || String(previous.ID):row.ID && Number(row.ID)!==0?String(row.ID):[row.QuestionID || randomUUID(),row.Type || '',row.BusID || ''].join(':'); ids.push((await put(userId,'math',collection,key,{...row,_key:key})).ID); }
      return success('math',ids);
    }
    let key=p.ID && String(p.ID)!=='0'?String(p.ID):[p.QuestionID || p.BookID || p.CatalogID || randomUUID(),p.Type || '',p.BusID || ''].join(':');
    if (p.ID && String(p.ID)!=='0') {
      const existing=(await list(userId,'math',collection)).find(row=>String(row.ID)===String(p.ID));
      if (existing) key=existing._key || key;
      // Upstream IDs are resource identifiers for new local user state, never ownership keys.
    }
    const row=await put(userId,'math',collection,key,{...p,_key:key});
    return success('math',row.ID);
  }
  async function handle({userId,name,input,platform,invoke,displayName,session,config,resourceSync,readSource}) {
    const sourceId=resourceIdentity(name,session,config,{path:name==='math'?'/api/question_list/GetQuestionByQuestionNew':'/api/exam/wx/searchExercise/info/resource-domain',method:'GET',data:{},query:{}}).source.id;
    const operation=sharedOperation(name,input);
    if (operation!=='resource') {
      const result=await database.transaction(()=>name==='computer'?computer(userId,input,platform,sourceId,{session,config}):math(userId,input,platform,sourceId,readSource,config));
      return result;
    }
    if (name==='computer' && /\/practice\/(?:exerciseList|random\/exercise)$/.test(input.path)) {
      const params={...input.query,...input.data},filters={};
      for (const field of ['majorId','chapterId','examGroupId','examinationId','examType','examCategory','sectionId']) if (params[field]!==undefined && params[field]!=='') filters[field]=String(params[field]);
      const random=input.path.endsWith('/random/exercise'),launchKey=JSON.stringify({filters,random});
      let exam=(await list(userId,name,'exams')).find(row=>row.launchKey===launchKey && !row.submitted);
      const number=Number(params.number || 0);
      if (!Number.isSafeInteger(number) || number<0) throw new ApiError('题号格式不正确',400);
      let questions=exam?.questions || [],questionIds=exam?.questionIds || questions.map(row=>String(row.exerciseId || row.id));
      let total=Number(exam?.exerciseTotalNumber || questionIds.length || questions.length);
      const desiredId=number>0?questionIds[number-1]:null;
      const selectedKnown=number>0?questions.filter(row=>desiredId?String(row.exerciseId || row.id)===String(desiredId):Number(row._resourceOrder)===number-1):questions;
      const complete=!!exam?.completeQuestionSnapshot || (total>0 && questions.length>=total);
      if (!resourceSync?.ensureQuestions) throw new ApiError('当前学习请求无法读取题目，请稍后重试',503);
      // Every learning read checks the shared PostgreSQL resource first. An owned
      // snapshot can only fill an uncached request when resource saving is off.
      const fallbackResponse=exam && (number>0?selectedKnown.length:complete)
        ? {code:200,data:{examId:exam.examinationId,exerciseTotalNumber:total,examExerciseIdList:questionIds,exercises:selectedKnown}}
        : undefined;
      const result=await resourceSync.ensureQuestions({platform:name,session,config,request:input,onDemand:true,fallbackResponse});
      const body=unwrap(result.response),incoming=result.questions || computerQuestions(result.response);
      if (!incoming.length) throw new ApiError('源平台尚未提供当前练习的题目，请稍后重试',409);
      const returnedIds=result.questionIds?.length?result.questionIds:body?.examExerciseIdList || [];
      if(returnedIds.length)questionIds=returnedIds.map(id=>id===null || id===undefined?'':String(id));
      for(const [index,row] of incoming.entries()) {
        const id=String(row.exerciseId || row.id),position=questionIds.indexOf(id);
        const order=position>=0?position:number>0?number-1+index:index;
        incoming[index]={...filters,...row,_resourceOrder:order};
        if(!questionIds[order])questionIds[order]=id;
      }
      total=Math.max(Number(result.total || body?.exerciseTotalNumber || 0),questionIds.length,incoming.length);
      questions=[...new Map([...(number===0?[]:questions),...incoming].map(row=>[String(row.exerciseId || row.id),row])).values()].sort((a,b)=>Number(a._resourceOrder || 0)-Number(b._resourceOrder || 0));
      const id=exam?.id || randomUUID(),examinationId=exam?.examinationId || result.examId || body?.examId || incoming[0].examinationId || `web:${id}`;
      exam=await put(userId,name,'exams',id,{...exam,id,launchKey,...params,questions,questionIds,exerciseTotalNumber:total,completeQuestionSnapshot:number===0 && incoming.length>=total,sourceId,examinationId,submitted:false,identifier:userId,createdAt:exam?.createdAt || new Date().toISOString()});
      await rememberQuestions(userId,name,{data:incoming},sourceId);
      const answers=(await list(userId,name,'answers')).filter(row=>row.examRecordId===exam.id),collection=await list(userId,name,'collection');
      const selected=number>0?questions.filter(row=>String(row.exerciseId || row.id)===String(questionIds[number-1]) || (!questionIds[number-1] && Number(row._resourceOrder)===number-1)):questions;
      return success(name,{examId:exam.examinationId,examRecordId:exam.id,exerciseTotalNumber:total,examExerciseIdList:questionIds,exercises:selected,answers,answerList:answers,answerTotalNumber:answers.filter(row=>Number(row.answerType)!==4).length,skipExerciseIdList:answers.filter(row=>Number(row.answerType)===4).map(row=>row.exerciseId),collectExerciseId:collection.map(row=>row.exerciseId),sheetIndex:exam.sheetIndex || 1});
    }
    const response=await invoke();
    await rememberQuestions(userId,name,response,sourceId,input);
    const safe=stripSharedPersonalState(response);
    if(name==='computer' && input.path==='/api/exam/wx/practice/examination/group/list') {
      const data=unwrap(safe),groups=records(data),exams=await list(userId,name,'exams'),answers=await list(userId,name,'answers');
      for(const group of groups) {
        const exam=exams.find(row=>String(row.examGroupId)===String(group.groupId || group.id));
        const own=exam?answers.filter(row=>row.examRecordId===exam.id):[];
        Object.assign(group,{correctNumber:own.filter(row=>Number(row.answerType)===1).length,incorrectNumber:own.filter(row=>Number(row.answerType)===2).length});
        delete group.score;
        if(exam){group.examRecordId=exam.id;group.examinationRecordId=exam.id;}
      }
      if(data && typeof data==='object' && !Array.isArray(data))data.lastExaminationGroupId=exams.find(row=>row.examGroupId && !row.submitted)?.examGroupId || '';
    }
    if (name==='computer' && /\/(?:exerciseList|examExercise|random\/exercise|exercise)$/.test(input.path)) {
      const data=unwrap(safe);
      if (data && typeof data==='object' && !Array.isArray(data)) {
        data.answers=[]; data.answerList=[]; data.collectExerciseId=[];
        const params={...input.query,...input.data};
        const questions=computerQuestions(safe);
        const examinationId=data.examId || data.examinationId || params.examId || params.examinationId;
        let exam=(await list(userId,name,'exams')).find(row=>String(row.examinationId)===String(examinationId) && !row.submitted);
        if(!exam && examinationId && questions.length) {const id=randomUUID();exam=await put(userId,name,'exams',id,{id,sourceId,examinationId,questions,examinationName:data.examinationName || data.examName,submitted:false,createdAt:new Date().toISOString()});}
        if (exam) { data.examRecordId=exam.id; data.examId=examinationId;data.answers=(await list(userId,name,'answers')).filter(row=>row.examRecordId===exam.id); data.answerList=data.answers;data.skipExerciseIdList=data.answers.filter(row=>Number(row.answerType)===4).map(row=>row.exerciseId); }
        if(questions.length)data.exercises=questions;
        const saved=await list(userId,name,'collection'); data.collectExerciseId=saved.map(row=>row.exerciseId);
      }
    }
    return safe;
  }
  return { handle,profile,list,put,rememberQuestions };
}

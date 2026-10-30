import { createHash } from 'node:crypto';
import { mathParameters } from '../../integrations/shared-account-policy.mjs';
import { publicResourceResponse, resourceRows } from './catalog.mjs';
import { mergeExerciseDetail } from './exercise-content.mjs';

const identityField=/^(?:StuID|StuId|userId|UserID|SysUserID|OpenID|WxID|WeChatID|System_Station_ID|t|_t|timestamp)$/i;
const sourceField=/^(?:MyAnswer|myScore|answerList|answers|answerRecord|answerRecordId|examRecordId|examinationRecordId|identifier|collectExerciseId|skipExerciseIdList|sheetIndex|todayExaminationRecordNum|answerTotalNumber|lastAnswer|recordId|userAnswer|IsFavorite|IsMistake|IsLook|IsGive|State|sourceExerciseLogId|sourcePracticeId)$/i;
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):typeof value==='number'||typeof value==='boolean'?String(value):value;
const digest=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const id=value=>['number','string'].includes(typeof value)&&String(value).trim()!==''?String(value):null;
const meaningful=value=>typeof value==='string'&&(/<(?:img|svg|math)\b/i.test(value)||value.replace(/<[^>]*>/g,'').replace(/&(?:nbsp|#160|#x0*a0);/gi,' ').replace(/[\s\u200b\ufeff]/g,'').length>0);
const fields=(value,names)=>names.some(name=>meaningful(value?.[name]));
const cleanPublic=value=>publicResourceResponse((function clean(item){return Array.isArray(item)?item.map(clean):item&&typeof item==='object'?Object.fromEntries(Object.entries(item).filter(([key])=>!sourceField.test(key)).map(([key,nested])=>[key,clean(nested)])):item;})(value));
const parameters=request=>request?.data?.command?mathParameters(request):{...request?.query,...request?.data};
const modifiers=(params,omit=[])=>stable(Object.fromEntries(Object.entries(params).filter(([key])=>!identityField.test(key)&&!omit.includes(key))));
const variant=(base,options)=>Object.keys(options).length?`${base}:${digest(options)}`:base;
const mathBody=row=>fields(row,['QuestionTxt','QuestionContent','Content','QuestionImg','Title']);
const computerBody=row=>fields(row,['exerciseStems','stem']);

/** Identify content by question and representation; filters and sort order remain significant. */
export function contentRequest(platform,request) {
  const p=parameters(request),path=request?.path||'';
  if(platform==='math') {
    const base=path==='/api/question_list/GetQuestionByQuestionNew'?'math.question':path==='/api/question_list/GetQuestionByIDSoleDes'?'math.analysis.sole':/^\/api\/Master\/(?:AutoModel|Model)$/.test(path)&&request.data?.command==='GetQuestionInfoByResolve'?'math.analysis.resolve':null;
    const questionId=id(base==='math.analysis.resolve'?p.QuestionID:p.ID);
    if(!base||!questionId)return null;
    const options=modifiers(p,['ID','QuestionID',...(base==='math.analysis.sole'&&(!p.SortDesc||p.SortDesc==='Sort')?['SortDesc']:[])]);
    return {id:questionId,variant:variant(base,options),baseVariant:base,kind:base==='math.question'?'math.question':'math.analysis'};
  }
  const match=platform==='computer'&&path.match(/^\/api\/exam\/wx\/searchExercise\/info\/([^/]+)$/);
  if(!match)return null;
  let questionId;try{questionId=decodeURIComponent(match[1]);}catch{return null;}
  const options=modifiers(p);
  return {id:questionId,variant:variant('computer.question',options),baseVariant:'computer.question',kind:'computer.question'};
}

/** A selector denotes this saved exercise set, not all questions in its chapter. */
export function normalizeMathPractice(request) {
  if(request?.path!=='/api/choice_question_exercise/RelPaper')return null;
  const p=parameters(request);
  if(!['章节模式','精选10题'].includes(p.Type)||!['真题模式','非真题模式'].includes(p.ExanType))return null;
  if(!id(p.BusType)||!id(p.CatalogID))return null;
  return {path:request.path,method:'POST',query:{},data:modifiers(p)};
}

export function groupRequest(platform,request) {
  if(platform==='math') {
    const selector=normalizeMathPractice(request);
    return selector?{key:`math.practice:${digest(selector)}`,selector,kind:'math.practice'}:null;
  }
  if(platform!=='computer')return null;
  const p=parameters(request);
  if(request?.path==='/api/exam/wx/practice/exerciseList') {
    const selector={path:request.path,method:'GET',query:modifiers(p,['number']),data:{}};
    return {key:`computer.practice:${digest(selector)}`,selector,kind:'computer.paper'};
  }
  if(request?.path==='/api/exam/wx/practice/examExercise'&&id(p.examId))return {key:variant(`computer.paper:${id(p.examId)}`,modifiers(p,['examId'])),selector:{path:request.path,method:'GET',query:modifiers(p),data:{}},kind:'computer.paper'};
  return null;
}

function mathQuestion(row,directId) {
  const nested=row?._question_list,body=nested&&typeof nested==='object'?nested:row;
  if(!nested&&directId===null&&!(row?.QuestionID&&fields(row,['QuestionTxt','QuestionContent','QuestionImg'])))return null;
  // A relation's QuestionID references the question, whereas a full question's
  // QuestionID can be its printed book number. Request IDs and nested IDs win.
  const rawId=directId??(nested?body.ID??row.QuestionID??body.QuestionID:row.QuestionID),questionId=id(rawId);
  if(!questionId||!mathBody(body))return null;
  return {id:questionId,question:cleanPublic({...body,ID:id(body.ID)===questionId?body.ID:rawId,QuestionID:body.QuestionID??rawId})};
}

/** Drop source paper/log ownership; retain only actual question identities and content. */
export function cleanMathPractice(response) {
  const rows=resourceRows(response),questions=rows.map(row=>{
    const nested=row?._question_list,rawId=nested?.ID??row?.QuestionID??nested?.QuestionID,questionId=id(rawId);
    if(!questionId)return null;
    const safeBody=nested&&typeof nested==='object'?nested:Object.fromEntries(Object.entries(row).filter(([key])=>!['ID','ExerciseID','Answer','Type','_question_list'].includes(key)));
    const question=cleanPublic({...safeBody,ID:id(safeBody.ID)===questionId?safeBody.ID:rawId,QuestionID:safeBody.QuestionID??rawId});
    const metadata=Object.fromEntries(['BookID','CatalogID','QuestionPage','QuestionSort','TypeAnswer'].filter(key=>row[key]!==undefined).map(key=>[key,row[key]]));
    const own=mathBody(row)?cleanPublic(Object.fromEntries(Object.entries(row).filter(([key])=>!['ID','ExerciseID','Answer','Type','_question_list'].includes(key)))):{};
    return {...metadata,...own,QuestionID:rawId,_question_list:question};
  });
  // A malformed member cannot silently turn the rest into an authoritative set.
  return {SuccessResponse:true,data:questions.every(Boolean)?questions:[]};
}

/** Extract only renderable bodies. Outline references and titles are not question bodies. */
export function observeContent(platform,task,response) {
  const request=task.request,clean=cleanPublic(response),entities=new Map(),groups=[];
  const put=(questionId,contentVariant,payload)=>entities.set(`${contentVariant}:${questionId}`,{id:questionId,variant:contentVariant,payload});
  const descriptor=contentRequest(platform,request);
  if(platform==='math') {
    const rows=resourceRows(clean);
    if(descriptor?.baseVariant?.startsWith('math.analysis.')) {
      const valid=descriptor.baseVariant==='math.analysis.resolve'?rows.some(row=>fields(row,['Content','Images','Files'])):rows.some(row=>fields(row,['Context','Contexts','Content','Analysis','SoleDes','QuestionTxt','FileUrl','FilePath','VideoUrl','BusValue','PolyvVID','BusUrl'])||fields(row?._question_code,['Content']));
      if(valid)put(descriptor.id,descriptor.variant,{response:clean});
    }
    const walk=(value,direct=false)=>{
      if(Array.isArray(value)){value.forEach(item=>walk(item,direct));return;}
      if(!value||typeof value!=='object')return;
      const candidate=mathQuestion(value,direct&&descriptor?.baseVariant==='math.question'?parameters(request).ID:null);
      if(candidate) {
        const direct=descriptor?.baseVariant==='math.question'&&candidate.id===descriptor.id;
        put(candidate.id,direct?descriptor.variant:'math.question',{question:candidate.question,...(direct?{response:clean}:{})});
      }
      for(const [key,nested]of Object.entries(value))if(key!=='_question_list')walk(nested);
    };
    walk(rows,true);
    if(task.kind==='math.practice') {
      const group=groupRequest(platform,request),practice=cleanMathPractice(response),ids=practice.data.map(row=>id(row.QuestionID));
      if(group&&ids.length&&new Set(ids).size===ids.length)groups.push({...group,ids,examId:null,envelope:practice});
    }
  } else if(platform==='computer') {
    const data=clean?.data??clean?.Data??clean,rows=resourceRows(clean);
    if(!rows.length&&data?.exerciseId)rows.push(data);
    for(const row of rows) {
      const question=cleanPublic(mergeExerciseDetail(row,data?.exerciseMap?.[row.exerciseId])),questionId=id(question.exerciseId??question.id);
      if(!questionId||!computerBody(question))continue;
      const direct=descriptor?.id===questionId;
      put(questionId,direct?descriptor.variant:'computer.question',{question:{...question,exerciseId:question.exerciseId??questionId},...(direct?{response:clean}:{})});
    }
    const group=groupRequest(platform,request),p=parameters(request);
    const wholePaper=request.path==='/api/exam/wx/practice/examExercise'&&Object.keys(modifiers(p,['examId'])).length===0;
    // The source's fastExercise page consumes this unfiltered endpoint's entire
    // exercises array and orders it by applicationCode, without further paging.
    const wholeRows=wholePaper&&Array.isArray(data?.exercises)?[...data.exercises].sort((a,b)=>a.applicationCode-b.applicationCode):[];
    const suppliedIds=Array.isArray(data?.examExerciseIdList)&&data.examExerciseIdList.length?data.examExerciseIdList.map(id):null;
    const ids=suppliedIds||(wholePaper?wholeRows.map(row=>id(row.exerciseId??row.id)):null);
    const declaredTotal=data?.exerciseTotalNumber??data?.total,total=Number(declaredTotal??(wholePaper?wholeRows.length:NaN));
    const fullCountMatches=!wholePaper||declaredTotal===undefined||declaredTotal===null||Number(declaredTotal)===wholeRows.length;
    if(group&&fullCountMatches&&ids?.length&&ids.every(Boolean)&&new Set(ids).size===ids.length&&Number.isSafeInteger(total)&&total===ids.length) {
      const examId=id(data.examId??data.examinationId??parameters(request).examId);
      groups.push({...group,ids,examId,envelope:clean});
    }
  }
  return {entities:[...entities.values()],groups};
}

export function rebuildContent(platform,descriptor,payload) {
  if(payload.response)return structuredClone(payload.response);
  return platform==='math'?{SuccessResponse:true,data:[structuredClone(payload.question)]}:{code:200,data:structuredClone(payload.question)};
}

export function rebuildGroup(platform,group,questions) {
  if(platform==='math')return {SuccessResponse:true,data:questions.map(question=>question._question_list?structuredClone(question):{QuestionID:question.ID??question.QuestionID,_question_list:structuredClone(question)})};
  const envelope=structuredClone(group.envelope||{code:200}),field='Data' in envelope?'Data':'data';
  envelope[field]={...(envelope[field]||{}),examId:group.examId,exerciseTotalNumber:group.ids.length,examExerciseIdList:group.ids,exercises:structuredClone(questions),exerciseMap:Object.fromEntries(questions.map(question=>[String(question.exerciseId),structuredClone(question)]))};
  return envelope;
}

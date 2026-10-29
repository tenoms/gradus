import { ApiError } from './upstream.mjs';
import { stripSharedPersonalState } from './shared-account-policy.mjs';
import { publicPlatformResponse, injectMathUser } from './platform-policy.mjs';
import { sourceForSession,resourceManifest,resourceRows,inferResourceRequest,resourceIdentity,resourceKey,publicResourceResponse } from './resource-catalog.mjs';

function succeeded(response) {
  const code=response?.code??response?.Code,message=String(response?.Message||response?.msg||response?.Msg||'');
  return response?.SuccessResponse!==false && response?.success!==false && ![false,0,-1,'false','0','-1'].includes(response?.Resule) && !/失败|异常|无效|没有权限|无权限|权限不足|未登录|请先登录|错误|Exception|SqlClient|StackTrace/.test(message) && (code===undefined || code===null || code==='' || ['0','000','200'].includes(String(code)) || ['4104','4114'].includes(String(code))&&resourceRows(response).length===0);
}
const mixedRead=(platform,request)=>platform==='computer'&&['/api/exam/wx/practice/exerciseList','/api/exam/wx/practice/random/exercise'].includes(request.path) || platform==='math'&&request.path==='/api/choice_question_exercise/GetPaper';
const sourceState=/^(?:MyAnswer|myScore|answerList|answers|answerRecord|answerRecordId|examRecordId|identifier|collectExerciseId|skipExerciseIdList|sheetIndex|todayExaminationRecordNum|answerTotalNumber|lastAnswer|recordId|userAnswer|IsFavorite|IsMistake|IsLook|IsGive|State|StuID|userId)$/i;
function contentOnly(value) {
  if(Array.isArray(value))return value.map(contentOnly);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!sourceState.test(key)).map(([key,item])=>[key,contentOnly(item)]));
}
const publicContent=response=>stripSharedPersonalState(contentOnly(publicPlatformResponse(response)));

/** Resource persistence observes learning requests; it never schedules or discovers upstream work. */
export function createResourceSync({store,service,configuration,accountPool}) {
  let lastError='',lastCapturedAt=null;
  const sourceRequests=new Map(),resourceReads=new Map();
  const configNow=()=>configuration?.snapshot?.()||service.getConfig();
  const recordError=()=>{lastError='本次资源未能保存，将在下次访问时重新同步';};
  async function status(){return {...await store.status(),mode:'learning',lastError,lastCapturedAt,manifest:resourceManifest()};}
  async function updateSettings(input){await store.updateSettings(input);return status();}
  const sourceSession=(session,platform)=>({...session,...(session.resourceSources?.[platform]||{})});
  async function capture({platform,session,config=configNow(),request,response}) {
    try {
      if(!(await store.getSettings()).enabled || !succeeded(response))return {captured:false};
      const identity=resourceIdentity(platform,sourceSession(session,platform),config,request);
      if(identity.scope==='excluded')return {captured:false};
      const observation=inferResourceRequest(platform,identity.request);
      const number=Number({...request.query,...request.data}.number||0);
      if(number>0)observation.context._resourceOrder=number-1;
      const clean=identity.scope==='public'?publicResourceResponse(response):mixedRead(platform,request)?publicContent(response):publicPlatformResponse(response);
      const resource=await store.save(identity.source,{...observation,scope:identity.scope},clean,{scope:identity.scope});
      lastCapturedAt=new Date().toISOString();lastError='';
      return {captured:true,resource};
    } catch {recordError();return {captured:false,error:lastError};}
  }
  async function peek({platform,session,config=configNow(),request}) {
    const identity=resourceIdentity(platform,sourceSession(session,platform),config,request);
    if(identity.scope!=='public')return {state:'bypass',identity};
    try {
      const resource=await store.lookup(identity.source.id,platform,identity.request);
      return {state:!resource?'miss':resource.expired?'stale':'hit',identity,resource};
    } catch {recordError();return {state:'miss',identity};}
  }
  async function lookup(args) {
    const cached=await peek(args);
    return cached.state==='hit'?{...cached.resource,response:publicResourceResponse(cached.resource.response)}:null;
  }
  async function inRead(key,work) {
    if(resourceReads.has(key))return resourceReads.get(key);
    const pending=work();resourceReads.set(key,pending);
    try{return await pending;}finally{if(resourceReads.get(key)===pending)resourceReads.delete(key);}
  }
  async function read(args) {
    const cached=await peek(args);
    if(cached.state==='hit')return publicResourceResponse(cached.resource.response);
    const load=async()=>{
      const current=await peek(args);
      if(current.state==='hit')return publicResourceResponse(current.resource.response);
      const response=await args.load();
      await capture({...args,response});
      return current.identity.scope==='public'?publicResourceResponse(response):response;
    };
    return cached.identity.scope==='public'?inRead(`response:${cached.identity.source.id}:${resourceKey(cached.identity.request)}`,load):load();
  }
  async function acquire(session,name,{force=false,invalidToken}={}) {
    if(accountPool?.acquireSource && session.user?.id) {
      const source=await accountPool.acquireSource(session.user.id,name,{force,invalidToken});
      session.resourceSources ||= {};session.resourceSources[name]=source;
      return source;
    }
    // Standalone adapters may provide an explicit source state without a Web router.
    return {account:session.account,platformState:session.platforms?.[name],yybMode:session.yybMode,yybBaseUrl:session.yybBaseUrl};
  }
  async function requestSource({session,name,path,input,source}) {
    source ||= await acquire(session,name);
    const call=()=>{
      if(!source.platformState)throw new ApiError('所需资源暂时没有可用来源，请稍后重试',503);
      const request=name==='math'?injectMathUser(input,source.platformState,configNow().math.stationId):input;
      return service[name==='math'?'mathRequest':'computerRequest'](path,request,source.platformState);
    };
    try {
      let response=await call();
      if(![response?.code,response?.Code,response?.statusCode].some(code=>Number(code)===401))return response;
    }catch(error){if(error.status!==401){if(!Number.isInteger(error.status)||error.status>=500&&![502,503].includes(error.status))throw new ApiError('资源来源暂时不可用，请稍后重试',502);throw error;}}
    try {
      Object.assign(source,await acquire(session,name,{force:true,invalidToken:source.platformState?.token}));
      const response=await call();
      if([response?.code,response?.Code,response?.statusCode].some(code=>Number(code)===401))throw new ApiError('来源授权暂时不可用',502);
      return response;
    }catch(error){throw new ApiError(error.status===503?error.message:'资源来源暂时不可用，请稍后重试',error.status===503?503:502);}
  }
  // A source's group-selection cache must stay paired with that learner's current read.
  async function inSource(sourceId,work) {
    const next=(sourceRequests.get(sourceId)||Promise.resolve()).catch(()=>{}).then(work);
    sourceRequests.set(sourceId,next);
    try{return await next;}finally{if(sourceRequests.get(sourceId)===next)sourceRequests.delete(sourceId);}
  }
  async function ensureQuestions({platform,session,config=configNow(),request,fallbackResponse}) {
    if(platform!=='computer'||!mixedRead(platform,request))return {imported:false};
    const args={platform,session,config,request},query={...request.query,...request.data},number=Number(query.number||0);
    const current={...request,method:'GET',data:{},query};
    const result=(response,cacheState,persisted=false)=>{
      const clean=publicResourceResponse(publicContent(response)),data=clean?.data??clean?.Data??clean;
      const returned=resourceRows(clean);
      if(!returned.length&&data?.exerciseId)returned.push(data);
      const questions=returned.map((row,index)=>{const detail=data?.exerciseMap?.[row.exerciseId];return {...query,...row,...(detail||{}),_resourceOrder:(number>0?number-1:0)+index,...(detail?.questions?{questionList:detail.questions}:{})};});
      const questionIds=(Array.isArray(data?.examExerciseIdList)?data.examExerciseIdList:questions.map(row=>row.exerciseId||row.id)).map(String);
      const total=Number(data?.exerciseTotalNumber??data?.total??questionIds.length);
      return {imported:true,persisted,cacheState,questions,total,questionIds,examId:data?.examId??data?.examinationId,response:clean};
    };
    const cached=await peek(args);
    if(cached.state==='hit')return result(cached.resource.response,'hit',true);
    const load=async()=>{
      const latest=await peek(args);
      if(latest.state==='hit')return result(latest.resource.response,'hit',true);
      if(latest.state==='miss'&&fallbackResponse&&!(await store.getSettings()).enabled)return result(fallbackResponse,'miss');
      const source=await acquire(session,platform);
      return inSource(sourceForSession(platform,{...session,...source},config).id,async()=>{
        if(query.examGroupId) {
          const prepared=await requestSource({session,name:platform,path:'/api/exam/wx/practice/cache/examination/group',input:{method:'POST',query:{groupId:query.examGroupId},data:{}},source});
          if(!succeeded(prepared))throw new ApiError('源章节组缓存准备失败',502);
        }
        let response=await requestSource({session,name:platform,path:current.path,input:current,source});
        // Only a whole-paper learning action may request its complete content.
        if(!succeeded(response)&&!number&&current.path.endsWith('/exerciseList')) {
          const first=await requestSource({session,name:platform,path:current.path,input:{...current,query:{...query,number:1}},source});
          const firstData=first?.data??first?.Data;
          if(!succeeded(first)||!firstData?.examId)throw new ApiError('源平台未能返回当前试卷',502);
          response=await requestSource({session,name:platform,path:'/api/exam/wx/practice/examExercise',input:{method:'GET',query:{examId:firstData.examId},data:{}},source});
        }
        if(!succeeded(response))throw new ApiError(`上游业务未成功（${response?.code??response?.Code??'无业务码'}）`,502);
        const saved=await capture({...args,request:current,response});
        return result(response,latest.state,saved.captured);
      });
    };
    return cached.identity.scope==='public'?inRead(`questions:${cached.identity.source.id}:${resourceKey(cached.identity.request)}`,load):load();
  }
  return {status,updateSettings,capture,peek,lookup,read,requestSource,ensureQuestions,findEntities:options=>store.findEntities(options),list:options=>store.list(options)};
}

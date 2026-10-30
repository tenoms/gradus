import { mergeExerciseDetail } from './exercise-content.mjs';
import { ApiError } from '../../infrastructure/api-error.mjs';
import { stripSharedPersonalState } from '../../integrations/shared-account-policy.mjs';
import { publicPlatformResponse, injectMathUser } from '../../integrations/platform-policy.mjs';
import { sourceForSession,resourceManifest,resourceRows,inferResourceRequest,resourceIdentity,resourceKey,publicResourceResponse } from './catalog.mjs';
import { cleanMathPractice, contentRequest, normalizeMathPractice } from './content.mjs';
import { isCoursePlaybackRequest, playbackUrl } from './playback.mjs';

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
const hasContent=value=>Array.isArray(value)?value.some(hasContent):value&&typeof value==='object'?Object.values(value).some(hasContent):typeof value==='string'?value.trim().length>0:typeof value==='number'||value===true;
const stableContentKind=/^(?:math\.(?:question|questions|analysis)|computer\.(?:question|paper))$/;

/** Learning requests alone discover resources; saved public content stays readable during revalidation. */
export function createResourceSync({store,service,configuration,accountPool}) {
  let lastError='',lastCapturedAt=null;
  const sourceRequests=new Map(),resourceReads=new Map(),refreshes=new Map();
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
    const playback=isCoursePlaybackRequest(platform,request);
    if(identity.scope!=='public'&&!playback)return {state:'bypass',identity};
    try {
      if(playback) {
        const resource=await store.findPlayback?.({config,request});
        return resource && playbackUrl(resource.response)?{state:'hit',identity,resource}:{state:'miss',identity};
      }
      const content=await store.resolveContent?.({sourceId:identity.source.id,platform,request:identity.request});
      if(content?.missing)return {state:'miss',identity,missingContent:true};
      const resource=content || await store.lookup(identity.source.id,platform,identity.request);
      return {state:!resource?'miss':resource.expired?'stale':'hit',identity,resource};
    } catch {recordError();return {state:'miss',identity};}
  }
  async function lookup(args) {
    const cached=await peek(args);
    return cached.resource?{...cached.resource,response:publicResourceResponse(cached.resource.response)}:null;
  }
  async function inRead(key,work) {
    if(resourceReads.has(key))return resourceReads.get(key);
    const pending=work();resourceReads.set(key,pending);
    try{return await pending;}finally{if(resourceReads.get(key)===pending)resourceReads.delete(key);}
  }
  function refresh(key,work) {
    if(refreshes.has(key))return;
    const pending=(async()=>{
      try {
        if(!(await store.getSettings()).enabled)return;
        await work();
      } catch {lastError='资源更新暂未完成，已保存内容仍可使用';}
    })();
    refreshes.set(key,pending);
    void pending.finally(()=>{if(refreshes.get(key)===pending)refreshes.delete(key);});
  }
  async function waitForIdle() {
    while(refreshes.size)await Promise.all([...refreshes.values()]);
  }
  async function read(args) {
    const config=args.config||configNow(),identity=resourceIdentity(args.platform,sourceSession(args.session,args.platform),config,args.request);
    const playback=isCoursePlaybackRequest(args.platform,args.request);
    const content=identity.scope==='public'?contentRequest(args.platform,identity.request):null;
    const key=content?`content:${identity.source.id}:${content.variant}:${content.id}`:`response:${identity.source.id}:${resourceKey(identity.request)}`;
    const fetch=async previous=>{
      const response=await args.load();
      if((identity.scope==='public'||playback)&&!succeeded(response))throw new ApiError('资源暂时无法更新，请稍后重试',502);
      if(playback&&!playbackUrl(response))throw new ApiError('视频地址暂时无法取得，请稍后重试',502);
      if(previous&&stableContentKind.test(previous.kind||inferResourceRequest(args.platform,identity.request).kind)) {
        const body=response?.data??response?.Data;
        if(!hasContent(body)||(resourceRows(previous.response).length>0&&!resourceRows(response).length))
          throw new ApiError('本次未取得资源正文，已保存内容保持不变',502);
      }
      await capture({...args,config,response});
      return identity.scope==='public'?publicResourceResponse(response):response;
    };
    const load=async()=>{
      const current=playback && args.request.refresh?{state:'miss'}:await peek({...args,config});
      if(current.resource) {
        if(current.state==='stale')refresh(key,()=>fetch(current.resource));
        return publicResourceResponse(current.resource.response);
      }
      return fetch();
    };
    return identity.scope==='public'||playback?inRead(key,load):load();
  }
  async function acquire(session,name,{force=false,invalidToken}={}) {
    if(accountPool?.acquireSource && session.user?.id) {
      const source=await accountPool.acquireSource(session.user.id,name,{force,invalidToken,reuseDirectory:true});
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
      const questions=returned.map((row,index)=>({...query,...mergeExerciseDetail(row,data?.exerciseMap?.[row.exerciseId]),_resourceOrder:(number>0?number-1:0)+index}));
      const questionIds=(Array.isArray(data?.examExerciseIdList)?data.examExerciseIdList:questions.map(row=>row.exerciseId||row.id)).map(String);
      const total=Number(data?.exerciseTotalNumber??data?.total??questionIds.length);
      return {imported:true,persisted,cacheState,questions,total,questionIds,examId:data?.examId??data?.examinationId,response:clean};
    };
    const identity=resourceIdentity(platform,sourceSession(session,platform),config,request);
    const key=`questions:${identity.source.id}:${resourceKey(identity.request)}`;
    const fetch=async(cacheState)=>{
      const source=await acquire(session,platform);
      return inSource(sourceForSession(platform,{...session,...source},config).id,async()=>{
        if(query.examGroupId) {
          const prepared=await requestSource({session,name:platform,path:'/api/exam/wx/practice/cache/examination/group',input:{method:'POST',query:{groupId:query.examGroupId},data:{}},source});
          if(!succeeded(prepared))throw new ApiError('章节题目暂时无法加载，请稍后重试',502);
        }
        let response=await requestSource({session,name:platform,path:current.path,input:current,source});
        // Only a whole-paper learning action may request its complete content.
        if(!succeeded(response)&&!number&&current.path.endsWith('/exerciseList')) {
          const first=await requestSource({session,name:platform,path:current.path,input:{...current,query:{...query,number:1}},source});
          const firstData=first?.data??first?.Data;
          if(!succeeded(first)||!firstData?.examId)throw new ApiError('当前试卷暂时无法加载，请稍后重试',502);
          response=await requestSource({session,name:platform,path:'/api/exam/wx/practice/examExercise',input:{method:'GET',query:{examId:firstData.examId},data:{}},source});
          // The whole-paper response can omit the authoritative membership returned above.
          const body=response?.data??response?.Data;
          if(body&&typeof body==='object'&&!Array.isArray(body)) {
            const field='Data' in response?'Data':'data';
            response={...response,[field]:{...body,examId:body.examId||firstData.examId,
              exerciseTotalNumber:body.exerciseTotalNumber??firstData.exerciseTotalNumber,
              examExerciseIdList:Array.isArray(body.examExerciseIdList)&&body.examExerciseIdList.length?body.examExerciseIdList:firstData.examExerciseIdList}};
          }
        }
        if(!succeeded(response))throw new ApiError('题目暂时无法加载，请稍后重试',502);
        const parsed=result(response,cacheState);
        if(!parsed.questions.length)throw new ApiError('本次未取得题目，已保存内容保持不变',502);
        const saved=await capture({...args,request:current,response});
        return {...parsed,persisted:saved.captured};
      });
    };
    const load=async()=>{
      const latest=await peek(args);
      if(latest.resource) {
        if(latest.state==='stale')refresh(key,()=>fetch('stale'));
        return result(latest.resource.response,latest.state,true);
      }
      if(latest.state==='miss'&&!latest.missingContent&&fallbackResponse&&!(await store.getSettings()).enabled)return result(fallbackResponse,'miss');
      return fetch(latest.state);
    };
    return identity.scope==='public'?inRead(key,load):load();
  }
  function practiceIdentity({platform,session,config=configNow(),request}) {
    if(platform!=='math')return null;
    const normalized=normalizeMathPractice(request);
    if(!normalized)return null;
    const {source}=resourceIdentity(platform,sourceSession(session,platform),config,{path:'/api/question_list/GetQuestionByQuestionNew',method:'GET',query:{ID:0},data:{}});
    return {source,request:normalized};
  }
  async function localPractice(args) {
    const identity=practiceIdentity(args);
    if(!identity)return null;
    try {
      const group=await store.localPractice?.({sourceId:identity.source.id,platform:args.platform,request:identity.request});
      return group?.complete?group:null;
    } catch {recordError();return null;}
  }
  async function capturePractice(args) {
    try {
      const identity=practiceIdentity(args);
      if(!identity||!(await store.getSettings()).enabled||!succeeded(args.response))return {captured:false};
      const clean=cleanMathPractice(args.response);
      const resource=await store.save(identity.source,{request:identity.request,kind:'math.practice',scope:'public',context:{}},clean,{scope:'public'});
      lastCapturedAt=new Date().toISOString();lastError='';
      return {captured:true,resource};
    } catch {recordError();return {captured:false,error:lastError};}
  }
  return {status,updateSettings,capture,capturePractice,localPractice,peek,lookup,read,requestSource,ensureQuestions,waitForIdle,findEntities:options=>store.findEntities(options),list:options=>store.list(options)};
}

import express from "express";
import { ApiError, bearer } from "../upstream.mjs";
import { publicPlatformResponse,validatePlatformRequest,injectMathUser,cleanAccount } from "../platform-policy.mjs";
import { stripSharedPersonalState } from "../shared-account-policy.mjs";
import { publicYybSettings,userYybOverride } from "../user-yyb.mjs";

/** Web sessions own learning; a source account is acquired only for a cache miss or explicit upload. */
export function createLearningRouter({service,identities,connections,auth,accountPool,privatePlatform,resourceSync,personalSync}) {
  const router=express.Router(),authenticated=auth.require;
  router.use('/auth',auth.router);
  router.get('/account/yyb',authenticated,async(req,res)=>res.json(publicYybSettings(await identities.yybSettings(req.studySession.user.id),req.studySession.user.yybRef)));
  router.put('/account/yyb',authenticated,async(req,res)=>{
    const result=await identities.saveYybSettings(req.studySession.user.id,req.body);
    connections.delete(req.studySession.user.id);
    await accountPool.release(req.studySession.user.id);
    res.json(result);
  });
  router.get('/auth/accounts',authenticated,async(req,res)=>{
    const settings=await identities.yybSettings(req.studySession.user.id);
    if(settings.mode!=='custom')return res.json({accounts:[],automatic:true});
    let accounts;
    try{accounts=await service.yybRequest('/accounts',undefined,undefined,userYybOverride(settings));}
    catch(error){if(error.status===401)throw new ApiError('自有资源来源认证失败，请检查来源设置',502);throw error;}
    if(!Array.isArray(accounts))throw new ApiError('YYB 来源账号目录格式不正确',502);
    res.json({accounts:accounts.map(cleanAccount),automatic:!settings.ref});
  });
  router.get('/auth/avatar/:ref',authenticated,async(req,res)=>{
    const settings=await identities.yybSettings(req.studySession.user.id);
    if(settings.mode!=='custom')throw new ApiError('此来源头像不可用',404);
    const response=await fetch(`${settings.baseUrl}/accounts/avatar?ref=${encodeURIComponent(req.params.ref)}`,{headers:settings.apiKey?{Authorization:`Bearer ${settings.apiKey}`}:{},signal:AbortSignal.timeout(15000)});
    if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw new ApiError('头像暂不可用',404);
    res.type(response.headers.get('content-type')).send(Buffer.from(await response.arrayBuffer()));
  });
  router.get('/study/data',authenticated,async(req,res)=>res.json(await identities.studyData(req.studySession.user.id)));
  router.put('/study/data',authenticated,async(req,res)=>res.json(await identities.saveStudyData(req.studySession.user.id,req.body?.data,req.body?.revision)));
  router.get('/announcements',authenticated,async(req,res)=>res.json({announcements:await identities.listAnnouncements()}));
  router.post('/platform/math/first-score',authenticated,async(req,res)=>{
    const score=req.body?.score;
    if(!score||typeof score!=='object'||Array.isArray(score))throw new ApiError('成绩数据格式不正确',400);
    const saved=await privatePlatform.put(req.studySession.user.id,'math','first-score','score',score);
    res.json({SuccessResponse:true,data:saved.ID,storage:'web'});
  });
  router.post('/platform/math/photo',authenticated,express.raw({type:'multipart/form-data',limit:'20mb'}),async(req,res)=>{
    if(!Buffer.isBuffer(req.body)||!req.body.length)throw new ApiError('请选择要搜索的题目图片',400);
    const config=service.getConfig().math;
    if(!config.enabled)throw new ApiError('数学资源来源已停用',503);
    if(!config.ocrUrl||!config.ocrUsername||!config.ocrPassword)throw new ApiError('请在管理空间配置数学 OCR 地址和凭据',503);
    let form;
    try{form=await new Request('http://localhost',{method:'POST',headers:{'content-type':req.get('content-type')},body:req.body}).formData();}
    catch{throw new ApiError('图片上传格式不正确',400);}
    const image=form.get('image')||form.get('file');
    if(!image||typeof image==='string')throw new ApiError('请选择要搜索的题目图片',400);
    const payload=new FormData();payload.set('image',image);payload.set('username',config.ocrUsername);payload.set('password',config.ocrPassword);
    try{res.json(publicPlatformResponse(await service.requestJson(config.ocrUrl,{method:'POST',body:payload})));}
    catch(error){if(error.status===401)throw new ApiError('图片识别来源认证失败，请联系管理员检查设置',502);throw error;}
  });
  router.post('/platform/:platform/upload',authenticated,express.raw({type:'multipart/form-data',limit:'20mb'}),async(req,res)=>{
    const name=req.params.platform,allowed={computer:['/api/user/v1/attachment/upload/','/api/exam/wx/searchExercise/photo','/api/exam/wx/searchExercise/text/similarity'],math:['/api/sys_attachment/SearchUploadImg','/api/sys_attachment/LayuiUpImg','/api/sys_attachment/UpFile']},requestPath=req.query.path;
    if(!allowed[name]?.includes(requestPath))throw new ApiError('未启用此上传操作',403);
    if(!Buffer.isBuffer(req.body)||!req.body.length)throw new ApiError('请选择要上传的图片或文件',400);
    const query=new URLSearchParams();
    for(const[k,v]of Object.entries(req.query))if(k!=='path')for(const item of Array.isArray(v)?v:[v])query.append(k,String(item));
    const send=async(force=false)=>{
      const source=await accountPool.acquireSource(req.studySession.user.id,name,{force});
      return service.requestJson(`${service.getConfig()[name].baseUrl}${requestPath}${query.size?`?${query}`:''}`,{method:'POST',headers:{Authorization:bearer(source.platformState.token),...(name==='computer'?{'Tenant-Code':requestPath==='/api/exam/wx/searchExercise/text/similarity'?'2':String(service.getConfig().computer.tenantCode)}:{DesEncryptModel:'PKCS7'}),'content-type':req.get('content-type')},body:req.body});
    };
    let result;
    try{result=await send();}catch(error){if(error.status!==401)throw error;try{result=await send(true);}catch{throw new ApiError('资源来源暂时不可用，请稍后重试',502);}}
    res.json(publicPlatformResponse(result));
  });
  router.post('/platform/:platform',authenticated,async(req,res)=>{
    const name=req.params.platform,platform=req.studySession.platforms[name];
    let input=validatePlatformRequest(name,req.body);
    if(name==='math')input=injectMathUser(input,platform,service.getConfig().math.stationId);
    await personalSync?.maybeRefresh(req.studySession.user.id,name,input);
    const args={platform:name,session:req.studySession,config:service.getConfig(),request:input};
    const readSource=async request=>{
      try{return await resourceSync.requestSource({session:req.studySession,name,path:request.path,input:request});}
      catch(error){if(error.status===401)throw new ApiError('资源来源暂时不可用，请稍后重试',502);throw error;}
    };
    const invokeResource=()=>resourceSync.read({...args,load:async()=>stripSharedPersonalState(await readSource(input))});
    const result=await privatePlatform.handle({userId:req.studySession.user.id,name,input,platform,invoke:invokeResource,displayName:req.studySession.user.displayName,resourceSync,session:req.studySession,config:service.getConfig(),readSource:async request=>{
      const response=await readSource(request);
      try{await resourceSync.capture({platform:name,session:req.studySession,config:service.getConfig(),request,response});}catch{}
      return response;
    }});
    res.json(publicPlatformResponse(result));
  });
  return router;
}

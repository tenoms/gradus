import { ApiError } from '../../infrastructure/api-error.mjs';
import { resolveMathVideo, mathVideoSource as metadataVideo } from '../../integrations/math-video.mjs';
import { publicResourceResponse, resourceIdentity } from './catalog.mjs';

const validVid=value=>typeof value==='string' && /^[A-Za-z\d_-]{1,128}$/.test(value);
const url=value=>{
  if(typeof value!=='string')return '';
  try{const parsed=new URL(value.startsWith('//')?`https:${value}`:value);return ['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password?parsed.href:'';}catch{return '';}
};
const id=value=>{
  if(!['number','string'].includes(typeof value)||!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<=0)throw new ApiError('数学视频来源标识格式不正确',400);
  return String(Number(value));
};

export function mathPlaybackInput(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||input.refresh!==undefined&&typeof input.refresh!=='boolean')throw new ApiError('数学视频参数格式不正确',400);
  const parameters={};
  if(input.vid!==undefined&&input.vid!=='') {
    if(!validVid(input.vid))throw new ApiError('数学视频标识格式不正确',400);
    parameters.vid=input.vid;
  }
  for(const field of ['playsafe','sign','ts','appId']) {
    if(input[field]===undefined||input[field]===null||input[field]==='')continue;
    if(!['string','number'].includes(typeof input[field])||String(input[field]).length>4096)throw new ApiError('数学视频播放参数格式不正确',400);
    parameters[field]=String(input[field]);
  }
  let origin;
  if(input.origin!==undefined) {
    const value=input.origin;
    if(!value||typeof value!=='object'||Array.isArray(value))throw new ApiError('数学视频来源格式不正确',400);
    const fields={analysis:['questionId'],resolve:['questionId'],course:['calendarId','productId','itemId'],special:['specialId','itemId'],product:['productId']}[value.kind];
    if(!fields)throw new ApiError('数学视频来源类型不正确',400);
    origin={kind:value.kind,...Object.fromEntries(fields.map(field=>[field,id(value[field])]))};
    if(['analysis','resolve'].includes(value.kind)&&value.itemId!==undefined)origin.itemId=id(value.itemId);
  }
  if(!parameters.vid&&!origin)throw new ApiError('数学视频缺少可更新的来源信息',400);
  return {parameters,origin,refresh:input.refresh===true,hint:url(input.url)};
}

export function mathVideoOriginRequest(origin, {cached=false}={}) {
  if(origin.kind==='resolve')return {path:'/api/Master/AutoModel',method:'POST',query:{},data:{command:'GetQuestionInfoByResolve',data:JSON.stringify({QuestionID:origin.questionId})}};
  if(origin.kind==='analysis') {
    if(cached)return {path:'/api/question_list/GetQuestionByIDSoleDes',method:'GET',query:{ID:origin.questionId,SortDesc:'Sort'},data:{}};
    return origin.itemId
      ? {path:'/api/question_files/GetListByPage',method:'GET',query:{ID:origin.itemId,page:1,limit:1},data:{}}
      : {path:'/api/question_files/GetListByAll',method:'GET',query:{QuestionID:origin.questionId},data:{}};
  }
  if(origin.kind==='course')return {path:'/api/c_course_list/GetCalendarDetailListV2',method:'GET',query:{StuID:'',ID:origin.calendarId,ProductID:origin.productId,SortDesc:'Sort'},data:{}};
  if(origin.kind==='product')return {path:'/api/c_course_product/GetProductByStuIDAndProductID',method:'GET',query:{StuID:'',CourseProductID:origin.productId},data:{}};
  return {path:'/api/Master/AutoModel',method:'POST',query:{},data:{command:'GetSpecialVideoListBySpecialID',data:JSON.stringify({SpecialID:origin.specialId})}};
}

function recordVideo(row, origin) {
  const record={...row,...row.Data,...row._w_courseware};
  const ids=[record.PolyvVID,record.PlayVid,record.Vid,record.vid,
    ...(origin.kind==='product'?[record.Json]:[]),...(origin.kind==='special'?[record.VideoUrl]:[]),...(origin.kind==='resolve'?[record.Files]:[]),
    ...(/视频|录播/.test(`${record.BusType || ''} ${record.Type || ''}`)?[record.BusValue]:[])];
  const candidates=[record.VideoUrl,record.videoUrl,record.PlayUrl,record.playUrl,record.VLink,record.FileUrl,record.FilePath,record.Url,record.FilesUrl,record.Files,record.BusUrl,record.ContentUrl,record.BusValue,...ids];
  const playable=candidates.flatMap(value=>typeof value==='string'?value.split(/[;\n]/):[]).map(value=>url(value.trim())).find(value=>value&&!/\.(?:pdf|docx?|pptx?|xlsx?|png|jpe?g|gif|webp|svg|mp3|wav)(?:[?#]|$)/i.test(value));
  const vid=ids.find(validVid),parameters={};
  if(vid)parameters.vid=vid;
  const playsafe=record.playsafe||record.PlaySafe||record.playSafe||record.PlayToken;
  if(playsafe)parameters.playsafe=String(playsafe);
  if(record.sign&&record.ts){parameters.sign=String(record.sign);parameters.ts=String(record.ts);}
  if(record.appId)parameters.appId=String(record.appId);
  if(playable)return {record,parameters,video:{url:playable,poster:url(record.Poster||record.FirstImage||record.first_image),duration:Number(record.Duration)||0}};
  if(vid)return {record,parameters};
  try {
    const metadata=typeof record.Content==='string'?JSON.parse(record.Content):null;
    if(metadata&&typeof metadata==='object'&&(metadata.hls||metadata.mp4))return {record,parameters:{...(validVid(metadata.vid)?{vid:metadata.vid}:{})},video:metadataVideo(metadata,parameters)};
  } catch {}
  return null;
}

function originVideo(response, origin, parameters, hint) {
  const candidates=[];
  const visit=value=>{
    if(!value||typeof value!=='object')return;
    if(Array.isArray(value)){value.forEach(visit);return;}
    const video=recordVideo(value,origin);
    if(video)candidates.push(video);
    Object.values(value).forEach(visit);
  };
  visit(publicResourceResponse(response?.data??response?.Data??response));
  const same=(a,b)=>a!==undefined&&String(a)===String(b);
  const expected=origin.kind==='product'?origin.productId:origin.itemId;
  const match=expected!==undefined?candidates.find(item=>same(item.record.ID,expected)||origin.kind==='course'&&same(item.record.BusID,expected)):null;
  if(expected!==undefined)return match || null;
  return candidates.find(item=>parameters.vid&&item.parameters.vid===parameters.vid)
    || candidates.find(item=>hint&&item.video?.url===hint) || (candidates.length===1?candidates[0]:null);
}

/** Cache resolved math media independently of the source row's stale URL or credentials. */
export async function readMathPlayback({input,session,config,store,lookupSource,readSource,captureSource,requestJson,onSaveError}) {
  const {parameters,origin,refresh,hint}=mathPlaybackInput(input);
  const source=resourceIdentity('math',session,config,{path:'/api/question_list/GetQuestionByQuestionNew',method:'GET',query:{ID:0},data:{}}).source;
  const mediaIdentity=origin?{origin,...(['analysis','resolve'].includes(origin.kind)&&!origin.itemId?(parameters.vid?{vid:parameters.vid}:hint?{url:hint}:{}):{})}:{vid:parameters.vid};
  const request={path:'/api/platform/math/video',method:'POST',query:{},data:mediaIdentity};
  if(!refresh) {
    const cached=await store.lookup(source.id,'math',request);
    if(url(cached?.response?.url))return cached.response;
  }
  let selected;
  if(origin) {
    if(!refresh) {
      const cached=await lookupSource(mathVideoOriginRequest(origin,{cached:true}));
      selected=cached?originVideo(cached.response,origin,parameters,hint):null;
      if(!selected&&origin.kind==='analysis') {
        const requests=[mathVideoOriginRequest(origin),...(origin.itemId?[{path:'/api/question_files/GetListByAll',method:'GET',query:{QuestionID:origin.questionId},data:{}}]:[])];
        for(const request of requests) {
          const detail=await lookupSource(request);
          selected=detail?originVideo(detail.response,origin,parameters,hint):null;
          if(selected)break;
        }
      }
    }
    if(refresh||!selected&&!parameters.vid) {
      const originRequest=mathVideoOriginRequest(origin),response=await readSource(originRequest);
      if(response?.SuccessResponse===false)throw new ApiError('数学视频来源暂时无法更新，请稍后重试',502);
      selected=originVideo(response,origin,parameters,hint);
      if(!selected)throw new ApiError('未找到原数学视频，已保存地址保持不变',502);
      await captureSource(originRequest,response);
    }
  }
  const video=selected?.video || await resolveMathVideo(selected?.parameters?.vid?selected.parameters:parameters,{requestJson});
  if((await store.getSettings()).enabled) {
    try {await store.save(source,{kind:'math.media',request,context:{...request.data,...(selected?.record?.Title?{Title:selected.record.Title}:{})}},video,{scope:'volatile'});}
    catch {onSaveError();}
  }
  return video;
}

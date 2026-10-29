import { createHash } from 'node:crypto';
import { ApiError } from './upstream.mjs';
import { publicPlatformResponse } from './platform-policy.mjs';

export const personalScopes=['bookshelf','favorites','mistakes','notes','answers','reports','progress'];
const noteTypes={favorites:'收藏',mistakes:'错题',notes:'笔记'};
const defaultMajor='701769479767592960';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const array=value=>Array.isArray(value)?value:[];
const dataOf=response=>{let value=response?.data??response?.Data??[];if(typeof value==='string'){try{value=JSON.parse(value);}catch{throw new ApiError('个人来源返回的数据格式不正确',502);}}return value;};
const privateFields=/^(?:pwd|password|access_token|refresh_token|token|authorization|session_key|sessionkey|tel|telephone|phone|phonenumber|mobile|email|unionid)$/i;
export function sanitizePersonalData(value){
  const clean=publicPlatformResponse(value);
  const walk=item=>Array.isArray(item)?item.map(walk):item&&typeof item==='object'?Object.fromEntries(Object.entries(item).filter(([key])=>!privateFields.test(key)).map(([key,field])=>[key,walk(field)])):item;
  return walk(clean);
}
function checked(response,{platform,path}={}){
  const code=response?.code??response?.Code;
  const value=response?.data??response?.Data;
  const emptyPage=Array.isArray(value?.list)&&value.list.length===0&&Number(value.total)===0;
  const emptyNullablePage=value?.list===null&&Number(value.total)===0&&Number(value.pages)===0;
  const knownEmpty=platform==='computer'&&(emptyPage&&String(code)==='4104'&&path==='/api/exam/wx/practice/examinationRecord'||(emptyPage||emptyNullablePage)&&String(code)==='4114'&&['/api/exam/wx/personal/collectExerciseList','/api/exam/wx/personal/incorrectExerciseList'].includes(path));
  if(knownEmpty)return response;
  if(response?.SuccessResponse===false||response?.success===false||code!==undefined&&!['0','200'].includes(String(code)))throw new ApiError(`个人来源读取未成功${code===undefined?'':`（业务码 ${code}）`}`,String(code)==='401'?401:502);
  return response;
}
function rowsOf(response){
  const value=dataOf(response);
  if(Array.isArray(value))return Array.isArray(value[0])?value[0]:value;
  for(const key of ['list','records','rows','examinations','examinationList','answerList','exerciseList','exercises'])if(Array.isArray(value?.[key]))return value[key];
  if(value?.list===null&&Number(value.total)===0)return [];
  return value&&typeof value==='object'?[value]:[];
}
function identity(row,collection,table=0){
  const key=row.RelD??row.RelID??row.relId??row.ID??row.id??row.recordId??row.examRecordId??row.examinationRecordId??row.collectExerciseId;
  if(key!==undefined&&key!==null&&String(key)!==''&&String(key)!=='0')return `${collection}:${table}:${key}`;
  return `${collection}:${table}:derived:${hash(row)}`;
}
function record(row,collection,scope,table=0,key){return {collection,scope,sourceRecordId:key||identity(row,collection,table),data:sanitizePersonalData(row),sourceUpdatedAt:row.UpdateTime||row.updateTime||row.updateDate||row.updatedAt||null};}
const needed=fields=>({status:'needs_context',message:`此类记录需要先指定${fields.join('、')}，可在对应学习页面按需更新`,requiredContext:fields,records:[],hasMore:false,nextPage:null});
const unsupported=message=>({status:'unsupported',message,records:[],hasMore:false,nextPage:null});
export function normalizePersonalRequest(input={}){
  const platform=input.platform,scope=input.scope;
  if(!['math','computer'].includes(platform)||!personalScopes.includes(scope))throw new ApiError('请选择有效学科与个人同步范围',400);
  const page=Number(input.page??1),pageSize=Number(input.pageSize??20);
  if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100)throw new ApiError('个人同步分页参数不正确，每页最多100条',400);
  let context=input.context??{};
  if(typeof context==='string'){try{context=JSON.parse(context);}catch{throw new ApiError('个人同步上下文格式不正确',400);}}
  if(!context||typeof context!=='object'||Array.isArray(context)||Object.keys(context).length>30)throw new ApiError('个人同步上下文格式不正确',400);
  const fields=['majorId','examCategory','examType','dateFlag','sort','chapterId','schoolId','QuestionID','BookID','BookIDs','CatalogID','BusType','ExanType','Type','BusValue','historyType','examRecordId'];
  context=Object.fromEntries(fields.filter(key=>context[key]!==undefined).map(key=>{const value=context[key];if(!['string','number','boolean'].includes(typeof value)||String(value).length>300)throw new ApiError('个人同步上下文参数不正确',400);return [key,value];}));
  return {platform,scope,context,page,pageSize};
}
export function personalReadCapability({platform,scope,context}){
  if(platform==='computer'&&scope==='bookshelf')return unsupported('计算机小程序没有已确认的同类书架导入接口');
  if(scope==='answers'&&!context[platform==='math'?'QuestionID':'examRecordId'])return needed([platform==='math'?'QuestionID':'examRecordId']);
  return null;
}
export async function readPersonalPage(service,{platform,scope,context={},page=1,pageSize=20,state}){
  const limitation=personalReadCapability({platform,scope,context});if(limitation)return limitation;
  const configured=service.getConfig(),subject=platform==='math'?String(state.stuId||state.user?.StuID||''):String(state.user?.userId||'');
  if(!subject)throw new ApiError('个人来源未返回真实学习身份，无法导入',502);
  const math=async(command,parameters)=>checked(await service.mathRequest('/api/Master/AutoModel',{method:'POST',data:{command,data:JSON.stringify({...parameters,StuID:subject,System_Station_ID:configured.math.stationId})},query:{}},state));
  const computer=async(path,query)=>checked(await service.computerRequest(path,{method:'GET',query,data:{}},state),{platform:'computer',path});
  const result=(records,hasMore=false,extra={})=>({status:'ready',records,hasMore,nextPage:hasMore?page+1:null,...extra});
  if(platform==='math'){
    if(scope==='bookshelf'){
      const row=rowsOf(await math('GetUserInfoByStuID',{}))[0];
      if(!row)throw new ApiError('个人来源未返回可确认的书架资料',502);
      return result([record({EBookIDs:row.EBookIDs||'',PaperIDs:row.PaperIDs||'',AlbumIDs:row.AlbumIDs||''},'profile',scope,0,'bookshelf')]);
    }
    if(noteTypes[scope]){
      const response=await math('GetRelQuestionLogMistakesOrFavoriteList',{Type:noteTypes[scope]});
      const value=dataOf(response),tables=Array.isArray(value?.[0])?value:[array(value)];
      const all=tables.flatMap((table,index)=>array(table).filter(row=>row&&typeof row==='object').map(row=>record({...row,QuestionID:row.QuestionID||row.ID,Type:noteTypes[scope]},'sys_user_book_question',scope,index)));
      const catalogs=rowsOf(await math('GetSysUserBookCatalog',{BusType:noteTypes[scope],BusValue:context.BusValue||context.BusType||'数一',Type:'用户笔记本'})).map(row=>record({...row,BusType:noteTypes[scope],Type:'用户笔记本'},'sys_user_book_catalog',scope));
      const start=(page-1)*pageSize;
      return result([...all.slice(start,start+pageSize),...catalogs],all.length>start+pageSize,{sourceTotal:all.length,range:{BusValue:context.BusValue||context.BusType||'数一'}});
    }
    if(scope==='answers'){
      const value=dataOf(await math('GetQuestionLogInfo_rel2',{QuestionID:context.QuestionID}));
      const rows=Array.isArray(value?.[5])?value[5]:[];
      const start=(page-1)*pageSize;
      return result(rows.slice(start,start+pageSize).map(row=>record({...row,QuestionID:row.QuestionID||context.QuestionID,Type:'题目'},'rel_question_log',scope)),rows.length>start+pageSize);
    }
    if(scope==='reports'){
      const parameters={BusType:context.BusType||'数一',Type:context.Type||'章节模式',ExanType:context.ExanType||'真题模式',CatalogCode:context.CatalogID||0,CodeLength:1};
      const all=rowsOf(await math('GetCatalogHistoryList',parameters)),start=(page-1)*pageSize;
      return result(all.slice(start,start+pageSize).map(row=>record({...parameters,...row,sourceReport:true},'choice_question_exercise',scope)),all.length>start+pageSize,{range:parameters});
    }
    if(scope==='progress'){
      if(context.BookIDs){
        const all=rowsOf(await math('GetBookListSysUserRecordPlan',{BookIDs:String(context.BookIDs)}));
        return result(all.map(row=>record(row,'sys_user_record',scope,0,`book-plan:${row.ID||row.BookID||row.bookID}`)),false,{range:{BookIDs:String(context.BookIDs)}});
      }
      if(context.BookID){
        const all=rowsOf(await math('GetUserLastViewByBook_math',{BookID:context.BookID}));
        return result(all.map(row=>record({...row,BookID:row.BookID||context.BookID},'sys_user_record',scope)),false,{range:{BookID:context.BookID}});
      }
      const command=context.historyType==='photo'?'GetUserCourseQrcodePhotoBookListPager1':context.historyType==='paper'?'GetUserCourseQrcodeBookList2':'GetUserCourseQrcodeBookListPager1';
      const all=rowsOf(await math(command,{Page:(page-1)*pageSize,PageSize:pageSize,...(context.historyType==='paper'?{Notes:'真题'}:{})}));
      return result(all.map(row=>record({...row,BookID:row.BookID||row.bookID,BookName:row.BookName||row.bookName},'sys_user_record',scope)),all.length===pageSize,{range:{historyType:context.historyType||'books'}});
    }
  }
  const base={majorId:context.majorId||defaultMajor,examCategory:Number(context.examCategory||1)};
  if(['favorites','mistakes','notes'].includes(scope)){
    const path=scope==='mistakes'?'/api/exam/wx/personal/incorrectExerciseList':'/api/exam/wx/personal/collectExerciseList';
    const query={...base,pageNum:page,pageSize,dateFlag:String(context.dateFlag??'1'),sort:context.sort||(scope==='mistakes'?'incorrect_number':'create_date'),...(context.chapterId?{chapterId:context.chapterId}:{})};
    const response=await computer(path,query),value=dataOf(response),rows=rowsOf(response);
    const filtered=scope==='notes'?rows.filter(row=>row.exerciseNote||row.note):rows;
    const hasMore=Number(value?.pages||0)>page||Number(value?.total||0)>page*pageSize||(!value?.pages&&!value?.total&&rows.length===pageSize);
    return result(filtered.map(row=>record(row,scope==='mistakes'?'mistakes':'collection',scope)),hasMore,{range:query});
  }
  if(scope==='reports'){
    const query={...base,pageNum:page,pageSize,examType:Number(context.examType||3),...(context.schoolId?{schoolId:context.schoolId}:{})};
    const response=await computer('/api/exam/wx/practice/examinationRecord',query),value=dataOf(response),rows=rowsOf(response);
    return result(rows.map(row=>record({...row,sourceReport:true},'exams',scope)),Number(value?.pages||0)>page||Number(value?.total||0)>page*pageSize||(!value?.pages&&!value?.total&&rows.length===pageSize),{range:query});
  }
  if(scope==='answers'){
    const rows=rowsOf(await computer('/api/exam/wx/practice/exerciseRecord',{examRecordId:String(context.examRecordId),examCategory:base.examCategory})),start=(page-1)*pageSize;
    return result(rows.slice(start,start+pageSize).map(row=>record({...row,examRecordId:row.examRecordId||context.examRecordId},'answers',scope)),rows.length>start+pageSize);
  }
  if(scope==='progress'){
    const rows=rowsOf(await computer('/api/exam/wx/practice/basic/progress/stat',{...base,examType:Number(context.examType||3)}));
    const start=(page-1)*pageSize;
    return result(rows.slice(start,start+pageSize).map((row,index)=>record(row,'progress',scope,0,row.id||row.chapterId?`progress:${base.majorId}:${base.examCategory}:${row.id||row.chapterId}`:`progress:${base.majorId}:${base.examCategory}:${start+index}`)),rows.length>start+pageSize,{range:base,sourceTotal:rows.length});
  }
  return unsupported('此类个人记录尚未确认可靠的源读取接口');
}

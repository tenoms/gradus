import { createHash } from 'node:crypto';
import { validatePlatformRequest } from './platform-policy.mjs';
import { sharedOperation, stripSharedPersonalState } from './shared-account-policy.mjs';
import { publicPlatformResponse } from './platform-policy.mjs';

const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().filter(key => !['t', '_t', 'timestamp'].includes(key)).map(key => [key, stable(value[key])])) : value;
export const resourceKey = request => {
  const data = { ...(request.data || {}) };
  if (data.command && typeof data.data === 'string') { try { data.data = JSON.parse(data.data); } catch {} }
  return createHash('sha256').update(JSON.stringify(stable({ path: request.path, method: String(request.method || 'GET').toUpperCase(), data, query: request.query || {} }))).digest('hex');
};
export function sourceForSession(platform, session, config) {
  const platformConfig = config[platform];
  const baseUrl = session.yybBaseUrl || (session.yybMode === 'custom' ? session.yyb?.baseUrl : config.yyb.baseUrl) || '';
  const source = { platform, accountRef: String(session.account?.ref || ''), yybBaseUrl: baseUrl,
    baseUrl: platformConfig.baseUrl, appId: platformConfig.appId, stationId: platformConfig.stationId ?? null, tenantCode: platformConfig.tenantCode ?? null };
  return { ...source, id: createHash('sha256').update(JSON.stringify(source)).digest('hex') };
}
const unsafe = /(?:\/auth\/|\/OAuth2\/|\/master\/exec|pay|payment|live|helper|address|redeem|coupon|activation|(?:^|\/)(?:Inner|Del|Update|Set|RelPaper|Experience|Unlock|Scan|SearchUpload|Add|Save|Submit|Reset|Retry|Cancel)|\/(?:add|save|delete|submit|reset|retry|collectExercise|incorrectExercise)(?:\/|$)|\/practice\/exerciseList|\/choice_question_exercise\/GetPaper|\/sys_msg_push\/GetQuestionAwardVip|\/banner\/click|\/lessonHistory\/|\/bulletComment\/add)/i;
export function isReadableResource(platform, request) {
  try { validatePlatformRequest(platform, request); } catch { return false; }
  if (platform==='math' && request.path==='/api/c_paper/RelPaperByStuBySpecial2' && String(request.method).toUpperCase()==='POST') return true;
  if (unsafe.test(request.path)) return false;
  if (platform === 'math' && /^\/api\/Master\/(?:AutoModel|Model)$/.test(request.path))
    return /^(?:Get|get|Check|check|GeKst|GeSys)/.test(request.data?.command || '');
  return String(request.method || 'GET').toUpperCase() === 'GET';
}
const publicMathCommands = new Set(['GetBookPaperListOfVip','GetBookListCountAndLookCount_New','GetBookListCountAndLookCount','GetQuestionNexts2','GetQuestionInfoByResolve','GetBookHighscorealbumList','GetCoursePacketList','GetModelAblumQuestionList','GetHighscorealbumQuestionList','GetHighscorealbumQuestionListByCourse','GetSchoolList_cscj','GetSchoolXueYuanList_cscj','GetXueYuanMajorList_cscj','GetMajorDirectionList_cscj','GetDirectionXueXiTypeList_cscj','GetMajorSubjectList_cscj']);
const privateQuery = /^(?:examRecordId|examinationRecordId|recordId|sourcePracticeId|collectExerciseId)$/i;
export function resourceScope(platform, request) {
  const path=request.path||'', command=request.data?.command||'';
  if (/get_play_info|polyv|playSafe|playToken|signature|token|permission|random\/exercise/i.test(path+' '+command)) return 'volatile';
  if (platform==='math' && path==='/api/choice_question_exercise/GetPaper') return 'account';
  if (platform==='math' && path==='/api/c_paper/RelPaperByStuBySpecial2') return 'account';
  if (Object.keys({...request.query,...request.data}).some(key=>privateQuery.test(key))) return 'account';
  if (publicMathCommands.has(command)) return 'public';
  if (sharedOperation(platform,{...request,method:String(request.method||'GET').toUpperCase()})!=='resource') return 'account';
  if (/User|StuID|Record|History|LastStudy|LastTime|Allocation|My|GiveAuto/i.test(command)) return 'account';
  if (/\/(?:personal|user\/(?:detail|targetSchool)|lessonHistory|sys_users|sys_user_|ks_user_|sys_msg_push)(?:\/|_)/i.test(path)) return 'account';
  return 'public';
}
const actorField=/^(?:StuID|StuId|stuid|userId|UserID|SysUserID|OpenID|WxID|WeChatID|t|_t|timestamp)$/i;
function withoutActors(value) {
  if(Array.isArray(value))return value.map(withoutActors);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!actorField.test(key)).map(([key,item])=>[key,withoutActors(item)]));
}
const privateIdentity=/^(?:StuID|StuId|stuid|userId|UserID|SysUserID|OpenID|WxID|WeChatID|phone|phoneNumber|mobile|tel|telephone|email|unionid)$/i;
export function publicResourceResponse(response) {
  const clean=value=>Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!privateIdentity.test(key)).map(([key,item])=>[key,clean(item)])):value;
  return stripSharedPersonalState(clean(publicPlatformResponse(response)));
}
/** Content identity follows the platform domain; credentials and YYB selection remain provenance. */
export function resourceIdentity(platform,session,config,request) {
  const mixed=platform==='computer'&&['/api/exam/wx/practice/exerciseList','/api/exam/wx/practice/random/exercise'].includes(request.path) || platform==='math'&&request.path==='/api/choice_question_exercise/GetPaper';
  const scope=isReadableResource(platform,request)||mixed?resourceScope(platform,request):'excluded';
  if(scope!=='public'){const source={...sourceForSession(platform,session,config),scope,...(session.user?.id?{webUserId:session.user.id}:{})};if(session.user?.id)source.id=createHash('sha256').update(JSON.stringify({source:source.id,webUserId:session.user.id,scope})).digest('hex');return {source,request,scope};}
  const settings=config[platform];
  const domain={scope:'public',platform,baseUrl:String(settings.baseUrl||'').replace(/\/+$/,''),appId:settings.appId,stationId:settings.stationId??null,tenantCode:settings.tenantCode??null,loginId:settings.loginId??null};
  const data={...(request.data||{})};
  if(data.command&&typeof data.data==='string'){try{data.data=JSON.parse(data.data);}catch{}}
  const method=String(request.method||'GET').toUpperCase();
  const transportValues=value=>Array.isArray(value)?value.map(transportValues):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,transportValues(item)])):typeof value==='number'||typeof value==='boolean'?String(value):value;
  const normalized={path:request.path,method,data:method==='GET'?{}:withoutActors(data),query:transportValues(withoutActors(method==='GET'?{...(request.query||{}),...data}:request.query||{}))};
  return {source:{...domain,id:createHash('sha256').update(JSON.stringify(domain)).digest('hex'),accountRef:''},request:normalized,scope};
}
export function resourceRows(response) {
  let data = response?.data ?? response?.Data ?? response;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return []; } }
  if (Array.isArray(data)) return Array.isArray(data[0]) ? data[0] : data.filter(item => item && typeof item === 'object');
  for (const name of ['list','records','rows','content','examinations','examinationList','infoList','majorCustomList','courseList','courses','taskList','actSignList','groupList','exercises','exerciseList','questions','questionList']) if (Array.isArray(data?.[name])) return data[name];
  return [];
}
export function inferResourceRequest(platform, request) {
  let parameters = { ...(request.query || {}), ...(request.data?.command ? {} : request.data || {}) };
  if (request.data?.command) { try { parameters = { ...parameters, ...(typeof request.data.data === 'string' ? JSON.parse(request.data.data) : request.data.data) }; } catch {} }
  const commands = { GetBookPaperListOfVip:'math.books', GetBookListCountAndLookCount_New:'math.books', GetQuestionNexts2:'math.catalog', GetBookHighscorealbumList:'math.albums', GetCoursePacketList:'math.packets', GetModelAblumQuestionList:'math.questions', GetHighscorealbumQuestionList:'math.questions', GetHighscorealbumQuestionListByCourse:'math.questions', GetSchoolList_cscj:'math.schools', GetSchoolXueYuanList_cscj:'math.colleges', GetXueYuanMajorList_cscj:'math.majors', GetMajorDirectionList_cscj:'math.directions', GetDirectionXueXiTypeList_cscj:'math.studytypes', GetksPaperList:'math.papers', GetDryRunInfoList:'math.exams', GetDryAppliInfo2:'math.packets', GetUserByProductCourseWare2:'math.products' };
  const paths = { '/api/book_highscorealbum_catalog/GetListByPagev2':'math.album.catalog','/api/book_highscorealbum_catalog/GetlistByCacheV2':'math.album.items','/api/c_course_product/GetProductByStuID2':'math.products','/api/c_course_product/GetProductByStuID':'math.products','/api/c_course_product/GetProductByStuIDAndProductID':'math.product','/api/c_course_list/GetCourseListAll':'math.course.chapters','/api/c_course_packet/GetPacketV2':'math.packets','/api/c_course_list/GetCalendarDetailListV2':'math.packets','/api/headimg_list/GetListByAll':'math.articles','/api/sys_users_dryrun/GetDryrunListBy2':'math.exams','/api/exam/wx/practice/knowledge':'computer.chapters','/api/exam/wx/practice/examination/group/list':'computer.groups','/api/exam/wx/practice/examination/search':'computer.exams','/api/exam/wx/practice/examinationList':'computer.exams','/api/exam/wx/practice/majorId/examination/list':'computer.exams','/api/exam/wx/course/courseList':'computer.courses','/api/exam/pc/course/detail':'computer.course','/api/exam/wx/lesson/lessonList':'computer.lessons','/api/exam/wx/school/cs/search':'computer.schools','/api/user/wx/actSign/list':'computer.activities' };
  const contentKind = platform==='math'
    ? /SoleDes|Resolve|Analyse|Analysis/.test(request.path+' '+(request.data?.command||''))?'math.analysis':/question_files/.test(request.path)?'math.files':/question_list/.test(request.path)?'math.question':null
    : /get_play_info/.test(request.path)?'computer.media':/searchExercise\/info|practice\/(?:exerciseList|exercise|random\/exercise)$/.test(request.path)?'computer.question':/examExercise$/.test(request.path)?'computer.paper':null;
  return { kind: commands[request.data?.command] || paths[request.path] || contentKind || (request.path.includes('/membership/') ? 'computer.exams' : 'observed'), request, context: parameters };
}
export function resourceMedia(response) {
  const urls = new Set();
  const visit = value => { if (typeof value === 'string') for (const match of value.matchAll(/https?:\/\/[^\s<>"';]+/g)) urls.add(match[0]); else if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') Object.values(value).forEach(visit); };
  visit(response); return [...urls];
}
export function resourceManifest() {
  return Object.fromEntries(['math','computer'].map(platform => [platform, {
    mode: 'learning',
    strategy: '随学习请求保存实际返回的完整资源内容；未访问的资源不主动读取',
    categories: platform === 'math' ? ['资料与目录','题目、解析与附件','专辑与模型','课程与课时','测评与院校'] : ['章节与试卷','当前题目与解析','课程与媒体信息','院校与资料'],
    boundary: '分页、下一题、解析与关联资源仅在用户实际访问时同步。媒体保存已返回的引用。Web个人记录独立保存。',
  }]));
}

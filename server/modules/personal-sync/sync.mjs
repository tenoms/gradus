import { createHash, randomUUID } from 'node:crypto';
import { ApiError } from '../../infrastructure/api-error.mjs';
import { updateYybSettings } from '../accounts/user-yyb.mjs';
import { sharedOperation, mathParameters } from '../../integrations/shared-account-policy.mjs';
import { personalScopes, normalizePersonalRequest, personalReadCapability, readPersonalPage } from './adapters.mjs';
import {createTokenLifecycle,isSourceAuthFailure} from '../../integrations/token-lifecycle.mjs';

const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const time=()=>new Date().toISOString();
const message=error=>error instanceof ApiError?error.message:'暂时无法读取小程序记录，请稍后重试';
const domain=(service,name)=>{const value=service.getConfig()[name];return hash([name,value.baseUrl,value.appId,value.stationId??null,value.tenantCode??null]);};
const collections={math:{profile:['bookshelf'],sys_user_book_question:['favorites','mistakes','notes'],rel_question_log:['favorites','mistakes','notes','answers'],sys_user_book_catalog:['favorites','mistakes','notes'],choice_question_exercise:['reports'],sys_user_record:['progress']},computer:{collection:['favorites','notes'],mistakes:['mistakes'],exams:['reports'],answers:['answers'],progress:['progress']}};
const aliases=(name,collection)=>name==='math'&&collection==='rel_question_log'?['rel_question_log','sys_user_book_question']:[collection];
const accountRef=account=>String(account.id??account.ref??'');
const openidOf=account=>typeof account?.openid==='string'?account.openid.trim():'';

/** A personal link follows the verified WeChat openid; transport ref and platform subjects remain separate. */
export async function createPersonalSync({database,service,identities,tokenLifecycle}){
  const table=database.web,tokens=tokenLifecycle||createTokenLifecycle({service}),pending=new Map();
  await database.query(`
    CREATE TABLE IF NOT EXISTS ${table('personal_sync_connections')} (user_id text PRIMARY KEY,base_url text NOT NULL,api_key text NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS ${table('personal_sync_settings')} (user_id text PRIMARY KEY,enabled boolean NOT NULL DEFAULT false,scopes jsonb NOT NULL);
    CREATE TABLE IF NOT EXISTS ${table('personal_account_links')} (id text PRIMARY KEY,user_id text NOT NULL,openid text NOT NULL,account_ref text NOT NULL,nickname text NOT NULL,active boolean NOT NULL DEFAULT true,connection_revision integer NOT NULL,platforms jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,openid));
    CREATE UNIQUE INDEX IF NOT EXISTS personal_account_link_active ON ${table('personal_account_links')}(user_id) WHERE active;
    CREATE TABLE IF NOT EXISTS ${table('personal_import_records')} (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id text NOT NULL,openid text NOT NULL,platform text NOT NULL,source_domain text NOT NULL,collection text NOT NULL,source_key text NOT NULL,scope text NOT NULL,scopes jsonb NOT NULL,data jsonb NOT NULL,source_hash text NOT NULL,source_updated_at text,imported_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),hidden boolean NOT NULL DEFAULT false,UNIQUE(user_id,openid,platform,source_domain,collection,source_key));
    CREATE INDEX IF NOT EXISTS personal_import_owner ON ${table('personal_import_records')}(user_id,platform,collection);
    CREATE TABLE IF NOT EXISTS ${table('personal_sync_states')} (user_id text NOT NULL,openid text NOT NULL,platform text NOT NULL,scope text NOT NULL,request_key text NOT NULL,last_synced_at timestamptz,last_error text NOT NULL DEFAULT '',has_more boolean NOT NULL DEFAULT false,next_page integer,PRIMARY KEY(user_id,openid,platform,scope,request_key));
  `);
  const one=async(sql,args)=>(await database.query(sql,args)).rows[0];
  const connection=async userId=>await one(`SELECT * FROM ${table('personal_sync_connections')} WHERE user_id=$1`,[userId]);
  const binding=async userId=>await one(`SELECT * FROM ${table('personal_account_links')} WHERE user_id=$1 AND active`,[userId]);
  async function settings(userId,input){
    if(input!==undefined){
      if(typeof input?.enabled!=='boolean'||!Array.isArray(input.scopes)||input.scopes.some(scope=>!personalScopes.includes(scope))||new Set(input.scopes).size!==input.scopes.length)throw new ApiError('个人数据同步开关或范围格式不正确',400);
      await database.query(`INSERT INTO ${table('personal_sync_settings')}(user_id,enabled,scopes) VALUES($1,$2,$3::jsonb) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,scopes=excluded.scopes`,[userId,input.enabled,JSON.stringify(input.scopes)]);
    }
    const row=await one(`SELECT enabled,scopes FROM ${table('personal_sync_settings')} WHERE user_id=$1`,[userId]);
    return row||{enabled:false,scopes:[...personalScopes]};
  }
  async function summary(userId){
    const counts=(await database.query(`SELECT item.scope,count(*)::integer AS total FROM ${table('personal_import_records')} CROSS JOIN LATERAL jsonb_array_elements_text(scopes) AS item(scope) WHERE user_id=$1 AND NOT hidden GROUP BY item.scope`,[userId])).rows;
    const total=Number((await one(`SELECT count(*) AS total FROM ${table('personal_import_records')} WHERE user_id=$1 AND NOT hidden`,[userId])).total);
    const latest=await one(`SELECT max(last_synced_at) AS at FROM ${table('personal_sync_states')} WHERE user_id=$1`,[userId]);
    const error=await one(`SELECT last_error FROM ${table('personal_sync_states')} WHERE user_id=$1 AND last_error<>'' ORDER BY last_synced_at DESC NULLS FIRST LIMIT 1`,[userId]);
    return {total,byScope:Object.fromEntries(personalScopes.map(scope=>[scope,Number(counts.find(row=>row.scope===scope)?.total||0)])),lastSyncedAt:latest?.at?new Date(latest.at).toISOString():null,lastError:error?.last_error||null};
  }
  function publicBinding(row,config){
    if(!row)return null;
    const verified=row.connection_revision===config?.revision;
    return {id:row.id,openid:row.openid,nickname:row.nickname,ref:row.account_ref,platforms:Object.fromEntries(['math','computer'].map(name=>[name,{...row.platforms[name],...(!verified?{status:'needs_verification',error:'连接设置已更改，请重新确认关联账号'}:{})}]))};
  }
  async function status(userId){
    const [config,linked,prefs,counts]=await Promise.all([connection(userId),binding(userId),settings(userId),summary(userId)]);
    return {connection:{baseUrl:config?.base_url||'',apiKeyConfigured:!!config?.api_key},binding:publicBinding(linked,config),settings:prefs,summary:counts};
  }
  async function saveConnection(userId,input){
    const previous=await connection(userId),value=updateYybSettings({mode:'custom',baseUrl:previous?.base_url||'',apiKey:previous?.api_key||'',ref:'',revision:previous?.revision||0},{...input,mode:'custom',ref:''});
    await database.query(`INSERT INTO ${table('personal_sync_connections')}(user_id,base_url,api_key,revision) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET base_url=excluded.base_url,api_key=excluded.api_key,revision=excluded.revision`,[userId,value.baseUrl,value.apiKey,value.revision]);
    return status(userId);
  }
  const transport=config=>({baseUrl:config.base_url,apiKey:config.api_key});
  async function directory(userId){
    const config=await connection(userId);if(!config)throw new ApiError('请先保存账号连接设置',409);
    let rows;try{rows=await service.yybRequest('/accounts',undefined,undefined,transport(config));}catch{throw new ApiError('无法加载账号列表，请检查连接设置',502);}
    if(!Array.isArray(rows))throw new ApiError('无法加载账号列表，请稍后重试',502);
    return {config,rows};
  }
  async function accounts(userId){const {rows}=await directory(userId);return {accounts:rows.filter(account=>accountRef(account)).map(account=>({ref:accountRef(account),openid:openidOf(account),nickname:account.nickname||account.alias||'微信学习账号',status:account.status||'unknown'}))};}
  async function login(userId,linked,name,config,account,{force=false,invalidToken,freshLogin=false}={}){
    let state;
    try{state=await tokens.acquire(name,{...account,ref:accountRef(account)},transport(config),{force,invalidToken,freshLogin});}
    catch(error){throw new ApiError(error.status===401?'账号连接失败，请检查连接设置后重试':message(error),error.status===503?503:502);}
    const subjectId=name==='math'?String(state?.stuId||state?.user?.StuID||''):String(state?.user?.userId||'');
    if(!state?.connected||!subjectId)throw new ApiError(`无法连接${name==='math'?'数学':'计算机'}小程序账号，记录导入已暂停`,502);
    const previous=linked.platforms?.[name];
    if(previous?.subjectId&&previous.domain===domain(service,name)&&previous.subjectId!==subjectId)throw new ApiError('小程序账号已变更，请确认后重新关联',409);
    return state;
  }
  async function bind(userId,input){
    if(typeof input?.ref!=='string'||!input.ref||input.ref.length>160||input.replace!==undefined&&typeof input.replace!=='boolean')throw new ApiError('请选择要关联的个人账号',400);
    const {config,rows}=await directory(userId),account=rows.find(row=>accountRef(row)===input.ref),openid=openidOf(account);
    if(!account)throw new ApiError('未找到所选账号，请刷新账号列表',404);
    if(!openid)throw new ApiError('无法确认所选微信账号，请检查连接后重试',409);
    const current=await binding(userId);
    if(current&&current.openid!==openid&&!input.replace)throw new ApiError('所选微信账号与当前关联不同；请明确切换关联，原导入记录会保留',409);
    const existing=await one(`SELECT * FROM ${table('personal_account_links')} WHERE user_id=$1 AND openid=$2`,[userId,openid]);
    const candidate={...existing,openid},platforms={};
    for(const name of ['math','computer']){
      try{const state=await login(userId,candidate,name,config,account,{freshLogin:true});platforms[name]={status:'ready',subjectId:name==='math'?String(state.stuId||state.user.StuID):String(state.user.userId),domain:domain(service,name)};}
      catch(error){platforms[name]={status:'unavailable',subjectId:existing?.platforms?.[name]?.subjectId||'',domain:domain(service,name),error:message(error)};}
    }
    await database.transaction(async()=>{
      await database.query(`UPDATE ${table('personal_account_links')} SET active=false WHERE user_id=$1`,[userId]);
      await database.query(`INSERT INTO ${table('personal_account_links')}(id,user_id,openid,account_ref,nickname,active,connection_revision,platforms) VALUES($1,$2,$3,$4,$5,true,$6,$7::jsonb) ON CONFLICT(user_id,openid) DO UPDATE SET account_ref=excluded.account_ref,nickname=excluded.nickname,active=true,connection_revision=excluded.connection_revision,platforms=excluded.platforms,updated_at=now()`,[existing?.id||randomUUID(),userId,openid,input.ref,account.nickname||account.alias||'微信学习账号',config.revision,JSON.stringify(platforms)]);
    });
    await identities?.audit?.(await identities.user(userId),'personal_sync.linked','我的小程序学习账号','已关联小程序账号');
    return status(userId);
  }
  async function detach(userId){
    await database.query(`UPDATE ${table('personal_account_links')} SET active=false WHERE user_id=$1`,[userId]);
    return status(userId);
  }
  async function source(userId,name,{force=false,invalidToken}={}){
    const linked=await binding(userId);if(!linked)throw new ApiError('请先关联自己的小程序学习账号',409);
    const {config,rows}=await directory(userId);
    if(config.revision!==linked.connection_revision)throw new ApiError('连接设置已更改，请重新确认关联账号后更新',409);
    const account=rows.find(row=>accountRef(row)===linked.account_ref);
    if(!account||openidOf(account)!==linked.openid)throw new ApiError('关联账号已变更，导入已暂停；请重新确认账号',409);
    const state=await login(userId,linked,name,config,account,{force,invalidToken});
    const verified={status:'ready',subjectId:name==='math'?String(state.stuId||state.user.StuID):String(state.user.userId),domain:domain(service,name)};
    if(linked.platforms?.[name]?.status!=='ready'||linked.platforms?.[name]?.subjectId!==verified.subjectId){
      await database.query(`UPDATE ${table('personal_account_links')} SET platforms=jsonb_set(platforms,$3::text[],$4::jsonb),updated_at=now() WHERE user_id=$1 AND id=$2`,[userId,linked.id,[name],JSON.stringify(verified)]);
    }
    return {linked,state};
  }
  const stateKey=request=>hash(request);
  async function setState(userId,openid,request,values){
    await database.query(`INSERT INTO ${table('personal_sync_states')}(user_id,openid,platform,scope,request_key,last_synced_at,last_error,has_more,next_page) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id,openid,platform,scope,request_key) DO UPDATE SET last_synced_at=coalesce(excluded.last_synced_at,${table('personal_sync_states')}.last_synced_at),last_error=excluded.last_error,has_more=excluded.has_more,next_page=excluded.next_page`,[userId,openid,request.platform,request.scope,stateKey(request),values.at||null,values.error||'',!!values.hasMore,values.nextPage||null]);
  }
  async function preview(userId,input){
    const request=normalizePersonalRequest(input),capability=personalReadCapability(request);
    if(capability)return {...capability,count:0,samples:[]};
    const acquired=await source(userId,request.platform);
    let result;
    try{result=await readPersonalPage(service,{...request,state:acquired.state});}
    catch(error){if(!isSourceAuthFailure(error))throw error;const renewed=await source(userId,request.platform,{force:true,invalidToken:acquired.state.token});try{result=await readPersonalPage(service,{...request,state:renewed.state});}catch{throw new ApiError('暂时无法读取小程序记录，请稍后重试',502);}}
    return {...result,count:result.records.length,samples:result.records.slice(0,5)};
  }
  async function refresh(userId,input){
    const request=normalizePersonalRequest(input),prefs=await settings(userId),linked=await binding(userId);
    if(!prefs.enabled)throw new ApiError('记录导入已关闭，已导入的记录仍可使用',409);
    if(!prefs.scopes.includes(request.scope))throw new ApiError('此类个人记录未加入同步范围',409);
    const key=`${userId}:${linked?.openid||''}:${stateKey(request)}`;
    if(pending.has(key))return pending.get(key);
    const work=(async()=>{
      try{
        const result=await preview(userId,request);if(result.status!=='ready')return {...result,added:0,updated:0,unchanged:0,summary:await summary(userId)};
        if(!linked)throw new ApiError('请先关联自己的小程序学习账号',409);
        let added=0,updated=0,unchanged=0;
        await database.transaction(async()=>{
          for(const record of result.records){
            const digest=hash(record.data),sourceDomain=domain(service,request.platform);
            const existing=await one(`SELECT id,source_hash FROM ${table('personal_import_records')} WHERE user_id=$1 AND openid=$2 AND platform=$3 AND source_domain=$4 AND collection=$5 AND source_key=$6`,[userId,linked.openid,request.platform,sourceDomain,record.collection,record.sourceRecordId]);
            if(!existing)added++;else if(existing.source_hash===digest)unchanged++;else updated++;
            await database.query(`INSERT INTO ${table('personal_import_records')}(user_id,openid,platform,source_domain,collection,source_key,scope,scopes,data,source_hash,source_updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11) ON CONFLICT(user_id,openid,platform,source_domain,collection,source_key) DO UPDATE SET data=excluded.data,source_hash=excluded.source_hash,source_updated_at=excluded.source_updated_at,scopes=(SELECT jsonb_agg(DISTINCT item) FROM jsonb_array_elements(${table('personal_import_records')}.scopes || excluded.scopes) AS item),updated_at=now()`,[userId,linked.openid,request.platform,sourceDomain,record.collection,record.sourceRecordId,request.scope,JSON.stringify([request.scope]),JSON.stringify(record.data),digest,record.sourceUpdatedAt?String(record.sourceUpdatedAt):null]);
          }
          await setState(userId,linked.openid,request,{at:time(),hasMore:result.hasMore,nextPage:result.nextPage});
        });
        return {status:'ready',added,updated,unchanged,count:result.count,hasMore:result.hasMore,nextPage:result.nextPage,range:result.range,summary:await summary(userId)};
      }catch(error){if(linked)await setState(userId,linked.openid,request,{error:message(error)});throw error instanceof ApiError&&error.status!==401?error:new ApiError(message(error),502);}
    })();
    pending.set(key,work);try{return await work;}finally{pending.delete(key);}
  }
  function publicRecord(row){return {id:String(row.id),_importId:Number(row.id),_key:`import:${row.id}`,platform:row.platform,scope:row.scope,scopes:row.scopes,collection:row.collection,openid:row.openid,sourceRecordId:row.source_key,data:row.data,sourceUpdatedAt:row.source_updated_at,importedAt:new Date(row.imported_at).toISOString(),hidden:row.hidden};}
  async function records(userId,name,collection){
    if(!collections[name]?.[collection])return [];
    const rows=(await database.query(`SELECT * FROM ${table('personal_import_records')} WHERE user_id=$1 AND platform=$2 AND collection=ANY($3::text[]) AND NOT hidden ORDER BY updated_at DESC,id DESC`,[userId,name,aliases(name,collection)])).rows;
    return rows.map(publicRecord);
  }
  async function listRecords(userId,input){
    const request=normalizePersonalRequest(input),offset=(request.page-1)*request.pageSize;
    const where=`user_id=$1 AND platform=$2 AND scopes ? $3 AND NOT hidden`,args=[userId,request.platform,request.scope];
    const total=Number((await one(`SELECT count(*) AS total FROM ${table('personal_import_records')} WHERE ${where}`,args)).total);
    const rows=(await database.query(`SELECT * FROM ${table('personal_import_records')} WHERE ${where} ORDER BY updated_at DESC,id DESC LIMIT $4 OFFSET $5`,[...args,request.pageSize,offset])).rows;
    return {records:rows.map(publicRecord),pagination:{page:request.page,pageSize:request.pageSize,total,totalPages:Math.max(1,Math.ceil(total/request.pageSize))},hasMore:offset+rows.length<total};
  }
  function selectors(ids){return ids.map(value=>String(value)).flatMap(value=>value.startsWith('import:')?[value.slice(7)]:/^-\d+$/.test(value)?[value.slice(1)]:[value]);}
  async function hide(userId,name,collection,ids){
    if(!Array.isArray(ids)||!ids.length||!collections[name]?.[collection])return;
    await database.query(`UPDATE ${table('personal_import_records')} SET hidden=true WHERE user_id=$1 AND platform=$2 AND collection=ANY($3::text[]) AND (id::text=ANY($4::text[]) OR source_key=ANY($4::text[]))`,[userId,name,aliases(name,collection),selectors(ids)]);
  }
  async function isHidden(userId,name,collection,id){return !!await one(`SELECT id FROM ${table('personal_import_records')} WHERE user_id=$1 AND platform=$2 AND collection=ANY($3::text[]) AND hidden AND (id::text=ANY($4::text[]) OR source_key=ANY($4::text[])) LIMIT 1`,[userId,name,aliases(name,collection),selectors([id])]);}
  function requestFor(name,input,prefs){
    if(sharedOperation(name,input)!=='private')return null;
    if(name==='math'){
      const context=mathParameters(input),command=input.data?.command||'';
      let scope;
      if(command==='GetUserInfoByStuID')scope='bookshelf';
      else if(/GetRelQuestionLogMistakesOrFavoriteList|GetSysUserBookCatalog|GetSysUserBookQuestionList|GetSysUserQuestionBookList/.test(command)||/\/sys_user_book_question\//.test(input.path))scope=Object.entries(noteTypes).find(([,type])=>type===context.Type||type===context.BusType)?.[0]||'notes';
      else if(/^GetQuestionLogInfo_rel/.test(command))scope='answers';
      else if(command==='GetCatalogHistoryList')scope='reports';
      else if(/GetUserCourseQrcode|GetUserRecordList|GetBookListSysUserRecordPlan|GetUserLastViewByBook_math|GetBookListCountAndLookCount_LastTop3/.test(command))scope='progress';
      if(!scope)return null;
      const pageSize=Number(context.PageSize||context.limit||20),page=context.Page!==undefined?Math.floor(Number(context.Page)/pageSize)+1:Number(context.page||1);
      return {platform:name,scope,context:{...context,...(command.includes('Photo')?{historyType:'photo'}:command==='GetUserCourseQrcodeBookList2'?{historyType:'paper'}:{})},page,pageSize};
    }
    const context={...input.query,...input.data},path=input.path;
    let scope=/\/incorrectExerciseList$/.test(path)?'mistakes':/\/collectExerciseList$/.test(path)?(prefs.scopes.includes('favorites')?'favorites':'notes'):/\/examinationRecord$/.test(path)?'reports':/\/(?:answerRecord|exerciseRecord)$/.test(path)?'answers':/\/basic\/progress\/stat$/.test(path)?'progress':null;
    return scope?{platform:name,scope,context,page:Number(context.pageNum||1),pageSize:Number(context.pageSize||20)}:null;
  }
  const noteTypes={favorites:'收藏',mistakes:'错题',notes:'笔记'};
  async function maybeRefresh(userId,name,input){
    const prefs=await settings(userId);if(!prefs.enabled)return;
    const linked=await binding(userId);if(!linked)return;
    const candidate=requestFor(name,input,prefs);if(!candidate||!prefs.scopes.includes(candidate.scope))return;
    let request;
    try{request=normalizePersonalRequest(candidate);}catch{return;}
    const state=await one(`SELECT last_synced_at,last_error FROM ${table('personal_sync_states')} WHERE user_id=$1 AND openid=$2 AND platform=$3 AND scope=$4 AND request_key=$5`,[userId,linked.openid,request.platform,request.scope,stateKey(request)]);
    if(state?.last_synced_at&&Date.now()-new Date(state.last_synced_at).getTime()<60000)return;
    try{await refresh(userId,request);}catch{}
  }
  return {status,saveConnection,accounts,bind,detach,settings,preview,refresh,listRecords,records,hide,isHidden,maybeRefresh,summary};
}

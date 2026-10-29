import { createHash } from 'node:crypto';
import { ApiError } from '../../infrastructure/api-error.mjs';
import { cleanAccount } from '../../integrations/platform-policy.mjs';
import { userYybOverride } from './user-yyb.mjs';
import { createYybServices } from './yyb-services.mjs';
import { createTokenLifecycle } from '../../integrations/token-lifecycle.mjs';
import { readRuntimeConfig } from '../../infrastructure/runtime-config.mjs';

export const accountAlgorithms = ['round_robin','least_loaded','sticky'];
const rawRef=account=>String(account.id??account.ref??'');
const openid=account=>String(account.openid||account.openId||'').trim();
const routeKey=(source,ref)=>source.id==='default'?ref:`${source.id}::${ref}`;
const publicAccount=account=>{const {_routes,aliases,...safe}=account;return safe;};

/** Scheduling owns a WeChat identity; YYB services are interchangeable access routes. */
export async function createAccountPool({database,service,connections,identities,tokenLifecycle,environmentFields=[],timings=readRuntimeConfig().accounts}){
  const tokens=tokenLifecycle||createTokenLifecycle({service});
  const services=await createYybServices({database,service,environmentFields});
  // Learning bursts share a short-lived directory; management reads always refresh it.
  let directorySnapshot;
  const settings=database.web('account_pool'),assignments=database.web('account_assignments');
  await database.query(`CREATE TABLE IF NOT EXISTS ${settings}(id integer PRIMARY KEY CHECK(id=1),revision integer NOT NULL DEFAULT 0,algorithm text NOT NULL DEFAULT 'round_robin',enabled_refs jsonb,cursor bigint NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS ${assignments}(user_id text PRIMARY KEY,account_ref text NOT NULL,expires_at bigint NOT NULL);
    CREATE INDEX IF NOT EXISTS account_assignments_ref ON ${assignments}(account_ref);
    INSERT INTO ${settings}(id) VALUES(1) ON CONFLICT DO NOTHING`);
  async function config(client=database){return (await client.query(`SELECT * FROM ${settings} WHERE id=1`)).rows[0];}
  async function readDirectory({reuse=false}={}){
    const sources=await services.all(),key=createHash('sha256').update(JSON.stringify(sources)).digest('hex');
    if(directorySnapshot?.key===key){
      if(directorySnapshot.pending)return directorySnapshot.pending;
      if(reuse&&directorySnapshot.expiresAt>Date.now())return directorySnapshot.value;
    }
    const snapshot={key};directorySnapshot=snapshot;
    const pending=loadDirectory(sources);snapshot.pending=pending;
    try{const value=await pending;snapshot.value=value;snapshot.expiresAt=Date.now()+timings.directoryCacheTtlMs;return value;}
    finally{delete snapshot.pending;}
  }
  async function loadDirectory(sources){
    const active=sources.filter(source=>source.enabled),issues=[];
    const results=await Promise.allSettled(active.map(async source=>{
      const rows=await service.yybRequest('/accounts',undefined,undefined,services.override(source));
      if(!Array.isArray(rows))throw new ApiError('YYB 账号目录格式不正确',502);
      return rows.filter(row=>rawRef(row)).map(row=>({source,raw:row,rawRef:rawRef(row)}));
    }));
    const grouped=new Map();
    for(let i=0;i<results.length;i++){
      const result=results[i],source=active[i];
      if(result.status==='rejected'){issues.push({serviceId:source.id,serviceName:source.name,message:'账号目录读取失败，请检查服务地址与密钥'});continue;}
      for(const route of result.value){
        const identity=openid(route.raw),key=identity?`openid:${identity}`:routeKey(source,route.rawRef);
        let account=grouped.get(key);
        if(!account){const clean=cleanAccount(route.raw);account={...clean,ref:key,rawRef:route.rawRef,openid:identity,serviceId:source.id,serviceName:source.name,routes:[],aliases:[],_routes:[]};grouped.set(key,account);}
        account.routes.push({serviceId:source.id,serviceName:source.name,rawRef:route.rawRef,status:route.raw.status||'unknown'});
        account._routes.push(route);account.aliases.push(routeKey(source,route.rawRef));
        if(route.raw.status==='alive')account.status='alive';
      }
    }
    return {accounts:[...grouped.values()],issues,services:(await services.list()).services};
  }
  function match(accounts,ref){
    const exact=accounts.find(account=>account.ref===ref);if(exact)return exact;
    const matches=accounts.filter(account=>account.aliases?.includes(ref));
    if(matches.length>1)throw new ApiError('账号引用在多个 YYB 服务中重复，请选择对应的微信账号',400);
    return matches[0];
  }
  const enabled=(row,accounts)=>row.enabled_refs===null?accounts.map(account=>account.ref):[...new Set(row.enabled_refs.map(ref=>match(accounts,ref)?.ref||ref))];
  async function directory(){return (await readDirectory()).accounts.map(publicAccount);}
  async function publicState(){
    const [row,result,counts]=await Promise.all([config(),readDirectory(),database.query(`SELECT account_ref,count(*)::integer AS n FROM ${assignments} WHERE expires_at>$1 GROUP BY account_ref`,[Date.now()])]);
    const enabledRefs=enabled(row,result.accounts),loads=new Map();
    for(const item of counts.rows){const key=match(result.accounts,item.account_ref)?.ref||item.account_ref;loads.set(key,(loads.get(key)||0)+item.n);}
    return {revision:row.revision,algorithm:row.algorithm,enabledRefs,initialized:row.enabled_refs!==null,services:result.services,issues:result.issues,accounts:result.accounts.map(account=>({...publicAccount(account),enabled:enabledRefs.includes(account.ref),activeUsers:loads.get(account.ref)||0,assignedUsers:loads.get(account.ref)||0}))};
  }
  async function update(input){
    if(!input||!Number.isInteger(input.revision)||!accountAlgorithms.includes(input.algorithm)||!Array.isArray(input.enabledRefs)||input.enabledRefs.some(ref=>typeof ref!=='string'||!ref||ref.length>512)||new Set(input.enabledRefs).size!==input.enabledRefs.length)throw new ApiError('账号池及调度配置格式不正确',400);
    const [{accounts},previous]=await Promise.all([readDirectory(),config()]);
    const retained=new Set(previous.enabled_refs||[]),refs=input.enabledRefs.map(ref=>match(accounts,ref)?.ref||ref);
    if(refs.some(ref=>!accounts.some(account=>account.ref===ref)&&!retained.has(ref)))throw new ApiError('账号池包含不存在的账号，请刷新目录',400);
    const unique=[...new Set(refs)];
    const result=await database.query(`UPDATE ${settings} SET revision=revision+1,algorithm=$1,enabled_refs=$2::jsonb WHERE id=1 AND revision=$3 RETURNING revision`,[input.algorithm,JSON.stringify(unique),input.revision]);
    if(!result.rowCount)throw new ApiError('账号池已被更新，请刷新后重试',409);
    await database.query(`DELETE FROM ${assignments} WHERE NOT(account_ref=ANY($1::text[]))`,[unique]);
    for(const [userId,connection]of connections)if((connection.yybMode||'system')==='system'&&!connection.user?.yybRef&&!unique.includes(connection.account?.ref))connections.delete(userId);
    return publicState();
  }
  async function allowedRefs(user){if(user.yybRef)return [user.yybRef];const result=await readDirectory();return enabled(await config(),result.accounts).filter(ref=>result.accounts.some(account=>account.ref===ref));}
  async function resolve(userId,{fixedRef='',requestedRef='',accounts:provided}={}){
    const accounts=provided||(await readDirectory()).accounts;
    const fixed=fixedRef?match(accounts,fixedRef)?.ref:null;
    if(fixedRef){
      if(requestedRef&&(match(accounts,requestedRef)?.ref||requestedRef)!==(fixed||fixedRef))throw new ApiError('此学习账号未分配给当前用户',403);
      if(!fixed)throw new ApiError('分配的学习账号在 YYB 中不可用，请联系管理员',404);
      await database.query(`INSERT INTO ${assignments}(user_id,account_ref,expires_at) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET account_ref=excluded.account_ref,expires_at=excluded.expires_at`,[userId,fixed,Date.now()+timings.assignmentTtlMs]);return fixed;
    }
    return database.transaction(async tx=>{
      const row=(await tx.query(`SELECT * FROM ${settings} WHERE id=1 FOR UPDATE`)).rows[0];
      const refs=enabled(row,accounts).filter(ref=>accounts.some(account=>account.ref===ref));
      if(!refs.length)throw new ApiError('系统账号池中没有可用的 YYB 账号，请联系管理员',503);
      const previous=(await tx.query(`SELECT account_ref FROM ${assignments} WHERE user_id=$1 AND expires_at>$2`,[userId,Date.now()])).rows[0];
      const previousRef=previous?match(accounts,previous.account_ref)?.ref:null;
      let ref=refs.includes(previousRef)?previousRef:'';
      if(!ref){
        if(row.algorithm==='sticky')ref=refs[createHash('sha256').update(userId).digest().readUInt32BE(0)%refs.length];
        else if(row.algorithm==='least_loaded'){
          const counts=(await tx.query(`SELECT account_ref,count(*)::integer AS n FROM ${assignments} WHERE expires_at>$1 GROUP BY account_ref`,[Date.now()])).rows,load=new Map();
          for(const item of counts){const key=match(accounts,item.account_ref)?.ref||item.account_ref;load.set(key,(load.get(key)||0)+item.n);}
          ref=refs.reduce((best,candidate)=>(load.get(candidate)||0)<(load.get(best)||0)?candidate:best,refs[0]);
        }else ref=refs[Number(BigInt(row.cursor)%BigInt(refs.length))];
        await tx.query(`UPDATE ${settings} SET cursor=cursor+1 WHERE id=1`);
      }
      await tx.query(`INSERT INTO ${assignments}(user_id,account_ref,expires_at) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET account_ref=excluded.account_ref,expires_at=excluded.expires_at`,[userId,ref,Date.now()+timings.assignmentTtlMs]);return ref;
    });
  }
  const loginPlatform=(name,account,yyb,force=false,invalidToken)=>tokens.acquire(name,account,yyb,{force,invalidToken});
  async function lookup(ref){const {accounts}=await readDirectory(),account=match(accounts,ref);if(!account)throw new ApiError('所选 YYB 账号当前不可用',404);const route=account._routes.find(route=>route.raw.status==='alive')||account._routes[0];return {account:publicAccount(account),rawAccount:{...route.raw,ref:route.rawRef},rawRef:route.rawRef,yyb:services.override(route.source)};}
  async function acquireSource(userId,name,{force=false,invalidToken,reuseDirectory=false}={}){
    try{
      if(!['math','computer'].includes(name))throw new ApiError('未知学习资源来源',404);
      const runtime=service.getConfig();if(!runtime[name].enabled)throw new ApiError('该学科资源来源已停用，本地已有资源仍可使用',503);
      const user=await identities.user(userId);if(!user||user.status!=='active')throw new ApiError('当前 Web 账号不可用',403);
      const preferences=await identities.yybSettings(userId),override=userYybOverride(preferences);
      let account,routes;
      if(preferences.mode==='custom'){
        const rows=await service.yybRequest('/accounts',undefined,undefined,override);if(!Array.isArray(rows))throw new ApiError('资源来源账号目录格式不正确',502);
        const selected=preferences.ref?rows.find(row=>rawRef(row)===preferences.ref):rows.find(row=>row.status==='alive')||rows[0];
        if(!selected)throw new ApiError('本地缺少所需资源，所选来源暂无可用账号',503);
        account={...cleanAccount(selected),openid:openid(selected)};routes=[{raw:selected,rawRef:rawRef(selected),source:{id:'custom',name:'本人资源偏好',baseUrl:preferences.baseUrl,apiKey:preferences.apiKey}}];
      }else{
        const pool=await config();if(!user.yybRef&&Array.isArray(pool.enabled_refs)&&!pool.enabled_refs.length)throw new ApiError('本地缺少所需资源，系统账号池暂无可用来源',503);
        const result=await readDirectory({reuse:reuseDirectory&&!force}),ref=await resolve(userId,{fixedRef:user.yybRef,accounts:result.accounts});
        const selected=result.accounts.find(row=>row.ref===ref);account=publicAccount(selected);routes=selected._routes.slice().sort((a,b)=>Number(b.raw.status==='alive')-Number(a.raw.status==='alive'));
      }
      let failure;
      for(const route of routes){
        const yyb=preferences.mode==='custom'?override:services.override(route.source);
        try{
          const platformState=await loginPlatform(name,{...route.raw,ref:route.rawRef},yyb,force,invalidToken);
          if(!platformState?.connected)throw new ApiError('资源来源暂时不可用',502);
          return {account:{...account,serviceId:route.source.id,serviceName:route.source.name,rawRef:route.rawRef},platformState,yybMode:preferences.mode,yybBaseUrl:route.source.baseUrl,expires:platformState.auth?.expiresAt??null};
        }catch(error){failure=error;}
      }
      throw failure||new ApiError('本地缺少所需资源，系统账号池暂无可用来源',503);
    }catch(error){if(error.status===401||error.status===403)throw new ApiError('资源来源鉴权失败，请检查来源设置后重试',502);if(!Number.isInteger(error.status)||error.status>=500&&![502,503].includes(error.status))throw new ApiError('资源来源暂时不可用，请稍后重试',502);throw error;}
  }
  return {services,publicState,update,resolve,allowedRefs,loginPlatform,acquireSource,directory,lookup,async release(userId){await database.query(`DELETE FROM ${assignments} WHERE user_id=$1`,[userId]);}};
}

import {createHash} from 'node:crypto';

const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const failure=(message,status)=>Object.assign(new Error(message),{status});
export const isSourceAuthFailure=value=>Number(value?.status??value?.statusCode??value?.code??value?.Code)===401;
function jwtExpiry(token){
  try{const value=JSON.parse(Buffer.from(String(token).replace(/^Bearer\s+/i,'').split('.')[1],'base64url').toString('utf8'));return value.exp!==undefined&&Number.isFinite(Number(value.exp))&&Number(value.exp)>=0?Number(value.exp)*1000:null;}catch{return null;}
}
/** Expiry hints do not authenticate a JWT: the upstream still validates every request. */
export function tokenMetadata(name,data={},now=Date.now()){
  const candidates=[];
  const seconds=Number(data.expires_in);
  if(data.expires_in!==undefined&&Number.isFinite(seconds)&&seconds>=0)candidates.push({at:now+seconds*1000,source:'expires_in'});
  if(typeof data.valid_to==='string'&&/Z$|[+-]\d\d:\d\d$/.test(data.valid_to)){
    const at=Date.parse(data.valid_to);if(Number.isFinite(at))candidates.push({at,source:'valid_to'});
  }
  const jwt=jwtExpiry(data.access_token??data.token);if(jwt!==null)candidates.push({at:jwt,source:'jwt.exp'});
  candidates.sort((a,b)=>a.at-b.at);
  return {issuedAt:now,expiresAt:candidates[0]?.at??null,expirySource:candidates[0]?.source??'upstream_authentication',renewal:name==='math'?'oauth_reissue':'wx_refresh_or_login'};
}
export function tokenCacheKey(service,name,account,yyb){
  const config=service.getConfig(),platform=config[name];
  const auth=name==='math'?['baseUrl','appId','stationId','loginId','enabled']:['baseUrl','appId','tenantCode','oauthClientId','oauthClientSecret','enabled'];
  const identity=account.openid?{openid:String(account.openid)}:{ref:String(account.ref??account.id??''),yyb:yyb||config.yyb};
  return createHash('sha256').update(JSON.stringify(stable({name,identity,auth:Object.fromEntries(auth.map(key=>[key,platform?.[key]]))}))).digest('hex');
}
const subject=(name,state)=>String(name==='math'?state?.stuId||state?.user?.StuID||'':state?.user?.userId||'');
const renewableError=error=>[400,401,403,404,405,501].includes(Number(error?.status))||error?.code==='REFRESH_UNSUPPORTED';

/** One authentication handshake per verified source identity, including concurrent expiry recovery. */
export function createTokenLifecycle({service,now=Date.now}){
  const entries=new Map(),counts={logins:0,renewals:0,reused:0};
  const expired=state=>Number.isFinite(state?.auth?.expiresAt)&&state.auth.expiresAt<=now();
  async function acquire(name,account,yyb,{force=false,invalidToken,freshLogin=false}={}){
    const key=tokenCacheKey(service,name,account,yyb),entry=entries.get(key);
    if(entry?.state&&!freshLogin&&!expired(entry.state)&&(!force||invalidToken&&entry.state.token!==invalidToken)){
      counts.reused++;return structuredClone(entry.state);
    }
    if(entry?.pending)return structuredClone(await entry.pending);
    const current=entry?.state,slot=entry||{};
    const work=(async()=>{
      let state;
      if(current&&!freshLogin&&service.refreshPlatform){
        try{state=await service.refreshPlatform(name,structuredClone(current),yyb);counts.renewals++;}
        catch(error){if(!renewableError(error))throw error;}
      }
      if(!state){state=await service.loginPlatform(name,account,yyb);counts.logins++;}
      if(!state?.connected||!state?.token)throw failure('来源未返回有效的学习令牌',502);
      if(current&&!freshLogin&&subject(name,current)&&subject(name,state)&&subject(name,current)!==subject(name,state))throw failure('来源续期返回了不同的学习身份，请重新确认账号',409);
      state={...state,auth:state.auth||tokenMetadata(name,{token:state.token},now())};
      slot.state=structuredClone(state);return state;
    })();
    slot.pending=work;entries.set(key,slot);
    try{return structuredClone(await work);}finally{if(slot.pending===work)delete slot.pending;if(!slot.state)entries.delete(key);}
  }
  return {acquire,clear:()=>entries.clear(),snapshot:()=>({...counts,identities:entries.size})};
}

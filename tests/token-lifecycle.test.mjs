import test from 'node:test';
import assert from 'node:assert/strict';
import {createTokenLifecycle,tokenMetadata,isSourceAuthFailure} from '../server/integrations/token-lifecycle.mjs';
import {createUpstreamClient} from '../server/integrations/upstream.mjs';
import {readPlatformDefaults} from '../server/integrations/platform-config.mjs';
import {createResourceSync} from '../server/modules/resources/sync.mjs';

const jwt=payload=>`header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
const config=()=>readPlatformDefaults({env:{YYB_BASE_URL:'https://yyb.example'},readLocal:false});
const account={ref:'source',openid:'same-wechat'};
const state=(token='opaque',expiresAt=null)=>({connected:true,token,stuId:'math-student',user:{StuID:'math-student',userId:'computer-student'},auth:{issuedAt:0,expiresAt}});

test('expiry uses the earliest real protocol hint and unknown expiry has no arbitrary lifetime',()=>{
  assert.equal(tokenMetadata('computer',{expires_in:100,access_token:jwt({exp:160})},100000).expiresAt,160000);
  const now=Date.parse('2026-10-29T20:00:00+08:00');
  const math=tokenMetadata('math',{valid_to:'2026-10-30T20:00:00+08:00',access_token:jwt({exp:(now+3600000)/1000})},now);
  assert.equal(math.expiresAt,now+3600000);assert.equal(math.expirySource,'jwt.exp');
  assert.equal(tokenMetadata('math',{access_token:'opaque'},now).expiresAt,null);
  assert.equal(isSourceAuthFailure({statusCode:401}),true);assert.equal(isSourceAuthFailure({code:4127}),false);
});

test('an opaque token stays reusable beyond the previous fixed pool and personal cache lifetimes',async()=>{
  let clock=0,logins=0;
  const service={getConfig:config,loginPlatform:async()=>{logins++;return state();}};
  const tokens=createTokenLifecycle({service,now:()=>clock});
  await tokens.acquire('math',account);clock=72*3600000;
  await tokens.acquire('math',account);assert.equal(logins,1);
});

test('concurrent real expiry is renewed once and late failures for the old token reuse the renewed state',async()=>{
  let clock=0,logins=0,renewals=0;
  const service={getConfig:config,loginPlatform:async()=>{logins++;return state('old',100);},refreshPlatform:async()=>{renewals++;await new Promise(resolve=>setTimeout(resolve,5));return state('new',1000);}};
  const tokens=createTokenLifecycle({service,now:()=>clock});await tokens.acquire('math',account);clock=100;
  const results=await Promise.all(Array.from({length:8},()=>tokens.acquire('math',account)));
  assert.ok(results.every(result=>result.token==='new'));assert.equal(renewals,1);assert.equal(logins,1);
  await tokens.acquire('math',account,undefined,{force:true,invalidToken:'old'});assert.equal(renewals,1);
});

test('verified openid reuses authentication across YYB routes while different platform domains and unknown identities remain separate',async()=>{
  let logins=0,cfg=config();
  const service={getConfig:()=>cfg,loginPlatform:async()=>{logins++;return state();}},tokens=createTokenLifecycle({service});
  await tokens.acquire('math',account,{baseUrl:'https://one.example',apiKey:'one'});
  await tokens.acquire('math',{...account,ref:'other-ref'},{baseUrl:'https://two.example',apiKey:'two'});assert.equal(logins,1);
  cfg={...cfg,math:{...cfg.math,stationId:2}};await tokens.acquire('math',account);assert.equal(logins,2);
  await tokens.acquire('math',{ref:'legacy'},{baseUrl:'https://one.example'});
  await tokens.acquire('math',{ref:'legacy'},{baseUrl:'https://two.example'});assert.equal(logins,4);
});

test('failed explicit personal verification preserves the valid shared token and does not block ordinary reads',async()=>{
  let logins=0,rejectLogin;
  const service={getConfig:config,loginPlatform:async()=>{logins++;if(logins===1)return state('valid');return new Promise((resolve,reject)=>{rejectLogin=reject;});}};
  const tokens=createTokenLifecycle({service});await tokens.acquire('math',account);
  const verification=tokens.acquire('math',account,undefined,{freshLogin:true});
  const check=assert.rejects(verification,{status:502});
  assert.equal((await tokens.acquire('math',account)).token,'valid');
  rejectLogin(Object.assign(new Error('source unavailable'),{status:502}));await check;
  assert.equal((await tokens.acquire('math',account)).token,'valid');assert.equal(logins,2);
});

test('renewal transport failures do not trigger a new WeChat login; rejected authentication does',async()=>{
  let logins=0,status=502;
  const service={getConfig:config,loginPlatform:async()=>{logins++;return state(`login-${logins}`);},refreshPlatform:async()=>{throw Object.assign(new Error('renewal failed'),{status});}};
  const tokens=createTokenLifecycle({service});await tokens.acquire('computer',account);
  await assert.rejects(tokens.acquire('computer',account,undefined,{force:true}),{status:502});assert.equal(logins,1);
  status=401;await tokens.acquire('computer',account,undefined,{force:true});assert.equal(logins,2);
});

test('Math renews directly through OAuth using its verified subject and rejects a changed subject',async()=>{
  const cfg=config(),paths=[];let changed=false;
  const client=createUpstreamClient(cfg,{requestJson:async(url)=>{paths.push(new URL(url).pathname);return {Code:200,Data:{access_token:'renewed',valid_to:'2026-10-30T20:00:00+08:00',User:{StuID:changed?'other':'math-student'}}};}});
  const result=await client.refreshPlatform('math',state());assert.equal(result.token,'renewed');assert.ok(result.auth.expiresAt);
  assert.deepEqual(paths,['/api/OAuth2/Login']);changed=true;
  await assert.rejects(client.refreshPlatform('math',state()),{status:409});
});

test('Computer declared refresh protocol rotates credentials and an unavailable endpoint is probed once per authentication domain',async()=>{
  const cfg=config(),paths=[];let unavailable=false;
  const client=createUpstreamClient(cfg,{requestJson:async(url,options)=>{
    paths.push(new URL(url).pathname);assert.equal(options.method,'GET');assert.equal(new URL(url).searchParams.get('refresh_token'),'refresh-old');
    if(unavailable)throw Object.assign(new Error('not found'),{status:404});
    return {access_token:'access-new',refresh_token:'refresh-new',expires_in:3600};
  }});
  const current={...state(),refreshToken:'refresh-old'};
  const result=await client.refreshPlatform('computer',current);assert.equal(result.refreshToken,'refresh-new');assert.equal(result.token,'access-new');assert.equal(result.auth.expirySource,'expires_in');
  unavailable=true;await assert.rejects(client.refreshPlatform('computer',current),{status:404});
  await assert.rejects(client.refreshPlatform('computer',current),{status:501});assert.equal(paths.length,2);
});

test('resource business failures do not renew authentication while a real source 401 does',async()=>{
  const calls=[];let code=4127;
  const service={getConfig:config,computerRequest:async()=>({code:code===401&&calls.some(call=>call.force)?200:code,data:[]})};
  const accountPool={acquireSource:async(userId,name,options)=>{calls.push(options);return {platformState:state(calls.length>1?'new':'old')};}};
  const sync=createResourceSync({store:{},service,accountPool});
  const args={session:{user:{id:'web'}},name:'computer',path:'/resource',input:{method:'GET'}};
  assert.equal((await sync.requestSource(args)).code,4127);assert.equal(calls.length,1);assert.equal(calls[0].force,false);
  code=401;assert.equal((await sync.requestSource(args)).code,200);assert.equal(calls.at(-1).force,true);assert.equal(calls.at(-1).invalidToken,'new');
});

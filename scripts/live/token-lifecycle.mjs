import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createTestDatabase} from '../../tests/support/database.mjs';
import {createPlatformConfigStore} from '../../server/integrations/platform-config.mjs';
import {createUpstreamClient,requestJson,decodeMath} from '../../server/integrations/upstream.mjs';
import {createTokenLifecycle} from '../../server/integrations/token-lifecycle.mjs';
import {readLivePlatformConfig} from './managed-config.mjs';

const defaults=await readLivePlatformConfig();
const database=await createTestDatabase(),calls=[],results=[],metadata={};
const record=(name,evidence={})=>{results.push({name,passed:true,...evidence});console.log(JSON.stringify(results.at(-1)));};
try{
  const configuration=await createPlatformConfigStore({database,defaults,env:{}});
  const service=createUpstreamClient(()=>configuration.snapshot(),{requestJson:async(url,options={})=>{
    const path=new URL(url).pathname,method=String(options.method||'GET').toUpperCase();
    const profileRead=path==='/api/Master/AutoModel'&&options.body instanceof URLSearchParams&&options.body.get('command')==='GetUserInfoByStuID';
    assert.ok(method==='GET'||profileRead||['/api/OAuth2/Login','/api/auth/wx/token','/wxapp/getCode'].includes(path),'认证验收禁止源学习写入');
    const call={path,method};calls.push(call);
    try{
      const body=await requestJson(url,options);
      if(['/api/OAuth2/Login','/api/auth/wx/token'].includes(path)){
        const decoded=path.includes('OAuth2')?decodeMath(body):body,data=decoded.Data??decoded.data??decoded;
        metadata[path]={fields:Object.keys(data),expiresIn:data.expires_in??null,validFrom:data.valid_from??null,validTo:data.valid_to??null,refreshTokenProvided:!!data.refresh_token};
      }
      return body;
    }catch(error){call.status=Number(error.status)||502;throw error;}
  }});
  const account=(await service.yybRequest('/accounts')).find(item=>item.status==='alive'&&item.openid);
  assert.ok(account,'需要带openid的真实可用YYB账号');account.ref=String(account.id??account.ref);
  const tokens=createTokenLifecycle({service});
  const math=await tokens.acquire('math',account),computer=await tokens.acquire('computer',account);
  for(const value of [math,computer])assert.ok(value.auth.expiresAt>Date.now(),'真实登录须提供可解释的未来有效期');
  record('两科真实认证有效期来自源协议',{mathExpirySource:math.auth.expirySource,computerExpirySource:computer.auth.expirySource,computerRefreshTokenProvided:!!computer.refreshToken});
  const beforeReuse=calls.length;
  await Promise.all(Array.from({length:8},()=>tokens.acquire('math',account)));
  await Promise.all(Array.from({length:8},()=>tokens.acquire('computer',account)));
  assert.equal(calls.length,beforeReuse);record('有效token并发复用不登录',{additionalSourceRequests:0});
  await tokens.acquire('math',{...account,ref:'another-transport-ref'},{baseUrl:'https://uncontacted-transport.example'});
  assert.equal(calls.length,beforeReuse);record('同openid切换访问路径复用已确认平台身份',{additionalSourceRequests:0,transportProbe:false});
  const beforeMath=calls.length,renewedMath=await tokens.acquire('math',account,undefined,{force:true,invalidToken:math.token});
  assert.deepEqual(calls.slice(beforeMath).map(call=>call.path),['/api/OAuth2/Login']);
  assert.equal(String(renewedMath.stuId),String(math.stuId));record('数学恢复仅OAuth续签且保持真实StuID',{wechatCodeRequests:0,oauthRequests:1});
  const mathProfile=await service.mathRequest('/api/Master/AutoModel',{method:'POST',data:{command:'GetUserInfoByStuID',data:JSON.stringify({StuID:renewedMath.stuId,System_Station_ID:service.getConfig().math.stationId})}},renewedMath);
  assert.notEqual(mathProfile.SuccessResponse,false);record('数学续期后真实资料读取成功');
  const beforeComputer=calls.length,renewedComputer=await tokens.acquire('computer',account,undefined,{force:true,invalidToken:computer.token});
  const recovery=calls.slice(beforeComputer),refresh=recovery.find(call=>call.path==='/api/auth/wx/refreshToken');
  assert.ok(refresh,'首次恢复验证小程序声明的刷新协议');
  if(refresh.status){assert.ok([404,405,501].includes(refresh.status));assert.ok(recovery.some(call=>call.path==='/wxapp/getCode'));}
  assert.equal(String(renewedComputer.user.userId),String(computer.user.userId));
  record('计算机真实刷新能力与微信code恢复',{declaredRefreshStatus:refresh.status??200,codeFallback:recovery.some(call=>call.path==='/wxapp/getCode')});
  const computerProfile=await service.computerRequest('/api/user/wx/user/detail',{},renewedComputer);
  assert.equal(computerProfile.code,200);record('计算机恢复后真实资料读取成功');
  if(refresh.status){
    const beforeFallback=calls.length;
    await tokens.acquire('computer',account,undefined,{force:true,invalidToken:renewedComputer.token});
    assert.equal(calls.slice(beforeFallback).some(call=>call.path==='/api/auth/wx/refreshToken'),false);
    record('同认证域不重复探测已确认不可用的刷新接口');
  }
  const last=calls.length;await tokens.acquire('math',account);await tokens.acquire('computer',account);
  assert.equal(calls.length,last);record('恢复后的token继续复用',{additionalSourceRequests:0});
  mkdirSync('artifacts',{recursive:true});
  writeFileSync('artifacts/token-lifecycle-live.json',JSON.stringify({checkedAt:new Date().toISOString(),results,metadata,authenticationRequests:calls,sourceLearningWrites:0,manager:tokens.snapshot(),recoveryTrigger:'explicit recovery exercise; real tokens were not waited to expire'},null,2));
}finally{await database.close();}

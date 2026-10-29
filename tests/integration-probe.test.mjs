import test from 'node:test';
import assert from 'node:assert/strict';
import {startHttpApp} from './http-app.mjs';
import {readPlatformDefaults} from '../server/platform-config.mjs';
import {ApiError} from '../server/upstream.mjs';

const fixture=()=>{
  const calls=[];
  return {calls,configurationDefaults:readPlatformDefaults({env:{YYB_BASE_URL:'https://unused-default.example',MATH_BASE_URL:'https://math.example',COMPUTER_BASE_URL:'https://computer.example'},readLocal:false}),requestJson:async(input,options={})=>{
    const url=new URL(input);calls.push({url,options});
    if(url.hostname==='unused-default.example')throw new ApiError('default source is unavailable',503);
    if(url.hostname==='failed-source.example')throw new ApiError('source unavailable',502);
    if(url.pathname==='/accounts')return {code:0,data:[{id:'service-local-ref',openid:'verified-wechat',nickname:'资源账号',status:'alive'}]};
    if(url.pathname==='/wxapp/getCode')return {code:0,data:{code:'source-code'}};
    if(url.pathname==='/api/wx_xcx_info/GetListByAll')return {SuccessResponse:true,data:[{Parm3:'1'}]};
    if(url.pathname.includes('CheckCode'))return {data:{SysUserInfo:{StuID:'math-subject'}}};
    if(url.pathname==='/api/OAuth2/Login')return {Data:{access_token:'private-math-token',User:{StuID:'math-subject'}}};
    if(url.pathname==='/api/Master/AutoModel')return {SuccessResponse:true,data:[[{StuID:'math-subject'}]]};
    if(url.pathname==='/api/auth/wx/token')return {access_token:'private-computer-token'};
    if(url.pathname==='/api/user/wx/user/detail'){
      if(!options.headers?.Authorization)throw new ApiError('authentication required',401);
      return {code:200,data:{userId:'computer-subject'}};
    }
    throw new ApiError('unexpected source path',404);
  }};
};
async function json(app,path,auth,body,method=body===undefined?'GET':'POST'){
  const response=await app.request(path,{auth,body,method}),value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;
}
async function configure(app,admin){
  await json(app,'/api/admin/yyb-services/default',admin,{revision:0,enabled:false},'PATCH');
  const created=await app.request('/api/admin/yyb-services',{auth:admin,body:{name:'系统来源二',baseUrl:'https://second-source.example',apiKey:'second-private-key'}});
  assert.equal(created.status,201);
}

test('anonymous platform integration checks do not inspect the removed default YYB configuration',async()=>{
  const f=fixture(),app=await startHttpApp(f);
  try{
    const admin=await app.setup();await configure(app,admin);f.calls.length=0;
    const result=await json(app,'/api/admin/configuration/probe',admin,{target:'all'});
    assert.equal(result.target,'all');assert.equal(result.ok,true);assert.equal(result.checks.length,2);
    assert.deepEqual(new Set(f.calls.map(call=>call.url.hostname)),new Set(['math.example','computer.example']));
    assert.equal(f.calls.some(call=>['/accounts','/health','/wxapp/getCode'].includes(call.url.pathname)),false);
  }finally{await app.close();}
});

test('selected platform identity checks use the account pool service route and its local ref',async()=>{
  const f=fixture(),app=await startHttpApp(f);
  try{
    const admin=await app.setup();await configure(app,admin);f.calls.length=0;
    const result=await json(app,'/api/admin/configuration/probe',admin,{target:'all',ref:'openid:verified-wechat'});
    assert.equal(result.ok,true);assert.equal(result.checks.length,4);
    const codes=f.calls.filter(call=>call.url.pathname==='/wxapp/getCode');assert.equal(codes.length,2);
    for(const call of codes){assert.equal(call.url.hostname,'second-source.example');assert.equal(call.options.headers.Authorization,'Bearer second-private-key');assert.equal(JSON.parse(call.options.body).ref,'service-local-ref');}
    assert.equal(f.calls.some(call=>call.url.hostname==='unused-default.example'),false);
    assert.equal(JSON.stringify(result).includes('private-key'),false);assert.equal(JSON.stringify(result).includes('private-math-token'),false);
  }finally{await app.close();}
});

test('legacy YYB probe targets the enabled service registry and reports partial failure',async()=>{
  const f=fixture(),app=await startHttpApp(f);
  try{
    const admin=await app.setup();await configure(app,admin);
    const added=await app.request('/api/admin/yyb-services',{auth:admin,body:{name:'故障来源',baseUrl:'https://failed-source.example'}});assert.equal(added.status,201);f.calls.length=0;
    const result=await json(app,'/api/admin/configuration/probe',admin,{target:'yyb'});
    assert.equal(result.ok,false);assert.equal(result.checks.length,2);
    assert.ok(result.checks.some(check=>check.name==='系统来源二账号目录'&&check.ok));
    assert.ok(result.checks.some(check=>check.name==='故障来源账号目录'&&!check.ok));
    assert.equal(f.calls.some(call=>call.url.hostname==='unused-default.example'||call.url.pathname==='/health'),false);
  }finally{await app.close();}
});

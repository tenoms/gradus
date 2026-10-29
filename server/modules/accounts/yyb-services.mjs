import { randomUUID } from 'node:crypto';
import { ApiError } from '../../infrastructure/api-error.mjs';

const defaultId='default';
const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new ApiError(`${label}格式不正确`,400);return value.trim();};
const endpoint=value=>{const clean=text(value,2000,'YYB 服务地址');let url;try{url=new URL(clean);}catch{throw new ApiError('YYB 服务地址必须为完整 HTTP 或 HTTPS 地址',400);}if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new ApiError('YYB 服务地址不能包含凭据、查询或片段',400);return url.href.replace(/\/+$/,'');};

/** System YYB transports are separate from user-owned personal associations. */
export async function createYybServices({database,service}){
  const table=database.web('yyb_services');
  await database.query(`CREATE TABLE IF NOT EXISTS ${table}(id text PRIMARY KEY,name text NOT NULL,base_url text,api_key text,enabled boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now())`);
  const defaults=()=>({id:defaultId,name:'默认 YYB 服务',baseUrl:service.getConfig().yyb.baseUrl,apiKey:service.getConfig().yyb.apiKey,enabled:true,revision:0,usesPlatformConfig:true});
  const value=row=>({id:row.id,name:row.name,baseUrl:row.base_url===null?service.getConfig().yyb.baseUrl:row.base_url,apiKey:row.api_key===null?service.getConfig().yyb.apiKey:row.api_key,enabled:row.enabled,revision:row.revision,usesPlatformConfig:row.base_url===null&&row.api_key===null});
  async function all(){const rows=(await database.query(`SELECT * FROM ${table} ORDER BY created_at,id`)).rows.map(value);return rows.some(row=>row.id===defaultId)?rows:[defaults(),...rows];}
  const safe=row=>({id:row.id,name:row.name,baseUrl:row.baseUrl,apiKeyConfigured:!!row.apiKey,enabled:row.enabled,revision:row.revision,usesPlatformConfig:row.usesPlatformConfig});
  const override=row=>row.usesPlatformConfig?undefined:{baseUrl:row.baseUrl,apiKey:row.apiKey};
  async function list(){return {services:(await all()).map(safe)};}
  async function save(input,id){
    if(!input||typeof input!=='object'||Array.isArray(input))throw new ApiError('YYB 服务配置格式不正确',400);
    const current=id?(await all()).find(row=>row.id===id):null;
    if(id&&!current)throw new ApiError('YYB 服务不存在',404);
    if(id&&(!Number.isInteger(input.revision)||input.revision!==current.revision))throw new ApiError('YYB 服务已更新，请刷新后重试',409);
    if(input.enabled!==undefined&&typeof input.enabled!=='boolean')throw new ApiError('YYB 服务启用状态必须为布尔值',400);
    if(input.apiKey!==undefined&&(typeof input.apiKey!=='string'||input.apiKey.length>4096))throw new ApiError('YYB API Key 格式不正确',400);
    if(input.clearApiKey!==undefined&&typeof input.clearApiKey!=='boolean'||input.clearApiKey&&input.apiKey)throw new ApiError('YYB API Key 清除选项格式不正确',400);
    const name=input.name===undefined&&current?current.name:text(input.name,80,'YYB 服务名称');
    const baseUrl=input.baseUrl===undefined&&current?current.baseUrl:endpoint(input.baseUrl);
    const changedEndpoint=!!current&&baseUrl!==current.baseUrl;
    const apiKey=input.clearApiKey?'':input.apiKey||(!changedEndpoint?current?.apiKey:'')||'';
    const enabled=input.enabled??current?.enabled??true,serviceId=id||randomUUID(),revision=(current?.revision||0)+1;
    const result=await database.query(`INSERT INTO ${table} AS existing(id,name,base_url,api_key,enabled,revision) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET name=excluded.name,base_url=excluded.base_url,api_key=excluded.api_key,enabled=excluded.enabled,revision=excluded.revision WHERE existing.revision=$7 RETURNING id`,[serviceId,name,baseUrl,apiKey,enabled,revision,current?.revision??0]);
    if(!result.rowCount)throw new ApiError('YYB 服务已更新，请刷新后重试',409);
    return list();
  }
  async function remove(id,revision){
    const current=(await all()).find(row=>row.id===id);if(!current)throw new ApiError('YYB 服务不存在',404);
    if(!Number.isInteger(revision)||revision!==current.revision)throw new ApiError('YYB 服务已更新，请刷新后重试',409);
    if(id===defaultId){
      const result=await database.query(`INSERT INTO ${table} AS existing(id,name,base_url,api_key,enabled,revision) VALUES($1,$2,NULL,NULL,false,$3) ON CONFLICT(id) DO UPDATE SET enabled=false,revision=excluded.revision WHERE existing.revision=$4 RETURNING id`,[id,current.name,current.revision+1,current.revision]);
      if(!result.rowCount)throw new ApiError('YYB 服务已更新，请刷新后重试',409);
    }else{
      const result=await database.query(`DELETE FROM ${table} WHERE id=$1 AND revision=$2`,[id,revision]);if(!result.rowCount)throw new ApiError('YYB 服务已更新，请刷新后重试',409);
    }
    return list();
  }
  async function probe(id){
    const source=(await all()).find(row=>row.id===id);if(!source)throw new ApiError('YYB 服务不存在',404);
    const started=Date.now();
    try{const rows=await service.yybRequest('/accounts',undefined,undefined,override(source));if(!Array.isArray(rows))throw new Error();return {id,name:source.name,ok:true,accountCount:rows.length,checkedAt:new Date().toISOString(),durationMs:Date.now()-started};}
    catch{return {id,name:source.name,ok:false,message:'无法读取此 YYB 服务的账号目录，请检查地址和密钥',checkedAt:new Date().toISOString(),durationMs:Date.now()-started};}
  }
  return {all,list,save,remove,probe,override};
}

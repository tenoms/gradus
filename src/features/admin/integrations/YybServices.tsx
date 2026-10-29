import { useEffect, useState } from "react";
import { Check, CircleAlert, Link2, LoaderCircle, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { api } from "../../../shared/api/client";

type YybService={id:string;name:string;baseUrl:string;apiKeyConfigured:boolean;enabled:boolean;revision:number;usesPlatformConfig:boolean};
type Services={services:YybService[]};
type Draft={name:string;baseUrl:string;apiKey:string;clearApiKey:boolean;enabled:boolean};
const blank:Draft={name:"",baseUrl:"",apiKey:"",clearApiKey:false,enabled:true};
const message=(cause:unknown)=>cause instanceof Error?cause.message:"操作未完成，请重试";

export default function YybServices({onChanged}:{onChanged:()=>Promise<void>}){
  const [services,setServices]=useState<YybService[]>([]),[editing,setEditing]=useState<string>(),[draft,setDraft]=useState<Draft>(blank),[busy,setBusy]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const current=services.find(source=>source.id===editing);
  const accept=(value:Services)=>setServices(value.services);
  async function action(name:string,work:()=>Promise<void>){setBusy(name);setError("");setNotice("");try{await work();}catch(cause){setError(message(cause));}finally{setBusy("");}}
  useEffect(()=>{void action("load",async()=>accept(await api<Services>("/api/admin/yyb-services")));},[]);
  const edit=(source?:YybService)=>{setEditing(source?.id||"new");setDraft(source?{name:source.name,baseUrl:source.baseUrl,apiKey:"",clearApiKey:false,enabled:source.enabled}:{...blank});setError("");setNotice("");};
  const field=<K extends keyof Draft>(key:K,value:Draft[K])=>setDraft(previous=>({...previous,[key]:value}));
  return <section className="panel data-card yyb-services">
    <div className="data-heading"><Link2 size={22}/><div><h2>系统 YYB 服务</h2><p>为资源池配置多个服务地址。相同微信账号按 openid 合并为一个调度账号，多个服务作为可替代访问路径。</p></div><button className="btn btn-secondary" disabled={!!busy} onClick={()=>edit()}><Plus size={15}/>新增服务</button></div>
    {error&&<p className="error-banner" role="alert"><CircleAlert size={16}/>{error}</p>}
    {notice&&<p className="notice" role="status"><Check size={16}/>{notice}</p>}
    {busy==="load"&&<p role="status"><LoaderCircle size={17} className="spin"/>正在读取 YYB 服务…</p>}
    <div className="yyb-service-list">{services.map(source=><article key={source.id} className="yyb-service-row"><div><strong>{source.name}</strong><span className={`data-sync-badge ${source.enabled?"is-enabled":""}`}>{source.enabled?"已启用":"已停用"}</span><p>{source.baseUrl||"尚未填写服务地址"}</p><small>{source.apiKeyConfigured?"API Key 已配置":"无需密钥或尚未配置"}{source.usesPlatformConfig?" · 使用平台集成中的默认配置":""}</small></div><div className="yyb-service-actions"><button className="btn btn-secondary" disabled={!!busy} onClick={()=>void action(`probe:${source.id}`,async()=>{const result=await api<{ok:boolean;accountCount?:number;message?:string}>(`/api/admin/yyb-services/${source.id}/probe`,{method:"POST"});if(result.ok)setNotice(`${source.name}可用，目录包含 ${result.accountCount} 个账号。`);else setError(result.message||"此服务暂时不可用。");})}>{busy===`probe:${source.id}`?<LoaderCircle size={14} className="spin"/>:<Link2 size={14}/>}检测</button><button className="btn btn-secondary" aria-label={`编辑${source.name}`} disabled={!!busy} onClick={()=>edit(source)}><Pencil size={14}/>编辑</button><button className="btn btn-secondary" aria-label={`${source.id==="default"?"停用":"移除"}${source.name}`} disabled={!!busy} onClick={()=>void action(`remove:${source.id}`,async()=>{accept(await api<Services>(`/api/admin/yyb-services/${source.id}`,{method:"DELETE",body:JSON.stringify({revision:source.revision})}));if(editing===source.id)setEditing(undefined);await onChanged();setNotice(source.id==="default"?"默认服务已停用，其余服务继续提供资源。":"服务已移除，其他服务和已保存资源继续可用。");})}><Trash2 size={14}/>{source.id==="default"?"停用":"移除"}</button></div></article>)}</div>
    {editing&&<form className="yyb-service-editor" onSubmit={event=>{event.preventDefault();void action("save",async()=>{accept(await api<Services>(editing==="new"?"/api/admin/yyb-services":`/api/admin/yyb-services/${editing}`,{method:editing==="new"?"POST":"PATCH",body:JSON.stringify({name:draft.name,baseUrl:draft.baseUrl,enabled:draft.enabled,...(draft.apiKey?{apiKey:draft.apiKey}:{}),...(draft.clearApiKey?{clearApiKey:true}:{}),...(current?{revision:current.revision}:{})})}));setEditing(undefined);setDraft({...blank});await onChanged();setNotice("YYB 服务已保存，后续资源请求自动使用最新配置。");});}}>
      <div className="data-heading"><h3>{editing==="new"?"新增 YYB 服务":`编辑 ${current?.name||"YYB 服务"}`}</h3><button type="button" className="btn btn-secondary" disabled={!!busy} onClick={()=>setEditing(undefined)}><X size={14}/>取消</button></div>
      <div className="yyb-service-fields"><label className="field-label">服务名称<input className="input" required maxLength={80} value={draft.name} onChange={event=>field("name",event.target.value)} disabled={!!busy}/></label><label className="field-label">YYB 服务地址<input className="input" type="url" required placeholder="https://yyb.example.com" value={draft.baseUrl} onChange={event=>field("baseUrl",event.target.value)} disabled={!!busy}/></label><label className="field-label">API Key（可选）<input className="input" type="password" autoComplete="new-password" placeholder={current?.apiKeyConfigured?"留空保留现有密钥":"服务要求认证时填写"} value={draft.apiKey} onChange={event=>{field("apiKey",event.target.value);field("clearApiKey",false);}} disabled={!!busy}/></label></div>
      {current?.apiKeyConfigured&&<label className="data-switch"><input type="checkbox" checked={draft.clearApiKey} disabled={!!busy} onChange={event=>{field("clearApiKey",event.target.checked);if(event.target.checked)field("apiKey","");}}/>清除已保存的 API Key</label>}
      {current&&current.baseUrl!==draft.baseUrl&&<p className="data-sync-help">更换地址后旧密钥不再沿用，需要认证时请填写新密钥。</p>}
      <label className="data-switch"><input type="checkbox" checked={draft.enabled} disabled={!!busy} onChange={event=>field("enabled",event.target.checked)}/>允许此服务为系统资源池提供账号</label><button className="btn btn-primary" disabled={!!busy}>{busy==="save"?<LoaderCircle size={15} className="spin"/>:<Save size={15}/>}保存服务</button>
    </form>}
  </section>;
}

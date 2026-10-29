import { createHash } from 'node:crypto';
import { ApiError } from './upstream.mjs';
import { stripSharedPersonalState } from './shared-account-policy.mjs';
import { publicPlatformResponse } from './platform-policy.mjs';
import { resourceKey, resourceRows, resourceMedia, resourceScope, publicResourceResponse } from './resource-catalog.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = value => value instanceof Date ? value.toISOString() : value;
const safeSource = row => ({ id: row.id, platform: row.platform, accountRef: row.account_ref, scope:row.metadata?.scope||'account', createdAt: iso(row.created_at), lastSeenAt: iso(row.last_seen_at) });
const summary = row => ({sourceId:row.source_id,platform:row.platform,key:row.request_key,scope:row.scope,kind:row.kind,path:row.request?.path||'',command:row.request?.data?.command||'',title:row.title||row.request?.data?.command||row.request?.path||'',revision:row.revision,syncedAt:iso(row.synced_at),changedAt:iso(row.changed_at),expiresAt:iso(row.expires_at)||null,expired:!row.expires_at||new Date(row.expires_at).getTime()<=Date.now()});
const defaultExpiry = scope => scope==='public'?new Date(Date.now()+6*60*60*1000).toISOString():null;
const expires = value => {if(value===null)return null;const date=new Date(value);if(Number.isNaN(date.getTime()))throw new ApiError('资源更新期限格式不正确',400);return date.toISOString();};
const safeSettings = row => ({ enabled: row.enabled, revision: row.revision, updatedAt: iso(row.updated_at) });
export async function createResourceStore(database) {
  const resources = database.upstream('resources'), sources = database.upstream('resource_sources');
  const media = database.upstream('resource_media'), entities = database.upstream('resource_entities'), settings = database.web('resource_sync_settings');
  await database.query(`CREATE TABLE IF NOT EXISTS ${sources} (id text PRIMARY KEY, platform text NOT NULL, account_ref text NOT NULL, metadata jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now())`);
  await database.query(`CREATE TABLE IF NOT EXISTS ${resources} (source_id text NOT NULL REFERENCES ${sources}(id), platform text NOT NULL, request_key text NOT NULL, scope text NOT NULL, kind text NOT NULL, request jsonb NOT NULL, response jsonb NOT NULL, content_hash text NOT NULL, revision integer NOT NULL DEFAULT 1, synced_at timestamptz NOT NULL DEFAULT now(), changed_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz, title text NOT NULL DEFAULT '', context jsonb NOT NULL DEFAULT '{}', PRIMARY KEY(source_id,platform,request_key))`);
  await database.query(`ALTER TABLE ${resources} ADD COLUMN IF NOT EXISTS expires_at timestamptz, ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}'`);
  await database.query(`CREATE INDEX IF NOT EXISTS resource_kind_synced ON ${resources}(platform,kind,synced_at DESC)`);
  await database.query(`CREATE TABLE IF NOT EXISTS ${media} (source_id text NOT NULL, platform text NOT NULL, request_key text NOT NULL, url text NOT NULL, observed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(source_id,platform,request_key,url), FOREIGN KEY(source_id,platform,request_key) REFERENCES ${resources}(source_id,platform,request_key) ON DELETE CASCADE)`);
  await database.query(`CREATE TABLE IF NOT EXISTS ${entities} (source_id text NOT NULL, platform text NOT NULL, kind text NOT NULL, entity_id text NOT NULL, request_key text NOT NULL, payload jsonb NOT NULL, synced_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(source_id,platform,kind,entity_id,request_key), FOREIGN KEY(source_id,platform,request_key) REFERENCES ${resources}(source_id,platform,request_key) ON DELETE CASCADE)`);
  await database.query(`CREATE INDEX IF NOT EXISTS resource_entity_lookup ON ${entities}(source_id,platform,kind,entity_id)`);
  await database.query(`CREATE INDEX IF NOT EXISTS resource_entity_book ON ${entities}(source_id,platform,kind,(payload->>'BookID'),entity_id);
    CREATE INDEX IF NOT EXISTS resource_entity_catalog ON ${entities}(source_id,platform,kind,(payload->>'CatalogID'),entity_id);
    CREATE INDEX IF NOT EXISTS resource_entity_computer_group ON ${entities}(source_id,platform,kind,(payload->>'majorId'),(payload->>'chapterId'),(payload->>'examGroupId'),entity_id);
    CREATE INDEX IF NOT EXISTS resource_entity_examination ON ${entities}(source_id,platform,kind,(payload->>'examinationId'),entity_id);
    CREATE INDEX IF NOT EXISTS resource_entity_practice ON ${entities}(source_id,platform,kind,(payload->>'BusType'),(payload->>'ExanType'),entity_id)`);
  await database.query(`CREATE TABLE IF NOT EXISTS ${settings} (id integer PRIMARY KEY CHECK(id=1), enabled boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now())`);
  await database.query(`INSERT INTO ${settings}(id) VALUES(1) ON CONFLICT DO NOTHING`);
  async function rememberSource(source) {
    if (!source.id || (source.scope!=='public'&&!source.accountRef) || !['math','computer'].includes(source.platform)) throw new ApiError('同步来源缺少账号或平台身份', 400);
    await database.query(`INSERT INTO ${sources}(id,platform,account_ref,metadata) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET last_seen_at=now()`, [source.id, source.platform, source.accountRef, JSON.stringify(source)]);
    return source;
  }
  async function getSettings() { return safeSettings((await database.query(`SELECT * FROM ${settings} WHERE id=1`)).rows[0]); }
  async function updateSettings(input) {
    if (!input || !Number.isSafeInteger(input.revision) || input.revision < 0 || typeof input.enabled !== 'boolean') throw new ApiError('同步开关及版本格式不正确', 400);
    if (Object.keys(input).some(key => !['enabled','revision'].includes(key))) throw new ApiError('学习过程同步仅支持启用开关和版本',400);
    const result = await database.query(`UPDATE ${settings} SET enabled=$1,revision=revision+1,updated_at=now() WHERE id=1 AND revision=$2 RETURNING *`, [input.enabled,input.revision]);
    if (!result.rows.length) throw new ApiError('同步设置已更新，请重新读取', 409);
    return safeSettings(result.rows[0]);
  }
  function entityItems(platform, task, response) {
    const body = response?.data ?? response?.Data ?? response;
    const rows = resourceRows(response).map(row => stripSharedPersonalState(row)).map((row,index) => { const detail = stripSharedPersonalState(body?.exerciseMap?.[row.exerciseId]); return {...row,...(detail || {}),_resourceOrder:task.context?._resourceOrder ?? index,...(detail?.questions ? {questionList:detail.questions} : {})}; }), path = task.request.path, command = task.request.data?.command || '';
    const kind = /SoleDes|Resolve|Analyse|Analysis/.test(path + command) ? 'analysis' : /question_files/.test(path) ? 'file' : /Question|question|searchExercise\/info|examExercise|exerciseList/.test(path + command) ? 'question' : /course|Course/.test(path + command) ? 'course' : /school|School/.test(path + command) ? 'school' : 'catalog';
    const context = task.context || {};
    const result = [];
    const visit = value => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      const hasQuestion = value.QuestionID || value.questionID || value.exerciseId;
      const ownKind = hasQuestion ? (/SoleDes|Resolve|Analyse|Analysis/.test(path + command) ? 'analysis' : 'question') : kind;
      const id = hasQuestion || value.ID || value.id;
      if (id !== undefined && id !== null && !(ownKind === 'question' && resourceScope(platform,task.request) === 'account' && task.kind !== 'computer.chapter_questions')) result.push({ kind: ownKind, id: String(id), payload: { ...context, ...value } });
      for (const field of ['children','childList','questionList','questions','exercises','exerciseList']) if (Array.isArray(value[field])) value[field].forEach(visit);
    };
    rows.forEach(visit);
    if (!rows.length) {
      const data = response?.data ?? response?.Data;
      const id = task.request.query?.ID || task.request.query?.QuestionID || task.request.path.split('/info/')[1];
      if (id && data && typeof data === 'object') result.push({ kind, id: String(id), payload: { ...context, ...data } });
    }
    return result;
  }
  async function derived(tx,source,task,clean,key) {
    await tx.query(`DELETE FROM ${entities} WHERE source_id=$1 AND platform=$2 AND request_key=$3`, [source.id,source.platform,key]);
    const values=[...new Map(entityItems(source.platform,task,clean).map(entity=>[`${entity.kind}:${entity.id}`,{kind:entity.kind,entity_id:entity.id,payload:entity.payload}])).values()];
    for(let index=0;index<values.length;index+=500)await tx.query(`INSERT INTO ${entities}(source_id,platform,kind,entity_id,request_key,payload) SELECT $1,$2,item.kind,item.entity_id,$3,item.payload FROM jsonb_to_recordset($4::jsonb) AS item(kind text,entity_id text,payload jsonb) ON CONFLICT(source_id,platform,kind,entity_id,request_key) DO UPDATE SET payload=excluded.payload,synced_at=now()`,[source.id,source.platform,key,JSON.stringify(values.slice(index,index+500))]);
    await tx.query(`DELETE FROM ${media} WHERE source_id=$1 AND platform=$2 AND request_key=$3`,[source.id,source.platform,key]);
    const urls=resourceMedia(clean);
    if(urls.length)await tx.query(`INSERT INTO ${media}(source_id,platform,request_key,url) SELECT $1,$2,$3,unnest($4::text[]) ON CONFLICT DO NOTHING`,[source.id,source.platform,key,urls]);
  }
  function titleFor(task,response) {
    const body=response?.data??response?.Data??response,first=resourceRows(response)[0]||{};
    return String(body?.Title||body?.Name||body?.QuestionTitle||first.Title||first.Name||first.BookName||first.QuestionTitle||first.exerciseStems||task.request.data?.command||task.request.path).slice(0,300);
  }
  async function save(source,task,response,options={}) {
    const scope=options.scope||task.scope||source.scope||resourceScope(source.platform,task.request);
    if(!['public','account','volatile'].includes(scope))throw new ApiError('资源范围格式不正确',400);
    await rememberSource(source);
    const clean=scope==='public'?publicResourceResponse(response):publicPlatformResponse(response),key=resourceKey(task.request),contentHash=hash(clean);
    const expiresAt=options.expiresAt===undefined?defaultExpiry(scope):expires(options.expiresAt);
    return database.transaction(async tx=>{
      const result=await tx.query(`INSERT INTO ${resources}(source_id,platform,request_key,scope,kind,request,response,content_hash,expires_at,title,context) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(source_id,platform,request_key) DO UPDATE SET scope=excluded.scope,kind=excluded.kind,request=excluded.request,response=excluded.response,content_hash=excluded.content_hash,synced_at=now(),expires_at=excluded.expires_at,title=excluded.title,context=excluded.context,revision=${resources}.revision+CASE WHEN ${resources}.content_hash<>excluded.content_hash THEN 1 ELSE 0 END,changed_at=CASE WHEN ${resources}.content_hash<>excluded.content_hash THEN now() ELSE ${resources}.changed_at END RETURNING *`,[source.id,source.platform,key,scope,task.kind||task.request.path,JSON.stringify(task.request),JSON.stringify(clean),contentHash,expiresAt,titleFor(task,clean),JSON.stringify(task.context||{})]);
      await derived(tx,source,task,clean,key);
      return {...summary(result.rows[0]),contentHash};
    });
  }
  async function lookup(sourceId,platform,request) {
    const row=(await database.query(`SELECT * FROM ${resources} WHERE source_id=$1 AND platform=$2 AND request_key=$3`,[sourceId,platform,resourceKey(request)])).rows[0];
    return row?{...summary(row),response:row.response}:null;
  }
  const identity = input=>{
    if(!input||typeof input.sourceId!=='string'||!input.sourceId||input.sourceId.length>160||!['math','computer'].includes(input.platform)||typeof input.key!=='string'||!/^[a-f0-9]{64}$/.test(input.key))throw new ApiError('资源标识格式不正确',400);
    return [input.sourceId,input.platform,input.key];
  };
  const checkRevision=(input,row)=>{if(!Number.isSafeInteger(input.revision)||input.revision<1)throw new ApiError('资源版本格式不正确',400);if(input.revision!==row.revision)throw new ApiError('资源已更新，请重新读取后再操作',409);};
  async function rowFor(input,lock=false){const row=(await database.query(`SELECT * FROM ${resources} WHERE source_id=$1 AND platform=$2 AND request_key=$3${lock?' FOR UPDATE':''}`,identity(input))).rows[0];if(!row)throw new ApiError('未找到资源',404);return row;}
  async function detail(input){const row=await rowFor(input);return {...summary(row),request:row.request,response:row.response};}
  async function update(input){
    if(!input?.response||typeof input.response!=='object')throw new ApiError('资源内容需要JSON对象或数组',400);
    return database.transaction(async tx=>{
      const row=await rowFor(input,true);checkRevision(input,row);
      const clean=row.scope==='public'?publicResourceResponse(input.response):publicPlatformResponse(input.response),task={request:row.request,context:row.context,kind:row.kind};
      await tx.query(`UPDATE ${resources} SET response=$4,content_hash=$5,title=$6,revision=revision+1,synced_at=now(),changed_at=now(),expires_at=$7 WHERE source_id=$1 AND platform=$2 AND request_key=$3`,[...identity(input),JSON.stringify(clean),hash(clean),titleFor(task,clean),defaultExpiry(row.scope)]);
      await derived(tx,{id:row.source_id,platform:row.platform},task,clean,row.request_key);
      return detail(input);
    });
  }
  async function invalidate(input){return database.transaction(async tx=>{const row=await rowFor(input,true);checkRevision(input,row);await tx.query(`UPDATE ${resources} SET expires_at=now()-interval '1 second',revision=revision+1 WHERE source_id=$1 AND platform=$2 AND request_key=$3`,identity(input));return detail(input);});}
  async function remove(input){return database.transaction(async tx=>{const row=await rowFor(input,true);checkRevision(input,row);await tx.query(`DELETE FROM ${resources} WHERE source_id=$1 AND platform=$2 AND request_key=$3`,identity(input));return {ok:true};});}
  async function findEntities({ sourceId, platform, kind = 'question', id, ids, filters = {}, limit = 100, offset = 0, includeExpired = false } = {}) {
    if (!sourceId || !['math','computer'].includes(platform)) throw new ApiError('资源查询需要明确来源及平台', 400);
    if (!Number.isInteger(offset) || offset < 0) throw new ApiError('资源查询偏移格式不正确', 400);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new ApiError('资源查询每页需为1–1000条', 400);
    const parameters = [sourceId, platform, kind], clauses = ['source_id=$1','platform=$2','kind=$3'];
    if(typeof includeExpired!=='boolean')throw new ApiError('资源期限筛选格式不正确',400);
    if(!includeExpired)clauses.push(`EXISTS(SELECT 1 FROM ${resources} fresh WHERE fresh.source_id=${entities}.source_id AND fresh.platform=${entities}.platform AND fresh.request_key=${entities}.request_key AND fresh.expires_at>now())`);
    if (id !== undefined || ids !== undefined) { const selected = ids || [id]; if (!Array.isArray(selected) || selected.length > 1000) throw new ApiError('资源编号格式不正确', 400); parameters.push(selected.map(String)); clauses.push(`entity_id=ANY($${parameters.length}::text[])`); }
    const filterFields = new Set(['BookID','CatalogID','BusType','ExanType','majorId','chapterId','examGroupId','examinationId','examId','examType','examCategory','sectionId','ProductID','CourseID','AlbumID','PaperID']);
    if (!filters || typeof filters !== 'object' || Array.isArray(filters)) throw new ApiError('资源筛选格式不正确',400);
    for (const [field,value] of Object.entries(filters)) {
      if (!filterFields.has(field) || !['string','number','boolean'].includes(typeof value)) throw new ApiError('资源筛选字段不正确',400);
      parameters.push(String(value)); clauses.push(`payload->>'${field}'=$${parameters.length}`);
    }
    parameters.push(limit,offset);
    return (await database.query(`SELECT source_id,kind,entity_id,payload,synced_at FROM (SELECT DISTINCT ON(entity_id) source_id,kind,entity_id,payload,synced_at FROM ${entities} WHERE ${clauses.join(' AND ')} ORDER BY entity_id,synced_at DESC) selected ORDER BY synced_at DESC,entity_id LIMIT $${parameters.length-1} OFFSET $${parameters.length}`, parameters)).rows.map(row => ({ sourceId: row.source_id, kind: row.kind, id: row.entity_id, payload: row.payload, syncedAt: iso(row.synced_at) }));
  }
  async function status() {
    const [state, resourceCounts, sourceRows, mediaCount] = await Promise.all([
      getSettings(), database.query(`SELECT platform,count(*)::integer AS count,max(synced_at) AS last_synced_at FROM ${resources} GROUP BY platform`),
      database.query(`SELECT * FROM ${sources} ORDER BY last_seen_at DESC`), database.query(`SELECT count(*)::integer AS count FROM ${media}`),
    ]);
    const timestamps=resourceCounts.rows.map(row=>iso(row.last_synced_at)).filter(Boolean).sort();
    return {settings:state,resources:{total:resourceCounts.rows.reduce((sum,row)=>sum+row.count,0),byPlatform:Object.fromEntries(resourceCounts.rows.map(row=>[row.platform,row.count])),mediaReferences:mediaCount.rows[0].count,lastSyncedAt:timestamps.at(-1)||null},sources:sourceRows.rows.map(safeSource)};
  }
  async function list({platform,sourceId,scope,kind,q='',page=1,pageSize=20}={}) {
    if(typeof page==='string'&&/^[1-9]\d*$/.test(page))page=Number(page);
    if(typeof pageSize==='string'&&/^[1-9]\d*$/.test(pageSize))pageSize=Number(pageSize);
    if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100)throw new ApiError('资源分页格式不正确',400);
    if(platform&&!['math','computer'].includes(platform)||scope&&!['public','account','volatile'].includes(scope)||typeof q!=='string'||q.length>160||kind&&typeof kind!=='string')throw new ApiError('资源筛选格式不正确',400);
    const args=[],clauses=[];
    for(const [field,value]of[['platform',platform],['source_id',sourceId],['scope',scope],['kind',kind]])if(value){args.push(String(value));clauses.push(`${field}=$${args.length}`);}
    if(q.trim()){args.push(q.trim());clauses.push(`strpos(lower(title||' '||kind||' '||(request->>'path')||' '||coalesce(request->'data'->>'command','')),lower($${args.length}))>0`);}
    const where=clauses.length?` WHERE ${clauses.join(' AND ')}`:'';
    const total=(await database.query(`SELECT count(*)::integer AS total FROM ${resources}${where}`,args)).rows[0].total,totalPages=Math.max(1,Math.ceil(total/pageSize));page=Math.min(page,totalPages);
    const result=await database.query(`SELECT * FROM ${resources}${where} ORDER BY synced_at DESC,source_id,request_key LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,pageSize,(page-1)*pageSize]);
    return {resources:result.rows.map(summary),pagination:{page,pageSize,total,totalPages}};
  }
  return { getSettings, updateSettings, rememberSource, save, lookup, findEntities, status, list,detail,update,invalidate,remove };
}

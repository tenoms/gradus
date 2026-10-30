import { mergeExerciseDetail } from './exercise-content.mjs';
import { createHash } from 'node:crypto';
import { ApiError } from '../../infrastructure/api-error.mjs';
import { stripSharedPersonalState } from '../../integrations/shared-account-policy.mjs';
import { publicPlatformResponse } from '../../integrations/platform-policy.mjs';
import { resourceKey, resourceRows, resourceMedia, resourceScope, publicResourceResponse } from './catalog.mjs';
import { resourcePresentation, resourcePresentationSql, resourceTypeLabels, resourceTypeLabel } from './presentation.mjs';
import { presentResourceSources } from './source-presentation.mjs';
import { readRuntimeConfig } from '../../infrastructure/runtime-config.mjs';
import { createResourceContentStore } from './content-store.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = value => value instanceof Date ? value.toISOString() : value;
const safeSource = row => ({ id: row.id, platform: row.platform, accountRef: row.account_ref, scope:row.metadata?.scope||'account', createdAt: iso(row.created_at), lastSeenAt: iso(row.last_seen_at) });
const summary = row => ({sourceId:row.source_id,platform:row.platform,key:row.request_key,scope:row.scope,kind:row.kind,path:row.request?.path||'',command:row.request?.data?.command||'',...resourcePresentation(row),revision:row.revision,syncedAt:iso(row.synced_at),changedAt:iso(row.changed_at),expiresAt:iso(row.expires_at)||null,expired:row.scope!=='public'||!row.expires_at||new Date(row.expires_at).getTime()<=Date.now(),mediaCount:Number(row.media_count||0),entityCount:Number(row.entity_count||0)});
const expires = value => {if(value===null)return null;const date=new Date(value);if(Number.isNaN(date.getTime()))throw new ApiError('资源更新期限格式不正确',400);return date.toISOString();};
const safeSettings = row => ({ enabled: row.enabled, refreshAfterDays: row.refresh_after_days, revision: row.revision, updatedAt: iso(row.updated_at) });
const validRefreshDays = value => Number.isSafeInteger(value) && value>=1 && value<=3650;
export async function createResourceStore(database, { publicRefreshAfterDays } = readRuntimeConfig().resources) {
  if(!validRefreshDays(publicRefreshAfterDays))throw new ApiError('资源复核周期需为1–3650天的整数',400);
  const defaultExpiry = async scope => scope==='public'?new Date(Date.now()+(await getSettings()).refreshAfterDays*86_400_000).toISOString():null;
  const resources = database.upstream('resources'), sources = database.upstream('resource_sources');
  const media = database.upstream('resource_media'), entities = database.upstream('resource_entities'), settings = database.web('resource_sync_settings');
  const parameter=(...fields)=>`coalesce(${fields.flatMap(field=>[`nullif(r.context->>'${field}','')`,`nullif(r.request->'query'->>'${field}','')`,`nullif(r.request->'data'->>'${field}','')`]).join(',')})`;
  const questionId=parameter('QuestionID','questionID','ID'),lessonId=parameter('lessonId','LessonID'),mediaId=parameter('mediaId');
  const related=`LEFT JOIN LATERAL (SELECT e.payload FROM ${entities} e WHERE e.source_id=r.source_id AND e.platform=r.platform AND ((r.kind IN ('math.analysis','math.files') AND e.kind='question' AND e.entity_id=${questionId}) OR (r.kind='computer.media' AND (e.entity_id=${lessonId} OR e.payload->>'mediaId'=${mediaId}))) ORDER BY e.synced_at DESC,e.request_key LIMIT 1) rp_related ON true`;
  const presentation=resourcePresentationSql('r','rp_related.payload');
  const displayed=`(SELECT r.*,${presentation.fields} FROM ${resources} r ${related} ${presentation.joins})`;
  const sourceDirectory=()=>database.query(`SELECT s.*,count(*)::integer AS count FROM ${sources} s JOIN ${resources} r ON r.source_id=s.id GROUP BY s.id ORDER BY s.platform,s.id`);
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
  await database.query(`CREATE TABLE IF NOT EXISTS ${settings} (id integer PRIMARY KEY CHECK(id=1), enabled boolean NOT NULL DEFAULT false, refresh_after_days integer NOT NULL DEFAULT ${publicRefreshAfterDays} CHECK(refresh_after_days BETWEEN 1 AND 3650), revision integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now())`);
  await database.query(`ALTER TABLE ${settings} ADD COLUMN IF NOT EXISTS refresh_after_days integer NOT NULL DEFAULT ${publicRefreshAfterDays} CHECK(refresh_after_days BETWEEN 1 AND 3650)`);
  await database.query(`INSERT INTO ${settings}(id,refresh_after_days) VALUES(1,$1) ON CONFLICT DO NOTHING`,[publicRefreshAfterDays]);
  const content = await createResourceContentStore(database);
  async function rememberSource(source) {
    if (!source.id || (source.scope!=='public'&&!source.accountRef) || !['math','computer'].includes(source.platform)) throw new ApiError('同步来源缺少账号或平台身份', 400);
    await database.query(`INSERT INTO ${sources}(id,platform,account_ref,metadata) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET last_seen_at=now()`, [source.id, source.platform, source.accountRef, JSON.stringify(source)]);
    return source;
  }
  async function getSettings() { return safeSettings((await database.query(`SELECT * FROM ${settings} WHERE id=1`)).rows[0]); }
  async function updateSettings(input) {
    if (!input || !Number.isSafeInteger(input.revision) || input.revision < 0 || typeof input.enabled !== 'boolean') throw new ApiError('同步开关及版本格式不正确', 400);
    if (Object.keys(input).some(key => !['enabled','refreshAfterDays','revision'].includes(key))) throw new ApiError('资源同步仅支持启用开关、复核周期和版本',400);
    if (input.refreshAfterDays!==undefined && !validRefreshDays(input.refreshAfterDays)) throw new ApiError('资源复核周期需为1–3650天的整数',400);
    return database.transaction(async tx=>{
      const previous=(await tx.query(`SELECT refresh_after_days FROM ${settings} WHERE id=1 FOR UPDATE`)).rows[0];
      const result=await tx.query(`UPDATE ${settings} SET enabled=$1,refresh_after_days=coalesce($3,refresh_after_days),revision=revision+1,updated_at=now() WHERE id=1 AND revision=$2 RETURNING *`,[input.enabled,input.revision,input.refreshAfterDays??null]);
      if(!result.rows.length)throw new ApiError('同步设置已更新，请重新读取',409);
      if(input.refreshAfterDays!==undefined && input.refreshAfterDays!==previous.refresh_after_days)
        await tx.query(`UPDATE ${resources} SET expires_at=synced_at+($1*interval '1 day') WHERE scope='public' AND expires_at>synced_at`,[input.refreshAfterDays]);
      return safeSettings(result.rows[0]);
    });
  }
  function entityItems(platform, task, response) {
    const body = response?.data ?? response?.Data ?? response;
    const rows = resourceRows(response).map(row => stripSharedPersonalState(row)).map((row,index) => ({...mergeExerciseDetail(row,stripSharedPersonalState(body?.exerciseMap?.[row.exerciseId])),_resourceOrder:task.context?._resourceOrder ?? index})), path = task.request.path, command = task.request.data?.command || '';
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
    await content.observe({source,task,response:clean,key},tx);
  }
  function titleFor(task,response) { return resourcePresentation({kind:task.kind,platform:task.kind?.split('.')[0],request:task.request,context:task.context,response}).title; }
  async function save(source,task,response,options={}) {
    const scope=options.scope||task.scope||source.scope||resourceScope(source.platform,task.request);
    if(!['public','account','volatile'].includes(scope))throw new ApiError('资源范围格式不正确',400);
    await rememberSource(source);
    const clean=scope==='public'?publicResourceResponse(response):publicPlatformResponse(response),key=resourceKey(task.request),contentHash=hash(clean);
    const expiresAt=options.expiresAt===undefined?await defaultExpiry(scope):expires(options.expiresAt);
    return database.transaction(async tx=>{
      const result=await tx.query(`INSERT INTO ${resources}(source_id,platform,request_key,scope,kind,request,response,content_hash,expires_at,title,context) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(source_id,platform,request_key) DO UPDATE SET scope=excluded.scope,kind=excluded.kind,request=excluded.request,response=excluded.response,content_hash=excluded.content_hash,synced_at=now(),expires_at=excluded.expires_at,title=excluded.title,context=excluded.context,revision=${resources}.revision+CASE WHEN ${resources}.content_hash<>excluded.content_hash THEN 1 ELSE 0 END,changed_at=CASE WHEN ${resources}.content_hash<>excluded.content_hash THEN now() ELSE ${resources}.changed_at END RETURNING *`,[source.id,source.platform,key,scope,task.kind||task.request.path,JSON.stringify(task.request),JSON.stringify(clean),contentHash,expiresAt,titleFor(task,clean),JSON.stringify(task.context||{})]);
      await derived(tx,{...source,scope},task,clean,key);
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
  async function detail(input){
    const selected=identity(input),row=(await database.query(`SELECT r.* FROM ${displayed} r WHERE source_id=$1 AND platform=$2 AND request_key=$3`,selected)).rows[0];
    if(!row)throw new ApiError('未找到资源',404);
    const source=presentResourceSources((await sourceDirectory()).rows).find(item=>item.id===row.source_id);
    const mediaRows=await database.query(`SELECT url,observed_at FROM ${media} WHERE source_id=$1 AND platform=$2 AND request_key=$3 ORDER BY url`,selected);
    const entityCounts=await database.query(`SELECT kind,count(*)::integer AS count FROM ${entities} WHERE source_id=$1 AND platform=$2 AND request_key=$3 GROUP BY kind ORDER BY kind`,selected);
    return {...summary(row),request:row.request,response:row.response,context:row.context,source,media:mediaRows.rows.map(item=>({url:item.url,observedAt:iso(item.observed_at)})),entities:entityCounts.rows,mediaCount:mediaRows.rowCount,entityCount:entityCounts.rows.reduce((total,item)=>total+item.count,0)};
  }
  async function update(input){
    if(!input?.response||typeof input.response!=='object')throw new ApiError('资源内容需要JSON对象或数组',400);
    return database.transaction(async tx=>{
      const row=await rowFor(input,true);checkRevision(input,row);
      const clean=row.scope==='public'?publicResourceResponse(input.response):publicPlatformResponse(input.response),task={request:row.request,context:row.context,kind:row.kind,scope:row.scope};
      await tx.query(`UPDATE ${resources} SET response=$4,content_hash=$5,title=$6,revision=revision+1,synced_at=now(),changed_at=now(),expires_at=$7 WHERE source_id=$1 AND platform=$2 AND request_key=$3`,[...identity(input),JSON.stringify(clean),hash(clean),titleFor(task,clean),await defaultExpiry(row.scope)]);
      await derived(tx,{id:row.source_id,platform:row.platform,scope:row.scope},task,clean,row.request_key);
      return detail(input);
    });
  }
  async function invalidate(input){return database.transaction(async tx=>{const row=await rowFor(input,true);checkRevision(input,row);await tx.query(`UPDATE ${resources} SET expires_at=LEAST(synced_at,now()-interval '1 second'),revision=revision+1 WHERE source_id=$1 AND platform=$2 AND request_key=$3`,identity(input));return detail(input);});}
  async function remove(input){return database.transaction(async tx=>{const row=await rowFor(input,true);checkRevision(input,row);await tx.query(`DELETE FROM ${resources} WHERE source_id=$1 AND platform=$2 AND request_key=$3`,identity(input));return {ok:true};});}
  async function batch(input){
    if(!input||!['invalidate','delete'].includes(input.action)||!Array.isArray(input.resources)||input.resources.length<1||input.resources.length>100)throw new ApiError('批量操作需选择1–100份资源并指定有效操作',400);
    const seen=new Set();
    for(const item of input.resources){
      const selected=identity(item).join(':');
      if(!Number.isSafeInteger(item.revision)||item.revision<1)throw new ApiError('资源版本格式不正确',400);
      if(seen.has(selected))throw new ApiError('批量操作不能重复选择同一资源',400);
      seen.add(selected);
    }
    return database.transaction(async tx=>{
      for(const item of input.resources){
        const row=await rowFor(item,true);checkRevision(item,row);
        await tx.query(input.action==='delete'
          ?`DELETE FROM ${resources} WHERE source_id=$1 AND platform=$2 AND request_key=$3`
          :`UPDATE ${resources} SET expires_at=LEAST(synced_at,now()-interval '1 second'),revision=revision+1 WHERE source_id=$1 AND platform=$2 AND request_key=$3`,identity(item));
      }
      return {ok:true,count:input.resources.length,action:input.action};
    });
  }
  async function findEntities({ sourceId, platform, kind = 'question', id, ids, filters = {}, limit = 100, offset = 0, includeExpired = false } = {}) {
    if (!sourceId || !['math','computer'].includes(platform)) throw new ApiError('资源查询需要明确来源及平台', 400);
    if (!Number.isInteger(offset) || offset < 0) throw new ApiError('资源查询偏移格式不正确', 400);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new ApiError('资源查询每页需为1–1000条', 400);
    const parameters = [sourceId, platform, kind], clauses = ['source_id=$1','platform=$2','kind=$3'];
    if(typeof includeExpired!=='boolean')throw new ApiError('资源期限筛选格式不正确',400);
    // Public content remains usable after its suggested review date. The legacy
    // opt-in also allows inspection of the explicitly selected account's entities.
    if(!includeExpired)clauses.push(`EXISTS(SELECT 1 FROM ${resources} saved WHERE saved.source_id=${entities}.source_id AND saved.platform=${entities}.platform AND saved.request_key=${entities}.request_key AND saved.scope='public')`);
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
  async function list({platform,sourceId,scope,kind,q='',validity='',sort='synced-desc',page=1,pageSize=20}={}) {
    if(typeof page==='string'&&/^[1-9]\d*$/.test(page))page=Number(page);
    if(typeof pageSize==='string'&&/^[1-9]\d*$/.test(pageSize))pageSize=Number(pageSize);
    if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100)throw new ApiError('资源分页格式不正确',400);
    if(platform!==undefined&&(typeof platform!=='string'||platform&&!['math','computer'].includes(platform))||scope!==undefined&&(typeof scope!=='string'||scope&&!['public','account','volatile'].includes(scope))||typeof q!=='string'||q.length>160||kind!==undefined&&(typeof kind!=='string'||kind.length>160)||sourceId!==undefined&&(typeof sourceId!=='string'||sourceId.length>160)||!['','fresh','expired'].includes(validity))throw new ApiError('资源筛选格式不正确',400);
    const orders={'synced-desc':'r.synced_at DESC','synced-asc':'r.synced_at ASC','changed-desc':'r.changed_at DESC','title-asc':'lower(r.display_title) ASC','expires-asc':'r.expires_at ASC NULLS FIRST'};
    if(typeof sort!=='string'||!Object.hasOwn(orders,sort))throw new ApiError('资源排序格式不正确',400);
    const args=[],clauses=[];
    for(const [field,value]of[['platform',platform],['source_id',sourceId],['scope',scope],['kind',kind]])if(value){args.push(value);clauses.push(`r.${field}=$${args.length}`);}
    if(q.trim()){args.push(q.trim());clauses.push(`strpos(lower(r.display_title||' '||r.display_subtitle||' '||r.type_label||' '||r.kind||' '||coalesce(r.request->>'path','')||' '||coalesce(r.request->'data'->>'command','')||' '||r.source_id||' '||r.request_key),lower($${args.length}))>0`);}
    if(validity==='fresh')clauses.push("(r.scope='public' AND r.expires_at>now())");
    if(validity==='expired')clauses.push("(r.scope<>'public' OR r.expires_at IS NULL OR r.expires_at<=now())");
    const where=clauses.length?` WHERE ${clauses.join(' AND ')}`:'';
    const [counts,mediaCount,kinds,sourceCounts]=await Promise.all([
      database.query(`SELECT count(*)::integer AS total,count(*) FILTER(WHERE r.scope='public' AND r.expires_at>now())::integer AS fresh,count(*) FILTER(WHERE r.scope<>'public' OR r.expires_at IS NULL OR r.expires_at<=now())::integer AS expired FROM ${displayed} r${where}`,args),
      database.query(`SELECT count(*)::integer AS count FROM ${media} m JOIN ${displayed} r USING(source_id,platform,request_key)${where}`,args),
      database.query(`SELECT kind AS value,count(*)::integer AS count FROM ${resources} GROUP BY kind ORDER BY kind`),
      sourceDirectory(),
    ]);
    const count=counts.rows[0],total=count.total,totalPages=Math.max(1,Math.ceil(total/pageSize));page=Math.min(page,totalPages);
    const result=await database.query(`SELECT r.*,(SELECT count(*)::integer FROM ${media} m WHERE m.source_id=r.source_id AND m.platform=r.platform AND m.request_key=r.request_key) AS media_count,(SELECT count(*)::integer FROM ${entities} e WHERE e.source_id=r.source_id AND e.platform=r.platform AND e.request_key=r.request_key) AS entity_count FROM ${displayed} r${where} ORDER BY ${orders[sort]},r.platform,r.source_id,r.request_key LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,pageSize,(page-1)*pageSize]);
    return {resources:result.rows.map(summary),pagination:{page,pageSize,total,totalPages},summary:{...count,mediaReferences:mediaCount.rows[0].count},facets:{kinds:kinds.rows.map(row=>({...row,label:row.value.startsWith('computer.')||row.value.startsWith('math.')?`${row.value.startsWith('computer.')?'计算机 408':'考研数学'} · ${resourceTypeLabels[row.value]||resourceTypeLabel({kind:row.value,platform:row.value.split('.')[0],request:{path:''}})}`:'其他学习资料'})),sources:presentResourceSources(sourceCounts.rows)}};
  }
  async function resolveContent(args) { return await content.resolve(args) || await content.questions({...args,includeIncomplete:true}); }
  return { getSettings, updateSettings, rememberSource, save, lookup, resolveContent, localPractice:args=>content.questions(args), findEntities, status, list,detail,update,invalidate,remove,batch };
}

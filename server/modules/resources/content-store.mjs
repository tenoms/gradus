import { contentRequest, groupRequest, observeContent, rebuildContent, rebuildGroup } from './content.mjs';

const iso=value=>value instanceof Date?value.toISOString():value;
const expired=value=>!value||new Date(value).getTime()<=Date.now();
const metadata=(rows,kind)=>({kind,expiresAt:rows.some(row=>!row.expires_at)?null:iso(rows.reduce((old,row)=>new Date(row.expires_at)<new Date(old.expires_at)?row:old).expires_at),expired:rows.some(row=>expired(row.expires_at)),syncedAt:iso(rows.reduce((old,row)=>new Date(row.synced_at)<new Date(old.synced_at)?row:old).synced_at)});

/** A public content index retains its original response as provenance and lifecycle owner. */
export async function createResourceContentStore(database) {
  const content=database.upstream('resource_content'),groups=database.upstream('resource_question_groups'),resources=database.upstream('resources');
  await database.query(`CREATE TABLE IF NOT EXISTS ${content} (source_id text NOT NULL, platform text NOT NULL, request_key text NOT NULL, entity_id text NOT NULL, variant text NOT NULL, payload jsonb NOT NULL, PRIMARY KEY(source_id,platform,request_key,entity_id,variant), FOREIGN KEY(source_id,platform,request_key) REFERENCES ${resources}(source_id,platform,request_key) ON DELETE CASCADE)`);
  await database.query(`CREATE INDEX IF NOT EXISTS resource_content_question ON ${content}(source_id,platform,entity_id,variant)`);
  await database.query(`CREATE TABLE IF NOT EXISTS ${groups} (source_id text NOT NULL, platform text NOT NULL, request_key text NOT NULL, group_key text NOT NULL, payload jsonb NOT NULL, PRIMARY KEY(source_id,platform,request_key,group_key), FOREIGN KEY(source_id,platform,request_key) REFERENCES ${resources}(source_id,platform,request_key) ON DELETE CASCADE)`);
  await database.query(`CREATE INDEX IF NOT EXISTS resource_question_group_lookup ON ${groups}(source_id,platform,group_key)`);
  async function remove({sourceId,platform,key},tx=database) {
    await tx.query(`DELETE FROM ${content} WHERE source_id=$1 AND platform=$2 AND request_key=$3`,[sourceId,platform,key]);
    await tx.query(`DELETE FROM ${groups} WHERE source_id=$1 AND platform=$2 AND request_key=$3`,[sourceId,platform,key]);
  }
  async function observe({source,task,response,key},tx) {
    if(!tx)return database.transaction(current=>observe({source,task,response,key},current));
    await remove({sourceId:source.id,platform:source.platform,key},tx);
    if((task.scope||source.scope)!=='public')return;
    const found=observeContent(source.platform,task,response);
    if(found.entities.length)await tx.query(`INSERT INTO ${content}(source_id,platform,request_key,entity_id,variant,payload) SELECT $1,$2,$3,item.id,item.variant,item.payload FROM jsonb_to_recordset($4::jsonb) AS item(id text,variant text,payload jsonb)`,[source.id,source.platform,key,JSON.stringify(found.entities)]);
    if(found.groups.length)await tx.query(`INSERT INTO ${groups}(source_id,platform,request_key,group_key,payload) SELECT $1,$2,$3,item.key,item.payload FROM jsonb_to_recordset($4::jsonb) AS item(key text,payload jsonb)`,[source.id,source.platform,key,JSON.stringify(found.groups.map(group=>({key:group.key,payload:group})))]);
  }
  async function resolve({sourceId,platform,request}) {
    const descriptor=contentRequest(platform,request);
    if(!descriptor)return null;
    const row=(await database.query(`SELECT c.payload,r.request_key,r.revision,r.synced_at,r.expires_at FROM ${content} c JOIN ${resources} r USING(source_id,platform,request_key) WHERE c.source_id=$1 AND c.platform=$2 AND c.entity_id=$3 AND c.variant=$4 AND r.scope='public' ORDER BY r.synced_at DESC,r.changed_at DESC,r.request_key LIMIT 1`,[sourceId,platform,descriptor.id,descriptor.variant])).rows[0];
    return row?{...metadata([row],descriptor.kind),key:row.request_key,revision:row.revision,response:rebuildContent(platform,descriptor,row.payload)}:null;
  }
  async function questions({sourceId,platform,request,number,includeIncomplete=false}) {
    const descriptor=groupRequest(platform,request);
    if(!descriptor)return null;
    const group=(await database.query(`SELECT g.payload,r.synced_at,r.expires_at,r.request_key,r.revision FROM ${groups} g JOIN ${resources} r USING(source_id,platform,request_key) WHERE g.source_id=$1 AND g.platform=$2 AND g.group_key=$3 AND r.scope='public' ORDER BY r.synced_at DESC,r.changed_at DESC,r.request_key LIMIT 1`,[sourceId,platform,descriptor.key])).rows[0];
    if(!group)return null;
    const ids=group.payload.ids,contentVariant=platform==='math'?'math.question':'computer.question';
    const missing=()=>includeIncomplete?{...metadata([group],descriptor.kind),key:group.request_key,revision:group.revision,missing:true,complete:false,total:ids.length,questionIds:ids,examId:group.payload.examId}:null;
    const rows=(await database.query(`SELECT DISTINCT ON(c.entity_id) c.entity_id,c.payload,r.synced_at,r.expires_at FROM ${content} c JOIN ${resources} r USING(source_id,platform,request_key) WHERE c.source_id=$1 AND c.platform=$2 AND c.entity_id=ANY($3::text[]) AND c.variant=$4 AND r.scope='public' ORDER BY c.entity_id,r.synced_at DESC,r.changed_at DESC,r.request_key`,[sourceId,platform,ids,contentVariant])).rows;
    const byId=new Map(rows.map(row=>[row.entity_id,row])),complete=ids.every(id=>byId.has(id));
    const selectedNumber=number??Number({...request.query,...request.data}.number||0);
    if(!Number.isSafeInteger(selectedNumber)||selectedNumber<0)return null;
    if(selectedNumber>ids.length)return missing();
    const selectedIds=selectedNumber>0?[ids[selectedNumber-1]]:ids;
    if(!selectedIds.every(id=>byId.has(id)))return missing();
    const needed=selectedIds.map(id=>byId.get(id)),questions=needed.map((row,index)=>{
      const question=structuredClone(row.payload.question),order=selectedNumber>0?selectedNumber-1:index;
      return platform==='math'?{QuestionID:String(question.ID)===row.entity_id?question.ID:row.entity_id,_question_list:question,_resourceOrder:order}:{...question,_resourceOrder:order};
    });
    return {...metadata([group,...needed],descriptor.kind),key:group.request_key,revision:group.revision,response:rebuildGroup(platform,group.payload,questions),questions,total:ids.length,questionIds:ids,examId:group.payload.examId,complete};
  }
  // Build missing semantic indexes from already saved public responses locally.
  // Origins with a content or group index are skipped on subsequent starts.
  const unindexed=await database.query(`SELECT r.source_id,r.platform,r.request_key,r.kind,r.request,r.response,r.context FROM ${resources} r WHERE r.scope='public' AND NOT EXISTS(SELECT 1 FROM ${content} c WHERE c.source_id=r.source_id AND c.platform=r.platform AND c.request_key=r.request_key) AND NOT EXISTS(SELECT 1 FROM ${groups} g WHERE g.source_id=r.source_id AND g.platform=r.platform AND g.request_key=r.request_key)`);
  for(const row of unindexed.rows)await observe({source:{id:row.source_id,platform:row.platform,scope:'public'},task:{kind:row.kind,scope:'public',request:row.request,context:row.context},response:row.response,key:row.request_key});
  return {observe,remove,resolve,questions};
}

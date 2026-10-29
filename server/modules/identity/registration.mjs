import { ApiError } from '../../infrastructure/api-error.mjs';

/** Registration is a Web policy; it does not assign or contact a YYB source. */
export async function createRegistrationStore({database,identities}) {
  const table=database.web('registration_settings');
  await database.query(`CREATE TABLE IF NOT EXISTS ${table} (id integer PRIMARY KEY CHECK(id=1),enabled boolean NOT NULL DEFAULT false,revision integer NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT now()); INSERT INTO ${table}(id) VALUES(1) ON CONFLICT DO NOTHING`);
  const value=row=>({enabled:row.enabled,revision:row.revision,updatedAt:new Date(row.updated_at).toISOString()});
  async function settings(){return value((await database.query(`SELECT * FROM ${table} WHERE id=1`)).rows[0]);}
  async function publicSettings(){return {registrationEnabled:!(await identities.setupRequired())&&(await settings()).enabled};}
  async function update(input,actor){
    if(typeof input?.enabled!=='boolean'||!Number.isInteger(input.revision)||input.revision<0)throw new ApiError('注册开关或版本格式不正确',400);
    if(await identities.setupRequired())throw new ApiError('请先完成管理员初始化',409);
    const result=await database.transaction(async()=>{
      const row=(await database.query(`UPDATE ${table} SET enabled=$1,revision=revision+1,updated_at=now() WHERE id=1 AND revision=$2 RETURNING *`,[input.enabled,input.revision])).rows[0];
      if(!row)throw new ApiError('注册设置已更新，请刷新后重试',409);
      await identities.audit(actor,'registration.updated','学习空间注册',input.enabled?'开放用户注册':'关闭用户注册');
      return value(row);
    });
    return result;
  }
  async function register(input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw new ApiError('注册信息格式不正确',400);
    return database.transaction(async()=>{
      const state=(await database.query(`SELECT enabled FROM ${table} WHERE id=1 FOR UPDATE`)).rows[0];
      if(await identities.setupRequired())throw new ApiError('系统尚未初始化，请联系管理员',409);
      if(!state.enabled)throw new ApiError('当前未开放用户注册，请联系管理员',403);
      const user=await identities.registerUser(input);
      await identities.audit(user,'auth.registered',user,'学习空间开放注册');
      return user;
    });
  }
  return {settings,publicSettings,update,register};
}

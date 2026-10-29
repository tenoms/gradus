import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { readRuntimeConfig } from '../../server/infrastructure/runtime-config.mjs';
import { initialPlatformConfig, readEnvironmentPlatformConfig } from '../../server/integrations/platform-config.mjs';

const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

/** Use the same environment precedence as the application, without writing source tables. */
export async function readLivePlatformConfig({ database = readRuntimeConfig().database, env = process.env } = {}) {
  const { url, schemaPrefix, connectionTimeoutMs } = database;
  if (typeof schemaPrefix !== 'string' || !/^[a-z][a-z0-9_]{0,53}$/.test(schemaPrefix)) throw new Error('真实联调的数据库 schema 前缀格式不正确');
  const pool = new pg.Pool({ ...(url ? { connectionString: url } : {}), max: 1, connectionTimeoutMillis: connectionTimeoutMs });
  const optionalRows = async sql => {
    try { return (await pool.query(sql)).rows; }
    catch (error) { if (['42P01', '3F000'].includes(error.code)) return []; throw error; }
  };
  try {
    const rows = await optionalRows(`SELECT config FROM "${schemaPrefix}_web"."platform_configuration" WHERE id=1`);
    const config = rows[0]?.config || initialPlatformConfig();
    const environment = readEnvironmentPlatformConfig(env);
    for (const path of environment.environmentFields) {
      const [section, field] = path.split('.');
      config[section][field] = environment.config[section][field];
    }
    const services = (await optionalRows(`SELECT id,base_url,api_key,enabled FROM "${schemaPrefix}_web"."yyb_services" ORDER BY created_at,id`)).map(row => ({
      id: row.id,
      enabled: row.enabled,
      baseUrl: row.base_url === null || row.id === 'default' && environment.environmentFields.includes('yyb.baseUrl') ? config.yyb.baseUrl : row.base_url,
      apiKey: row.api_key === null || row.id === 'default' && environment.environmentFields.includes('yyb.apiKey') ? config.yyb.apiKey : row.api_key,
    }));
    if (!services.some(service => service.id === 'default')) services.unshift({ id: 'default', enabled: true, ...config.yyb });
    const available = service => service.enabled && typeof service.baseUrl === 'string' && service.baseUrl.trim();
    const selected = services.find(service => service.id === 'default' && available(service)) || services.find(available);
    if (!selected) throw new Error('真实联调没有已启用且已配置地址的 YYB 服务，请填写 .env 的 YYB_BASE_URL 或在管理端配置系统 YYB 服务。');
    return { ...config, yyb: { ...config.yyb, baseUrl: selected.baseUrl, apiKey: selected.apiKey } };
  } finally {
    await pool.end();
  }
}

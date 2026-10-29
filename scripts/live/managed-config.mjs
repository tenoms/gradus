import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { readRuntimeConfig } from '../../server/infrastructure/runtime-config.mjs';

const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const missingConfiguration = () => new Error('真实联调需要已保存的平台配置，请先在管理端完成平台配置。');

/** Read the managed configuration before creating any disposable verification schemas. */
export async function readManagedPlatformConfig({ database = readRuntimeConfig().database } = {}) {
  const { url, schemaPrefix, connectionTimeoutMs } = database;
  if (typeof schemaPrefix !== 'string' || !/^[a-z][a-z0-9_]{0,53}$/.test(schemaPrefix)) throw new Error('真实联调的数据库 schema 前缀格式不正确');
  const pool = new pg.Pool({ ...(url ? { connectionString: url } : {}), max: 1, connectionTimeoutMillis: connectionTimeoutMs });
  try {
    const { rows } = await pool.query(`SELECT config FROM "${schemaPrefix}_web"."platform_configuration" WHERE id=1`);
    if (!rows[0]?.config) throw missingConfiguration();
    const config = rows[0].config;
    let services;
    try {
      const result = await pool.query(`SELECT id,base_url,api_key,enabled FROM "${schemaPrefix}_web"."yyb_services" ORDER BY created_at,id`);
      services = result.rows.map(row => ({
        id: row.id,
        enabled: row.enabled,
        baseUrl: row.base_url === null ? config.yyb.baseUrl : row.base_url,
        apiKey: row.api_key === null ? config.yyb.apiKey : row.api_key,
      }));
    } catch (error) {
      if (error.code === '42P01') return config;
      throw error;
    }
    if (!services.some(service => service.id === 'default')) services.unshift({ id: 'default', enabled: true, ...config.yyb });
    const available = service => service.enabled && typeof service.baseUrl === 'string' && service.baseUrl.trim();
    const selected = services.find(service => service.id === 'default' && available(service)) || services.find(available);
    if (!selected) throw new Error('真实联调没有已启用且已配置地址的 YYB 服务，请先在管理端启用并配置系统 YYB 服务。');
    return { ...config, yyb: { ...config.yyb, baseUrl: selected.baseUrl, apiKey: selected.apiKey } };
  } catch (error) {
    if (['42P01', '3F000'].includes(error.code)) throw missingConfiguration();
    throw error;
  } finally {
    await pool.end();
  }
}

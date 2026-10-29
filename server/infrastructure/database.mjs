import pg from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { readRuntimeConfig } from "./runtime-config.mjs";

const identifier = (value) => {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw new Error("数据库 schema 或表名格式不正确");
  return `"${value}"`;
};

/** One pool owns two explicit data domains. Transactions pin all nested queries to one connection. */
export async function createDatabase(input = {}) {
  const configured = readRuntimeConfig().database;
  const { connectionString = configured.url || undefined, schemaPrefix = configured.schemaPrefix, ...options } = input;
  if (!schemaPrefix) throw new Error("请通过 STUDY_SCHEMA_PREFIX 提供数据库 schema 前缀");
  if (typeof schemaPrefix !== "string" || !/^[a-z][a-z0-9_]{0,53}$/.test(schemaPrefix)) throw new Error("数据库 schema 前缀需要 1–54 位小写字母、数字或下划线，并以字母开头");
  const webSchema = `${schemaPrefix}_web`, upstreamSchema = `${schemaPrefix}_upstream`;
  const pool = new pg.Pool({ ...(connectionString ? { connectionString } : {}), max: configured.maxConnections, connectionTimeoutMillis: configured.connectionTimeoutMs, ...options });
  // Idle sockets should not turn a transient database outage into an unhandled process error.
  pool.on("error", () => {});
  const context = new AsyncLocalStorage();
  const query = (sql, parameters) => (context.getStore() || pool).query(sql, parameters);
  const database = {
    webSchema, upstreamSchema,
    web: (table) => `${identifier(webSchema)}.${identifier(table)}`,
    upstream: (table) => `${identifier(upstreamSchema)}.${identifier(table)}`,
    query,
    async transaction(work) {
      if (context.getStore()) return work(database);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await context.run(client, () => work(database));
        await client.query("COMMIT");
        return result;
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    },
    close: () => pool.end(),
    async drop() {
      if (schemaPrefix === "study") throw new Error("生产数据 schema 不能由测试清理接口删除");
      await query(`DROP SCHEMA IF EXISTS ${identifier(webSchema)} CASCADE; DROP SCHEMA IF EXISTS ${identifier(upstreamSchema)} CASCADE`);
    },
  };
  try {
    await query(`CREATE SCHEMA IF NOT EXISTS ${identifier(webSchema)}; CREATE SCHEMA IF NOT EXISTS ${identifier(upstreamSchema)}`);
  } catch (error) { await pool.end(); throw error; }
  return database;
}

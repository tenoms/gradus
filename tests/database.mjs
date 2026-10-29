import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createDatabase } from '../server/infrastructure/database.mjs';

if (!process.env.DATABASE_URL && existsSync('.env')) process.loadEnvFile('.env');

/** Every test gets real PostgreSQL tables in its own two disposable schemas. */
export async function createTestDatabase() {
  const db = await createDatabase({ schemaPrefix: `test_${randomUUID().replaceAll('-', '')}`, max: 3 });
  const end = db.close;
  db.close = async () => { await db.drop(); await end(); };
  return db;
}

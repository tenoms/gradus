import assert from 'node:assert/strict';
import test from 'node:test';
import { readManagedPlatformConfig } from '../../scripts/live/managed-config.mjs';
import { readRuntimeConfig } from '../../server/infrastructure/runtime-config.mjs';
import { createTestDatabase } from '../support/database.mjs';

test('live checks require existing managed configuration and never seed the source database', async () => {
  const database = await createTestDatabase();
  const source = { ...readRuntimeConfig().database, schemaPrefix: database.webSchema.replace(/_web$/, '') };
  const table = database.web('platform_configuration');
  try {
    await assert.rejects(readManagedPlatformConfig({ database: source }), /请先在管理端完成平台配置/);
    assert.equal((await database.query('SELECT to_regclass($1) AS existing', [table])).rows[0].existing, null);

    await database.query(`CREATE TABLE ${table}(id INTEGER PRIMARY KEY,revision INTEGER NOT NULL,config JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL)`);
    await assert.rejects(readManagedPlatformConfig({ database: source }), /请先在管理端完成平台配置/);
    assert.equal((await database.query(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0].count, 0);

    const config = {
      yyb: { baseUrl: 'https://managed.example', apiKey: 'managed-secret' },
      math: { stationId: 19, ocrUsername: 'managed-ocr', ocrPassword: 'managed-password' },
      computer: { oauthClientSecret: 'managed-oauth', videoKey: 'managed-video-key', videoIv: 'managed-video-iv' },
    };
    await database.query(`INSERT INTO ${table}(id,revision,config,updated_at) VALUES(1,7,$1,$2)`, [config, '2026-01-02T03:04:05Z']);
    const before = (await database.query(`SELECT * FROM ${table}`)).rows;
    assert.deepEqual(await readManagedPlatformConfig({ database: source }), config);
    assert.deepEqual((await database.query(`SELECT * FROM ${table}`)).rows, before);
  } finally {
    await database.close();
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readManagedPlatformConfig } from '../../scripts/live/managed-config.mjs';
import { readRuntimeConfig } from '../../server/infrastructure/runtime-config.mjs';
import { createTestDatabase } from '../support/database.mjs';
import { createYybServices } from '../../server/modules/accounts/yyb-services.mjs';

async function managedSource(t, yyb = { baseUrl: 'https://platform.example', apiKey: 'platform-secret' }) {
  const database = await createTestDatabase();
  t.after(() => database.close());
  const config = { yyb, math: { stationId: 19 }, computer: { tenantCode: 'fixture' } };
  const table = database.web('platform_configuration');
  await database.query(`CREATE TABLE ${table}(id INTEGER PRIMARY KEY,revision INTEGER NOT NULL,config JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL)`);
  await database.query(`INSERT INTO ${table}(id,revision,config,updated_at) VALUES(1,7,$1,$2)`, [config, '2026-01-02T03:04:05Z']);
  const services = await createYybServices({ database, service: { getConfig: () => config } });
  const source = { ...readRuntimeConfig().database, schemaPrefix: database.webSchema.replace(/_web$/, '') };
  const snapshot = async () => ({
    platform: (await database.query(`SELECT * FROM ${table}`)).rows,
    services: (await database.query(`SELECT * FROM ${database.web('yyb_services')} ORDER BY created_at,id`)).rows,
  });
  return { config, services, source, snapshot };
}

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
    assert.equal((await database.query('SELECT to_regclass($1) AS existing', [database.web('yyb_services')])).rows[0].existing, null);
  } finally {
    await database.close();
  }
});

test('live checks prefer the explicitly saved default YYB service without changing either source table', async t => {
  const { config, services, source, snapshot } = await managedSource(t);
  await services.save({ name: 'Earlier secondary', baseUrl: 'https://secondary.example', apiKey: 'secondary-secret' });
  await services.save({ revision: 0, name: 'Edited default', baseUrl: 'https://edited-default.example', apiKey: 'edited-secret' }, 'default');
  const before = await snapshot();
  assert.deepEqual(await readManagedPlatformConfig({ database: source }), {
    ...config, yyb: { baseUrl: 'https://edited-default.example', apiKey: 'edited-secret' },
  });
  assert.deepEqual(await snapshot(), before);
});

test('live checks respect a disabled default and choose the first enabled secondary YYB service', async t => {
  const { config, services, source, snapshot } = await managedSource(t);
  await services.remove('default', 0);
  await services.save({ name: 'Disabled secondary', baseUrl: 'https://disabled.example', enabled: false });
  await services.save({ name: 'First enabled secondary', baseUrl: 'https://first-enabled.example', apiKey: 'first-secret' });
  await services.save({ name: 'Later secondary', baseUrl: 'https://later.example', apiKey: 'later-secret' });
  const before = await snapshot();
  assert.deepEqual(await readManagedPlatformConfig({ database: source }), {
    ...config, yyb: { baseUrl: 'https://first-enabled.example', apiKey: 'first-secret' },
  });
  assert.deepEqual(await snapshot(), before);
});

test('live checks keep the implicit default when no default YYB service row exists', async t => {
  const { config, services, source, snapshot } = await managedSource(t);
  await services.save({ name: 'Secondary', baseUrl: 'https://secondary.example', apiKey: 'secondary-secret' });
  const before = await snapshot();
  assert.deepEqual(await readManagedPlatformConfig({ database: source }), config);
  assert.deepEqual(await snapshot(), before);
});

test('live checks can use an enabled secondary when the implicit default has no address', async t => {
  const { config, services, source, snapshot } = await managedSource(t, { baseUrl: '', apiKey: 'unused-platform-secret' });
  await services.save({ name: 'Secondary without credentials', baseUrl: 'https://secondary.example' });
  const before = await snapshot();
  assert.deepEqual(await readManagedPlatformConfig({ database: source }), {
    ...config, yyb: { baseUrl: 'https://secondary.example', apiKey: '' },
  });
  assert.deepEqual(await snapshot(), before);
});

test('live checks reject fully disabled YYB services instead of restoring the platform default', async t => {
  const { services, source, snapshot } = await managedSource(t);
  await services.remove('default', 0);
  await services.save({ name: 'Disabled secondary', baseUrl: 'https://disabled.example', enabled: false });
  const before = await snapshot();
  await assert.rejects(readManagedPlatformConfig({ database: source }), /没有已启用且已配置地址的 YYB 服务/);
  assert.deepEqual(await snapshot(), before);
});

test('live checks reject an unconfigured implicit default when every secondary is disabled', async t => {
  const { services, source, snapshot } = await managedSource(t, { baseUrl: '', apiKey: '' });
  await services.save({ name: 'Disabled secondary', baseUrl: 'https://disabled.example', enabled: false });
  const before = await snapshot();
  await assert.rejects(readManagedPlatformConfig({ database: source }), /没有已启用且已配置地址的 YYB 服务/);
  assert.deepEqual(await snapshot(), before);
});

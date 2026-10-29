import { ApiError } from '../../infrastructure/api-error.mjs';
import { appearanceDefaults, validateAppearanceConfig } from '../../../shared/appearance.mjs';

/** The managed theme is shared by all learners; it is unrelated to platform credentials. */
export async function createAppearanceStore({ database, identities }) {
  const table = database.web('appearance_settings');
  await database.query(`CREATE TABLE IF NOT EXISTS ${table} (id integer PRIMARY KEY CHECK(id=1),config jsonb NOT NULL,revision integer NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT now())`);
  await database.query(`INSERT INTO ${table}(id,config) VALUES(1,$1) ON CONFLICT DO NOTHING`, [JSON.stringify(appearanceDefaults())]);
  const value = row => ({ revision: row.revision, config: validateAppearanceConfig(row.config), updatedAt: new Date(row.updated_at).toISOString() });
  async function settings() { return value((await database.query(`SELECT * FROM ${table} WHERE id=1`)).rows[0]); }
  async function update(input, actor) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['revision', 'config'].includes(key)) || !Number.isSafeInteger(input.revision) || input.revision < 0)
      throw new ApiError('主题配置版本或内容格式不正确', 400);
    const config = validateAppearanceConfig(input.config);
    return database.transaction(async () => {
      const row = (await database.query(`UPDATE ${table} SET config=$1,revision=revision+1,updated_at=now() WHERE id=1 AND revision=$2 RETURNING *`, [JSON.stringify(config), input.revision])).rows[0];
      if (!row) throw new ApiError('主题配置已更新，请重新读取后再保存', 409);
      await identities.audit(actor, 'appearance.updated', '学习空间主题', `数学：${config.math.palette}/${config.math.mode}；408：${config.computer.palette}/${config.computer.mode}`);
      return value(row);
    });
  }
  return { settings, update };
}

import system from '../../config/system.json' with { type: 'json' };

const fail = (field, requirement) => { throw new Error(`运行配置 ${field} ${requirement}`); };
const integer = (value, field, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(field, `必须为 ${minimum}–${maximum} 的整数`);
};
const text = (value, field, optional = false) => {
  if (typeof value !== 'string' || (!optional && !value.trim())) fail(field, '必须为有效字符串');
};
const bodyLimit = (value, field) => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return;
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?\s*(?:b|kb|mb|gb)$/i.test(value) || parseFloat(value) <= 0) fail(field, '必须为正数字节数或带单位的大小');
};

/** Deployment environment supplies connections; release policy comes from one settings file. */
export function readRuntimeConfig({ env = process.env } = {}) {
  const runtime = structuredClone(system.runtime);
  runtime.database.url = env.DATABASE_URL || '';
  runtime.database.schemaPrefix = env.STUDY_SCHEMA_PREFIX ?? '';
  const override = (name, target, key, convert = value => value) => {
    if (env[name] !== undefined && env[name] !== '') target[key] = convert(env[name]);
  };
  override('HOST', runtime.http, 'host');
  override('PORT', runtime.http, 'port', Number);
  override('COOKIE_SECURE', runtime.session, 'secureCookies', value => {
    if (['1', 'true'].includes(String(value))) return true;
    if (['0', 'false'].includes(String(value))) return false;
    fail('session.secureCookies', '必须为布尔值，COOKIE_SECURE 只接受 0/1/false/true');
  });

  return validateRuntimeConfig(runtime);
}

export function validateRuntimeConfig(runtime) {
  text(runtime.http.host, 'http.host');
  integer(runtime.http.port, 'http.port', 0, 65535);
  bodyLimit(runtime.http.jsonBodyLimit, 'http.jsonBodyLimit');
  bodyLimit(runtime.http.uploadBodyLimit, 'http.uploadBodyLimit');
  integer(runtime.http.assetMaxAgeMs, 'http.assetMaxAgeMs');
  text(runtime.development.host, 'development.host');
  integer(runtime.development.port, 'development.port', 1, 65535);
  if (!Array.isArray(runtime.development.fsDeny) || runtime.development.fsDeny.some(value => typeof value !== 'string' || !value.trim())) fail('development.fsDeny', '必须为非空路径模式组成的数组');
  text(runtime.database.url, 'database.url', true);
  if (runtime.database.url) {
    let url;
    try { url = new URL(runtime.database.url); } catch { fail('database.url', '必须为 PostgreSQL URL'); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) fail('database.url', '必须为 PostgreSQL URL');
  }
  if (typeof runtime.database.schemaPrefix !== 'string' || runtime.database.schemaPrefix !== '' && !/^[a-z][a-z0-9_]{0,53}$/.test(runtime.database.schemaPrefix)) fail('database.schemaPrefix', '如设置，必须为 1–54 位小写字母、数字或下划线，并以字母开头');
  integer(runtime.database.maxConnections, 'database.maxConnections', 1);
  integer(runtime.database.connectionTimeoutMs, 'database.connectionTimeoutMs');
  integer(runtime.session.lifetimeMs, 'session.lifetimeMs', 1);
  if (typeof runtime.session.secureCookies !== 'boolean') fail('session.secureCookies', '必须为布尔值');
  integer(runtime.resources.publicTtlMs, 'resources.publicTtlMs');
  integer(runtime.accounts.directoryCacheTtlMs, 'accounts.directoryCacheTtlMs');
  integer(runtime.accounts.assignmentTtlMs, 'accounts.assignmentTtlMs', 1);
  integer(runtime.upstream.requestTimeoutMs, 'upstream.requestTimeoutMs', 1);
  integer(runtime.upstream.avatarTimeoutMs, 'upstream.avatarTimeoutMs', 1);
  integer(runtime.diagnostics.recentRequests, 'diagnostics.recentRequests');
  return runtime;
}

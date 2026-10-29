import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function readJson(filename, optional = false) {
  let text;
  try { text = readFileSync(filename, 'utf8'); }
  catch (error) {
    if (optional && error.code === 'ENOENT') return {};
    throw new Error(`无法读取配置文件：${filename}`);
  }
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error(`配置文件必须为有效 JSON：${filename}`); }
  if (!object(value)) throw new Error(`配置文件顶层必须为对象：${filename}`);
  return value;
}
function merge(defaults, override, field = '') {
  const result = structuredClone(defaults);
  for (const [key, value] of Object.entries(override)) {
    const name = field ? `${field}.${key}` : key;
    if (!Object.hasOwn(defaults, key)) throw new Error(`未知配置字段：${name}`);
    if (object(defaults[key])) {
      if (!object(value)) throw new Error(`配置字段必须为对象：${name}`);
      result[key] = merge(defaults[key], value, name);
    } else result[key] = value;
  }
  return result;
}

export function deploymentConfigPath({ env = process.env, configFile } = {}) {
  if (configFile === false) return null;
  return path.resolve(root, (configFile ?? env.STUDY_CONFIG_FILE) || 'config/local.json');
}

/** Versioned defaults plus one optional deployment file; secrets stay on the server. */
export function readFileConfiguration({ env = process.env, configFile } = {}) {
  const defaults = readJson(path.join(root, 'config/defaults.json'));
  const filename = deploymentConfigPath({ env, configFile });
  if (!filename) return defaults;
  const selected = configFile ?? env.STUDY_CONFIG_FILE;
  const overrides = readJson(filename, !selected);
  return merge(defaults, overrides);
}

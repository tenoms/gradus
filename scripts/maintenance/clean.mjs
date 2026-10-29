import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reports = process.argv.includes('--reports');
const unknown = process.argv.slice(2).filter(argument => argument !== '--reports');
if (unknown.length) throw new Error(`未知清理参数：${unknown.join(', ')}`);
const targets = ['dist', ...(reports ? ['artifacts'] : [])];
for (const entry of await readdir(root)) if (entry.endsWith('.tsbuildinfo')) targets.push(entry);
for (const target of targets) {
  await rm(path.join(root, target), { recursive: true, force: true });
  console.log(`Removed ${target}`);
}

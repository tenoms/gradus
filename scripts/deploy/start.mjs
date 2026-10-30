import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const marker = path.join(root, 'node_modules/.study-production-ready');
const require = createRequire(path.join(root, 'package.json'));

function dependenciesReady(manifest) {
  return Object.keys(manifest.dependencies || {}).every(name => {
    if (!existsSync(path.join(root, 'node_modules', name, 'package.json'))) return false;
    try { require.resolve(name); return true; } catch { return false; }
  });
}

function installDependencies() {
  return new Promise((resolve, reject) => {
    const npm = process.env.npm_execpath;
    const args = ['ci', '--omit=dev', '--no-audit', '--no-fund'];
    const child = spawn(npm ? process.execPath : 'npm', npm ? [npm, ...args] : args, {
      cwd: root,
      env: { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}` },
      stdio: 'inherit',
    });
    let stopped;
    const stop = signal => { stopped = signal; child.kill(signal); };
    const interrupt = () => stop('SIGINT');
    const terminate = () => stop('SIGTERM');
    const cleanup = () => {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', terminate);
    };
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', terminate);
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', (code, signal) => {
      cleanup();
      if (stopped) reject(Object.assign(new Error('生产依赖安装已停止。'), { exitCode: stopped === 'SIGINT' ? 130 : 143 }));
      else if (code !== 0 || signal) reject(Object.assign(new Error('生产依赖安装失败，请检查上方 npm 日志后重新启动。'), { exitCode: code || 1 }));
      else resolve();
    });
  });
}

try {
  process.chdir(root);
  const envFile = path.join(root, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  process.env.NODE_ENV = 'production';

  const manifestText = await readFile(path.join(root, 'package.json'), 'utf8');
  const lockText = await readFile(path.join(root, 'package-lock.json'), 'utf8');
  const fingerprint = createHash('sha256').update(manifestText).update('\0').update(lockText).digest('hex');
  const installed = await readFile(marker, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  const manifest = JSON.parse(manifestText);
  if (installed !== fingerprint || !dependenciesReady(manifest)) {
    console.log('[生产启动] 正在安装生产依赖…');
    await installDependencies();
    if (!dependenciesReady(manifest)) throw new Error('生产依赖尚未安装完整，请检查 npm 配置与安装日志。');
    await mkdir(path.dirname(marker), { recursive: true });
    await writeFile(marker, fingerprint);
  }
  console.log('[生产启动] 依赖已就绪，正在启动服务。');
  await import(pathToFileURL(path.join(root, 'server/index.mjs')).href);
} catch (error) {
  console.error(`[生产启动] ${error.message}`);
  process.exitCode = error.exitCode || 1;
}

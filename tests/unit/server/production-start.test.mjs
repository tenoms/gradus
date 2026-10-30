import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'study-start-test-')));
  await mkdir(path.join(root, 'scripts/deploy'), { recursive: true });
  await mkdir(path.join(root, 'server'));
  await cp(new URL('../../../scripts/deploy/start.mjs', import.meta.url), path.join(root, 'scripts/deploy/start.mjs'));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'study-start-test', version: '1.0.0', type: 'module', dependencies: { 'release-dep': '1.0.0' } }));
  await writeFile(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}');
  await writeFile(path.join(root, '.env'), 'STUDY_START_TEST_ENV=from-file\nNODE_ENV=development\n');
  await writeFile(path.join(root, 'server/index.mjs'), `import value from 'release-dep'; console.log('SERVER_READY ' + JSON.stringify({ value, cwd: process.cwd(), mode: process.env.NODE_ENV, env: process.env.STUDY_START_TEST_ENV }));`);
  const npm = path.join(root, 'npm-cli.mjs');
  await writeFile(npm, `
    import { appendFile, mkdir, writeFile } from 'node:fs/promises';
    await appendFile('install.jsonl', JSON.stringify({ args: process.argv.slice(2), node: process.execPath, cwd: process.cwd(), mode: process.env.NODE_ENV }) + '\\n');
    if (process.env.STUDY_INSTALL_MODE === 'fail') process.exit(42);
    if (process.env.STUDY_INSTALL_MODE === 'wait') { console.log('INSTALL_WAITING'); await new Promise(() => setInterval(() => {}, 1000)); }
    await mkdir('node_modules/release-dep', { recursive: true });
    await writeFile('node_modules/release-dep/package.json', '{"name":"release-dep","version":"1.0.0","type":"module","exports":"./index.mjs"}');
    await writeFile('node_modules/release-dep/index.mjs', 'export default "ready";');
  `);
  const options = mode => ({ cwd: tmpdir(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, npm_execpath: npm, STUDY_START_TEST_ENV: '', STUDY_INSTALL_MODE: mode || '' } });
  const run = mode => {
    const settings = options(mode);
    delete settings.env.STUDY_START_TEST_ENV;
    return execFileSync(process.execPath, [path.join(root, 'scripts/deploy/start.mjs')], settings);
  };
  return { root, options, run, installs: async () => (await readFile(path.join(root, 'install.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line)), close: () => rm(root, { recursive: true, force: true }) };
}

test('production startup installs once, loads project configuration and reuses ready dependencies until inputs change or a package is removed', async () => {
  const f = await fixture();
  try {
    const envBefore = await readFile(path.join(f.root, '.env'), 'utf8');
    const first = f.run();
    const server = JSON.parse(first.split('SERVER_READY ')[1]);
    assert.deepEqual(server, { value: 'ready', cwd: f.root, mode: 'production', env: 'from-file' });
    assert.deepEqual((await f.installs())[0], { args: ['ci', '--omit=dev', '--no-audit', '--no-fund'], node: process.execPath, cwd: f.root, mode: 'production' });
    assert.match(f.run('fail'), /SERVER_READY/);
    assert.equal((await f.installs()).length, 1, 'a ready restart must not contact npm');
    await writeFile(path.join(f.root, 'package-lock.json'), '{"lockfileVersion":3,"updated":true}');
    assert.match(f.run(), /SERVER_READY/);
    assert.equal((await f.installs()).length, 2);
    const manifest = JSON.parse(await readFile(path.join(f.root, 'package.json'), 'utf8'));
    await writeFile(path.join(f.root, 'package.json'), JSON.stringify({ ...manifest, version: '1.0.1' }));
    assert.match(f.run(), /SERVER_READY/);
    assert.equal((await f.installs()).length, 3);
    await rm(path.join(f.root, 'node_modules/release-dep'), { recursive: true });
    assert.match(f.run(), /SERVER_READY/);
    assert.equal((await f.installs()).length, 4);
    assert.equal(await readFile(path.join(f.root, '.env'), 'utf8'), envBefore);
  } finally { await f.close(); }
});

test('an installation failure preserves its exit code and does not start the server or mark dependencies ready', async () => {
  const f = await fixture();
  try {
    assert.throws(() => f.run('fail'), error => error.status === 42 && !error.stdout.includes('SERVER_READY') && /安装失败/.test(error.stderr));
    await assert.rejects(readFile(path.join(f.root, 'node_modules/.study-production-ready')), { code: 'ENOENT' });
    assert.equal((await f.installs()).length, 1);
  } finally { await f.close(); }
});

test('stopping startup during installation stops npm and never starts the application', { timeout: 10000 }, async () => {
  const f = await fixture();
  const child = spawn(process.execPath, [path.join(f.root, 'scripts/deploy/start.mjs')], { ...f.options('wait'), stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  try {
    await new Promise((resolve, reject) => {
      child.stdout.on('data', chunk => { output += chunk; if (output.includes('INSTALL_WAITING')) resolve(); });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`startup exited before installation: ${code}`)));
    });
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const [code] = await exited;
    assert.equal(code, 143);
    assert.ok(!output.includes('SERVER_READY'));
    await assert.rejects(readFile(path.join(f.root, 'node_modules/.study-production-ready')), { code: 'ENOENT' });
  } finally {
    if (child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); }
    await f.close();
  }
});

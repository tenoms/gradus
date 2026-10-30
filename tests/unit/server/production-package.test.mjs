import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProductionArchive } from '../../../scripts/deploy/package.mjs';

const tarOptions = { env: { ...process.env, LC_ALL: 'C' }, encoding: 'utf8' };

test('production archives include runtime files and templates while excluding local configuration and dependencies', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'study-package-test-'));
  try {
    const runtimeFiles = {
      'dist/index.html': 'landing', 'dist/learn.html': 'learning', 'dist/admin.html': 'admin',
      'dist/assets/app.js': 'built application', 'dist/favicon.svg': '<svg/>',
      'server/index.mjs': 'server entry',
      'server/integrations/math-allowlist.json': '{"math":true}',
      'server/integrations/computer-allowlist.json': '{"computer":true}',
      'shared/appearance.mjs': 'shared module', 'config/system.json': '{"runtime":{}}',
      'package.json': '{"name":"study-web","version":"9.8.7","type":"module"}',
      'package-lock.json': '{"lockfileVersion":3}', '.env.example': 'DATABASE_URL=', '.node-version': '24',
    };
    const privateFiles = {
      '.env': 'root secret', '.env.production': 'production secret',
      'server/.env': 'nested secret', 'server/.env.local': 'nested local secret',
      'server/node_modules/private/index.js': 'installed dependency', 'node_modules/local/index.js': 'local dependency',
      'server/.git/config': 'git configuration', 'shared/.DS_Store': 'desktop metadata', 'server/debug.log': 'runtime log',
      'src/app.ts': 'unbuilt source', 'config/private.json': 'private configuration', 'tests/private.test.mjs': 'test data',
    };
    for (const [name, content] of Object.entries({ ...runtimeFiles, ...privateFiles })) {
      const destination = path.join(root, name);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content);
    }
    const archive = await createProductionArchive(root);
    assert.equal(archive, path.join(root, 'artifacts/releases/study-web-9.8.7.tar.gz'));
    const contents = execFileSync('tar', ['-tzf', archive], tarOptions).trim().split('\n');
    for (const name of Object.keys(runtimeFiles)) assert.ok(contents.includes(`study-web/${name}`), `missing ${name}`);
    for (const name of Object.keys(privateFiles)) assert.ok(!contents.includes(`study-web/${name}`), `unexpected ${name}`);
    assert.ok(contents.every(name => name.startsWith('study-web/')));
    assert.ok(contents.every(name => !/(?:^|\/)(?:\.env(?:\.(?!example(?:\/|$))[^/]+)?|node_modules|\.git|\.DS_Store|src|tests)(?:\/|$)|\.(?:log|tsbuildinfo)$/.test(name)), 'private or development files must not be packaged');
    assert.ok(!contents.includes('study-web/config/private.json'));
    const extracted = path.join(root, 'extracted');
    await mkdir(extracted);
    execFileSync('tar', ['-xzf', archive, '-C', extracted], tarOptions);
    assert.equal(await readFile(path.join(extracted, 'study-web/server/integrations/math-allowlist.json'), 'utf8'), runtimeFiles['server/integrations/math-allowlist.json']);
    assert.equal(await readFile(path.join(extracted, 'study-web/.env.example'), 'utf8'), runtimeFiles['.env.example']);

    await writeFile(path.join(root, 'dist/assets/app.js'), 'updated application');
    assert.equal(await createProductionArchive(root), archive);
    execFileSync('tar', ['-xzf', archive, '-C', extracted], tarOptions);
    assert.equal(await readFile(path.join(extracted, 'study-web/dist/assets/app.js'), 'utf8'), 'updated application');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

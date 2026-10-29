import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

test('development serves nonsecret system settings while protecting deployment credentials', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const directory = await mkdtemp(path.join(root, 'config/deployment-test-'));
  const filename = path.join(directory, '.env');
  await writeFile(filename, 'DATABASE_URL=postgresql://fixture:private@localhost/test');
  let server;
  try {
    server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    const envPath = '/' + path.relative(root, filename).split(path.sep).join('/');
    for (const [route, expected] of [
      [envPath, 403],
      [envPath + '?import', 403],
      ['/@fs' + filename, 403],
      ['/config/system.json', 200],
    ]) {
      const response = await fetch(base + route);
      assert.equal(response.status, expected, route);
      await response.body.cancel();
    }
  } finally {
    await server?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

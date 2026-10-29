import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

test('development serves public settings while rejecting default and selected private configuration', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const directory = await mkdtemp(path.join(root, 'config/deployment-test-'));
  const filename = path.join(directory, 'settings.json');
  await writeFile(filename, JSON.stringify({ runtime: { http: { port: 39123 } } }));
  const previous = process.env.STUDY_CONFIG_FILE;
  let server;
  try {
    process.env.STUDY_CONFIG_FILE = filename;
    server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
    assert.equal(server.config.server.proxy['/api'].target, 'http://127.0.0.1:39123');
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    const selectedPath = '/' + path.relative(root, filename).split(path.sep).join('/');
    for (const [route, expected] of [
      ['/config/defaults.json', 403],
      [selectedPath, 403],
      [selectedPath + '?import', 403],
      ['/@fs' + filename, 403],
      ['/config/public.json', 200],
    ]) {
      const response = await fetch(base + route);
      assert.equal(response.status, expected, route);
      await response.body.cancel();
    }
  } finally {
    await server?.close();
    if (previous === undefined) delete process.env.STUDY_CONFIG_FILE;
    else process.env.STUDY_CONFIG_FILE = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

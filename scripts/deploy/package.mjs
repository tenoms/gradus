import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entries = ['dist', 'server', 'shared', 'scripts/deploy/start.mjs', 'config/system.json', 'package.json', 'package-lock.json', '.env.example', '.node-version'];
const excluded = new Set(['node_modules', '.git', '.DS_Store', '.data', 'artifacts', 'coverage']);
const include = source => {
  const name = path.basename(source);
  return !excluded.has(name) && !/\.(?:log|tsbuildinfo)$/.test(name) && (name === '.env.example' || !/^\.env(?:\.|$)/.test(name));
};

export async function createProductionArchive(projectRoot = root) {
  const { version } = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  const output = path.join(projectRoot, 'artifacts/releases', `study-web-${version}.tar.gz`);
  const temporary = await mkdtemp(path.join(tmpdir(), 'study-web-package-'));
  try {
    const staging = path.join(temporary, 'study-web');
    for (const entry of entries) {
      const destination = path.join(staging, entry);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(projectRoot, entry), destination, { recursive: true, filter: include });
    }
    await mkdir(path.dirname(output), { recursive: true });
    execFileSync('tar', ['-czf', output, '-C', temporary, 'study-web'], {
      env: { ...process.env, COPYFILE_DISABLE: '1', LC_ALL: 'C' },
      stdio: 'inherit',
    });
    console.log(`Production package: ${path.relative(projectRoot, output)}`);
    return output;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await createProductionArchive();

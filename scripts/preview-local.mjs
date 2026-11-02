import { cpSync, existsSync, mkdirSync, realpathSync, symlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// Serve a built snapshot outside synced Documents; source stays in the repository.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const suffix = createHash('sha256').update(root).digest('hex').slice(0, 10);
const snapshot = resolve(homedir(), '.cache', `doodlume-preview-${suffix}`);
if (!existsSync(resolve(root, 'dist/index.html'))) throw new Error('Build the studio first with npm run build.');
mkdirSync(snapshot, { recursive: true, mode: 0o700 });
for (const name of ['dist', 'server', 'shared']) cpSync(resolve(root, name), resolve(snapshot, name), { recursive: true });
mkdirSync(resolve(snapshot, 'scripts'), { recursive: true });
cpSync(resolve(root, 'scripts/local-sam-worker.py'), resolve(snapshot, 'scripts/local-sam-worker.py'));
cpSync(resolve(root, 'package.json'), resolve(snapshot, 'package.json'));
const modules = resolve(snapshot, 'node_modules');
if (!existsSync(modules)) symlinkSync(realpathSync(resolve(root, 'node_modules')), modules, 'dir');
const child = spawn(process.execPath, ['--import', 'tsx', resolve(snapshot, 'server/index.ts')], {
  cwd: snapshot,
  stdio: 'inherit',
  env: { ...process.env, API_PORT: '5173', DOODLUME_ENV_FILE: resolve(root, '.env.local') },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 0; });

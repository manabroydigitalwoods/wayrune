#!/usr/bin/env node
/**
 * Build Presence component package into dist/ (ZIP layout).
 * component/ = package source; src/ = local playground + mount.ts (never uploaded as TS).
 */
import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const componentDir = join(root, 'component');
const dist = join(root, 'dist');

function mustExist(path, label) {
  if (!existsSync(path)) {
    console.error(`Missing ${label}: ${path}`);
    process.exit(1);
  }
}

mustExist(join(componentDir, 'component.json'), 'component/component.json');
mustExist(join(root, 'src', 'mount.ts'), 'src/mount.ts');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const name of ['component.json', 'index.html', 'styles.css', 'preview.svg', 'preview.png']) {
  const src = join(componentDir, name);
  if (existsSync(src)) cpSync(src, join(dist, name));
}
if (existsSync(join(componentDir, 'assets'))) {
  cpSync(join(componentDir, 'assets'), join(dist, 'assets'), { recursive: true });
}

const readme = join(root, 'README.md');
if (existsSync(readme)) {
  writeFileSync(
    join(dist, 'README.md'),
    `# Promo banner component\n\nBuilt package. Upload or deploy with Presence CLI.\n\n---\n\n${readFileSync(readme, 'utf8')}`,
  );
}

const mount = spawnSync(
  'pnpm',
  ['exec', 'vite', 'build', '--config', 'vite.mount.config.ts'],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
);
if (mount.status !== 0) process.exit(mount.status ?? 1);

mustExist(join(dist, 'index.js'), 'dist/index.js');
console.log(`Built component package → ${dist}`);

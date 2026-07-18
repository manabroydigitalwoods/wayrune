#!/usr/bin/env node
/**
 * Build Presence package into dist/ (ZIP layout).
 * site/ = authoring source; src/ = local preview only (never copied).
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const dist = join(root, 'dist');

function mustExist(path, label) {
  if (!existsSync(path)) {
    console.error(`Missing ${label}: ${path}`);
    process.exit(1);
  }
}

mustExist(join(site, 'theme.json'), 'site/theme.json');
mustExist(join(site, 'tokens.json'), 'site/tokens.json');
mustExist(join(site, 'structure.json'), 'site/structure.json');

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'styles'), { recursive: true });
mkdirSync(join(dist, 'site'), { recursive: true });

cpSync(join(site, 'theme.json'), join(dist, 'theme.json'));
cpSync(join(site, 'tokens.json'), join(dist, 'tokens.json'));
cpSync(join(site, 'structure.json'), join(dist, 'site', 'structure.json'));

if (existsSync(join(site, 'preview.svg'))) {
  cpSync(join(site, 'preview.svg'), join(dist, 'preview.svg'));
}
if (existsSync(join(site, 'chrome'))) {
  cpSync(join(site, 'chrome'), join(dist, 'chrome'), { recursive: true });
}
if (existsSync(join(site, 'components'))) {
  cpSync(join(site, 'components'), join(dist, 'components'), { recursive: true });
}
if (existsSync(join(site, 'assets'))) {
  cpSync(join(site, 'assets'), join(dist, 'assets'), { recursive: true });
}

const readme = join(root, 'README.md');
if (existsSync(readme)) {
  const text = readFileSync(readme, 'utf8');
  writeFileSync(
    join(dist, 'README.md'),
    `# Travel Agency theme\n\nBuilt package. Upload or deploy with Presence CLI.\n\n---\n\n${text}`,
  );
}

const cssIn = join(root, 'src', 'styles', 'theme-src.css');
const cssOut = join(dist, 'styles', 'theme.css');
mustExist(cssIn, 'src/styles/theme-src.css');

const tw = spawnSync(
  'pnpm',
  ['exec', 'tailwindcss', '-i', cssIn, '-o', cssOut, '--minify'],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
);
if (tw.status !== 0) process.exit(tw.status ?? 1);

console.log(`Built package → ${dist}`);

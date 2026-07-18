import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND } from './brand.js';

const CLI = BRAND.cli.primary;

function sdkRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../..');
}

function copyExample(exampleName: string, dest: string): void {
  const src = join(sdkRoot(), 'examples', exampleName);
  if (!existsSync(src)) {
    throw new Error(
      `Example not found at ${src}. Build/install @wayrune/presence-sdk with examples.`,
    );
  }
  if (existsSync(dest) && readdirSync(dest).length) {
    throw new Error(`Destination is not empty: ${dest}`);
  }
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    filter: (path) => {
      const base = path.split(/[/\\]/).pop() || '';
      return (
        base !== 'node_modules' &&
        base !== 'out' &&
        base !== 'dist' &&
        base !== 'preview-dist' &&
        base !== '.git'
      );
    },
  });
}

/** @deprecated Use initAgencySite */
export function initTravelAgency(targetDir: string): void {
  initAgencySite(targetDir, { legacyAlias: true });
}

export function initAgencySite(
  targetDir: string,
  opts?: { legacyAlias?: boolean },
): void {
  if (opts?.legacyAlias) {
    console.warn(
      `Warning: "init travel-agency" is deprecated. Use "${CLI} init agency-site" instead.`,
    );
  }

  const dest = resolve(targetDir);
  copyExample('agency-site', dest);

  const cfgPath = join(dest, 'presence.config.json');
  if (!existsSync(cfgPath)) {
    writeFileSync(
      cfgPath,
      `${JSON.stringify({ siteName: 'Agency Site', onConflict: 'overwrite' }, null, 2)}\n`,
    );
  }

  const pkgPath = join(dest, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
      if (
        pkg.name === 'presence-agency-site-example' ||
        pkg.name === 'presence-travel-agency-example'
      ) {
        pkg.name = `presence-theme-${dest.split(/[/\\]/).pop() || 'site'}`;
        writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
      }
    } catch {
      /* ignore */
    }
  }

  const themePath = join(dest, 'site', 'theme.json');
  if (existsSync(themePath)) {
    try {
      const theme = JSON.parse(readFileSync(themePath, 'utf8')) as {
        key?: string;
        name?: string;
      };
      const folder = dest.split(/[/\\]/).pop() || 'agency-site';
      const slug = folder
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48);
      if (slug && (theme.key === 'agency-site' || theme.key === 'travel-agency')) {
        theme.key = slug;
        theme.name = folder.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        writeFileSync(themePath, `${JSON.stringify(theme, null, 2)}\n`);
      }
    } catch {
      /* ignore */
    }
  }

  console.log(`Created agency site theme at ${dest}`);
  console.log('Next:');
  console.log('  cd ' + dest);
  console.log('  pnpm install');
  console.log('  pnpm dev');
  console.log(`  ${CLI} auth login`);
  console.log(`  ${CLI} deploy`);
}

export function initComponent(targetDir: string): void {
  const dest = resolve(targetDir);
  copyExample('promo-banner', dest);

  const cfgPath = join(dest, 'presence.config.json');
  if (!existsSync(cfgPath)) {
    writeFileSync(cfgPath, `${JSON.stringify({}, null, 2)}\n`);
  }

  const folder = dest.split(/[/\\]/).pop() || 'component';
  const pkgPath = join(dest, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
      pkg.name = `presence-component-${folder}`;
      writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    } catch {
      /* ignore */
    }
  }

  const manifestPath = join(dest, 'component', 'component.json');
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        key?: string;
        name?: string;
      };
      const slug = folder
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48);
      if (slug) {
        manifest.key = slug;
        manifest.name = folder.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      }
    } catch {
      /* ignore */
    }
  }

  console.log(`Created component package at ${dest}`);
  console.log('Next:');
  console.log('  cd ' + dest);
  console.log('  pnpm install');
  console.log('  pnpm dev');
  console.log(`  ${CLI} auth login`);
  console.log(`  ${CLI} deploy`);
}

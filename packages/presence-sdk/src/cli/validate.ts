import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  PresenceComponentPackageManifestSchema,
  PresenceThemePackageManifestSchema,
} from '@wayrune/contracts';
import type { ValidateIssue, ValidateResult } from './types.js';

const PARENT_TOKEN_KEYS = [
  'primary',
  'accent',
  'background',
  'foreground',
  'muted',
  'fontDisplay',
  'fontBody',
] as const;

const BLOCKED_EXT = new Set(['.ts', '.tsx', '.jsx', '.zip', '.cjs']);
const ALLOWED_EXT = new Set([
  '.json',
  '.css',
  '.js',
  '.mjs',
  '.map',
  '.woff2',
  '.woff',
  '.ttf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
  '.md',
  '.html',
]);

function extOf(path: string): string {
  const i = path.lastIndexOf('.');
  return i >= 0 ? path.slice(i).toLowerCase() : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function walkFiles(root: string, dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'out' || name === 'dist') continue;
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'src') continue; // local preview only
      walkFiles(root, full, out);
    } else {
      out.push(full);
    }
  }
}

function packIncludePaths(root: string): string[] {
  const files: string[] = [];
  const includeRoots = [
    'theme.json',
    'tokens.json',
    'preview.svg',
    'preview.png',
    'preview.jpg',
    'preview.webp',
    'README.md',
    'styles',
    'scripts',
    'chrome',
    'assets',
    'components',
    'site',
  ];
  for (const rel of includeRoots) {
    const full = join(root, rel);
    if (!existsSync(full)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walkPackDir(root, full, files);
    else files.push(full);
  }
  // theme-vite: dist/theme.js → scripts/theme.js handled in pack
  return files;
}

function walkPackDir(root: string, dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkPackDir(root, full, out);
    else out.push(full);
  }
}

export function listThemePackageFiles(root: string): { abs: string; rel: string }[] {
  const absFiles = packIncludePaths(root);
  const distThemeJs = join(root, 'dist', 'theme.js');
  const mapped: { abs: string; rel: string }[] = [];
  for (const abs of absFiles) {
    mapped.push({ abs, rel: relative(root, abs).replace(/\\/g, '/') });
  }
  if (existsSync(distThemeJs) && !mapped.some((m) => m.rel === 'scripts/theme.js')) {
    mapped.push({ abs: distThemeJs, rel: 'scripts/theme.js' });
  }
  return mapped;
}

export function validateThemeDirectory(dir: string): ValidateResult {
  const issues: ValidateIssue[] = [];
  const root = dir;

  const themePath = join(root, 'theme.json');
  if (!existsSync(themePath)) {
    return { ok: false, issues: [{ level: 'error', message: 'theme.json missing at package root' }] };
  }

  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(readFileSync(themePath, 'utf8'));
  } catch {
    return { ok: false, issues: [{ level: 'error', message: 'theme.json is not valid JSON' }] };
  }

  const parsed = PresenceThemePackageManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        level: 'error',
        message: `theme.json: ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      });
    }
    return { ok: false, issues };
  }
  const manifest = parsed.data;
  if (manifest.parent && manifest.parent === manifest.key) {
    issues.push({ level: 'error', message: 'Theme cannot be its own parent' });
  }

  const tokensPath = join(root, 'tokens.json');
  let tokens: Record<string, unknown> = {};
  if (existsSync(tokensPath)) {
    try {
      tokens = asRecord(JSON.parse(readFileSync(tokensPath, 'utf8')));
    } catch {
      issues.push({ level: 'error', message: 'tokens.json is not valid JSON' });
    }
  }

  if (!manifest.parent) {
    if (!existsSync(tokensPath)) {
      issues.push({ level: 'error', message: 'tokens.json required for parent themes' });
    } else {
      const missing = PARENT_TOKEN_KEYS.filter((k) => {
        const v = tokens[k];
        return typeof v !== 'string' || !v.trim();
      });
      if (missing.length) {
        issues.push({ level: 'error', message: `tokens.json missing: ${missing.join(', ')}` });
      }
    }
  }

  const files = listThemePackageFiles(root);
  if (files.length > 100) {
    issues.push({ level: 'error', message: `Too many files (${files.length}); max 100` });
  }

  for (const { rel } of files) {
    const ext = extOf(rel);
    if (BLOCKED_EXT.has(ext)) {
      issues.push({ level: 'error', message: `Blocked file type in package: ${rel}` });
    } else if (ext && !ALLOWED_EXT.has(ext)) {
      issues.push({ level: 'error', message: `Unsupported file type: ${rel}` });
    }
  }

  for (const { abs, rel } of files) {
    if (!rel.endsWith('.html')) continue;
    if (rel.startsWith('components/') || rel.startsWith('site/')) continue;
    const html = readFileSync(abs, 'utf8');
    if (/<script[\s>]/i.test(html)) {
      issues.push({ level: 'error', message: `HTML must not contain <script>: ${rel}` });
    }
  }

  const stylesheetPaths =
    manifest.stylesheets?.length
      ? manifest.stylesheets
      : existsSync(join(root, 'styles', 'theme.css'))
        ? ['styles/theme.css']
        : [];
  for (const sheet of stylesheetPaths) {
    if (!existsSync(join(root, sheet))) {
      issues.push({ level: 'error', message: `Missing stylesheet: ${sheet}` });
    }
  }

  if (manifest.scripts?.length) {
    for (const script of manifest.scripts) {
      const local = join(root, script);
      const viaDist =
        script === 'scripts/theme.js' && existsSync(join(root, 'dist', 'theme.js'));
      if (!existsSync(local) && !viaDist) {
        issues.push({ level: 'error', message: `Missing script: ${script}` });
      }
    }
  }

  if (manifest.chrome?.header && !existsSync(join(root, manifest.chrome.header))) {
    issues.push({ level: 'error', message: `Missing chrome header: ${manifest.chrome.header}` });
  }
  if (manifest.chrome?.footer && !existsSync(join(root, manifest.chrome.footer))) {
    issues.push({ level: 'error', message: `Missing chrome footer: ${manifest.chrome.footer}` });
  }

  const siteRel = manifest.site || (existsSync(join(root, 'site', 'structure.json')) ? 'site/structure.json' : undefined);
  if (siteRel) {
    const sitePath = join(root, siteRel);
    if (!existsSync(sitePath)) {
      issues.push({ level: 'error', message: `Missing site structure: ${siteRel}` });
    } else {
      try {
        const structure = JSON.parse(readFileSync(sitePath, 'utf8')) as {
          pages?: unknown[];
          navigation?: unknown[];
        };
        if (!Array.isArray(structure.pages) || !structure.pages.length) {
          issues.push({ level: 'error', message: 'site/structure.json must include pages[]' });
        }
      } catch {
        issues.push({ level: 'error', message: `${siteRel} is not valid JSON` });
      }
    }
  }

  if (manifest.components?.length) {
    for (const c of manifest.components) {
      const compDir = join(root, c.path);
      const compJson = join(compDir, 'component.json');
      if (!existsSync(compJson)) {
        issues.push({ level: 'error', message: `Missing component.json at ${c.path}` });
        continue;
      }
      try {
        const raw = JSON.parse(readFileSync(compJson, 'utf8'));
        const cParsed = PresenceComponentPackageManifestSchema.safeParse(raw);
        if (!cParsed.success) {
          issues.push({
            level: 'error',
            message: `${c.path}/component.json: ${cParsed.error.issues[0]?.message || 'invalid'}`,
          });
        }
      } catch {
        issues.push({ level: 'error', message: `${c.path}/component.json is not valid JSON` });
      }
    }
  } else if (existsSync(join(root, 'components'))) {
    for (const name of readdirSync(join(root, 'components'))) {
      const compJson = join(root, 'components', name, 'component.json');
      if (!existsSync(compJson)) continue;
      try {
        const raw = JSON.parse(readFileSync(compJson, 'utf8'));
        const cParsed = PresenceComponentPackageManifestSchema.safeParse(raw);
        if (!cParsed.success) {
          issues.push({
            level: 'warn',
            message: `components/${name}: ${cParsed.error.issues[0]?.message || 'invalid manifest'}`,
          });
        }
      } catch {
        issues.push({ level: 'error', message: `components/${name}/component.json is not valid JSON` });
      }
    }
  }

  const ok = !issues.some((i) => i.level === 'error');
  return {
    ok,
    issues,
    manifest: {
      key: manifest.key,
      name: manifest.name,
      version: manifest.version,
      parent: manifest.parent,
    },
  };
}

export function printValidateResult(result: ValidateResult): void {
  if (result.manifest) {
    console.log(`Theme: ${result.manifest.name} (${result.manifest.key} v${result.manifest.version})`);
  }
  for (const issue of result.issues) {
    const tag = issue.level === 'error' ? 'ERROR' : 'WARN';
    console.log(`${tag}: ${issue.message}`);
  }
  if (result.ok) {
    console.log(result.issues.length ? 'Validation passed with warnings.' : 'Validation passed.');
  } else {
    console.log('Validation failed.');
  }
}

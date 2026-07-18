import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PresenceComponentPackageManifestSchema } from '@wayrune/contracts';
import type { ValidateIssue, ValidateResult } from './types.js';

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

function walkPackDir(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules' || name === 'out' || name === 'src') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'dist') continue;
      walkPackDir(full, out);
    } else {
      out.push(full);
    }
  }
}

/** Files to include in a component ZIP (ZIP-layout root). */
export function listComponentPackageFiles(root: string): { abs: string; rel: string }[] {
  const files: string[] = [];
  const include = [
    'component.json',
    'index.html',
    'styles.css',
    'index.js',
    'preview.svg',
    'preview.png',
    'preview.jpg',
    'preview.webp',
    'README.md',
  ];
  for (const rel of include) {
    const full = join(root, rel);
    if (existsSync(full) && statSync(full).isFile()) files.push(full);
  }
  // Optional assets/
  const assets = join(root, 'assets');
  if (existsSync(assets) && statSync(assets).isDirectory()) {
    walkPackDir(assets, files);
  }

  // Map Vite build output if entry js missing at root
  const distIndex = join(root, 'dist', 'index.js');
  const hasIndexJs = files.some((f) => relative(root, f).replace(/\\/g, '/') === 'index.js');
  if (!hasIndexJs && existsSync(distIndex)) {
    files.push(distIndex);
  }

  const mapped: { abs: string; rel: string }[] = [];
  for (const abs of files) {
    let rel = relative(root, abs).replace(/\\/g, '/');
    if (rel === 'dist/index.js') rel = 'index.js';
    mapped.push({ abs, rel });
  }
  return mapped;
}

export function validateComponentDirectory(dir: string): ValidateResult {
  const issues: ValidateIssue[] = [];
  const root = dir;
  const manifestPath = join(root, 'component.json');

  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      issues: [{ level: 'error', message: 'component.json missing at package root' }],
    };
  }

  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return { ok: false, issues: [{ level: 'error', message: 'component.json is not valid JSON' }] };
  }

  const parsed = PresenceComponentPackageManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        level: 'error',
        message: `component.json: ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      });
    }
    return { ok: false, issues };
  }
  const manifest = parsed.data;

  const files = listComponentPackageFiles(root);
  const byRel = new Map(files.map((f) => [f.rel, f]));

  if (files.length > 100) {
    issues.push({ level: 'error', message: `Too many files (${files.length}); max 100` });
  }

  for (const { rel } of files) {
    const ext = extOf(rel);
    if (BLOCKED_EXT.has(ext)) {
      issues.push({ level: 'error', message: `Blocked file type: ${rel}` });
    } else if (ext && !ALLOWED_EXT.has(ext)) {
      issues.push({ level: 'error', message: `Unsupported file type: ${rel}` });
    }
  }

  const entry = manifest.entry || {};
  const htmlPath = entry.html || (byRel.has('index.html') ? 'index.html' : null);
  const cssPaths = entry.css?.length ? entry.css : byRel.has('styles.css') ? ['styles.css'] : [];
  const jsPaths = entry.js?.length ? entry.js : byRel.has('index.js') ? ['index.js'] : [];

  const missing: string[] = [];
  if (htmlPath && !byRel.has(htmlPath)) missing.push(htmlPath);
  for (const p of cssPaths) if (!byRel.has(p)) missing.push(p);
  for (const p of jsPaths) if (!byRel.has(p)) missing.push(p);

  if (!htmlPath && !cssPaths.length && !jsPaths.length) {
    issues.push({
      level: 'error',
      message: 'Need at least index.html, styles.css, or index.js (or declare entry.*)',
    });
  } else if (missing.length) {
    issues.push({ level: 'error', message: `Missing entry files: ${missing.join(', ')}` });
  }

  if (htmlPath && byRel.has(htmlPath)) {
    const html = readFileSync(byRel.get(htmlPath)!.abs, 'utf8');
    if (/<script[\s>]/i.test(html)) {
      issues.push({ level: 'error', message: `HTML must not contain <script>: ${htmlPath}` });
    }
  }

  if (jsPaths.length) {
    let hasMount = false;
    for (const p of jsPaths) {
      const file = byRel.get(p);
      if (!file) continue;
      const js = readFileSync(file.abs, 'utf8');
      if (/PresenceMount|PresenceComponent/.test(js)) {
        hasMount = true;
        break;
      }
    }
    if (!hasMount) {
      issues.push({
        level: 'error',
        message: 'JS must expose PresenceMount or PresenceComponent.mount',
      });
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
    },
  };
}

export function printComponentValidateResult(result: ValidateResult): void {
  if (result.manifest) {
    console.log(
      `Component: ${result.manifest.name} (${result.manifest.key} v${result.manifest.version})`,
    );
  }
  for (const issue of result.issues) {
    console.log(`${issue.level === 'error' ? 'ERROR' : 'WARN'}: ${issue.message}`);
  }
  if (result.ok) {
    console.log(result.issues.length ? 'Validation passed with warnings.' : 'Validation passed.');
  } else {
    console.log('Validation failed.');
  }
}

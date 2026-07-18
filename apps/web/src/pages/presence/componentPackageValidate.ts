import JSZip from 'jszip';
import { PresenceComponentPackageManifestSchema } from '@wayrune/contracts';

const MAX_UNCOMPRESSED_BYTES = 5 * 1024 * 1024;
const MAX_FILE_COUNT = 100;
const MAX_ZIP_BYTES = 5 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
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

const BLOCKED_EXTENSIONS = new Set(['.ts', '.tsx', '.jsx', '.zip', '.cjs']);

export type ComponentPackageCriterionId =
  | 'zip_file'
  | 'size_limit'
  | 'component_json'
  | 'manifest_valid'
  | 'entry_files'
  | 'mount_contract'
  | 'file_types'
  | 'file_count'
  | 'html_safe';

export type ComponentPackageCriterion = {
  id: ComponentPackageCriterionId;
  label: string;
  detail?: string;
  status: 'pending' | 'pass' | 'fail' | 'skip';
};

export type ComponentPackageValidationResult = {
  ok: boolean;
  criteria: ComponentPackageCriterion[];
  manifest?: { key: string; name: string; version: string; category: string };
};

function extOf(path: string): string {
  const i = path.lastIndexOf('.');
  return i >= 0 ? path.slice(i).toLowerCase() : '';
}

function normalizeZipPath(raw: string): string | null {
  const cleaned = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleaned || cleaned.endsWith('/')) return null;
  if (cleaned.includes('..') || cleaned.includes('\0')) return null;
  if (cleaned.startsWith('__MACOSX/') || cleaned.split('/').some((p) => p.startsWith('.'))) {
    return null;
  }
  return cleaned;
}

function setStatus(
  criteria: ComponentPackageCriterion[],
  id: ComponentPackageCriterionId,
  status: ComponentPackageCriterion['status'],
  detail?: string,
) {
  const row = criteria.find((c) => c.id === id);
  if (!row) return;
  row.status = status;
  if (detail !== undefined) row.detail = detail;
}

export function componentPackageCriteriaTemplate(): ComponentPackageCriterion[] {
  return [
    { id: 'zip_file', label: 'File is a .zip package', status: 'pending' },
    { id: 'size_limit', label: 'Under 5 MB uncompressed / zip size', status: 'pending' },
    { id: 'component_json', label: 'Contains component.json at package root', status: 'pending' },
    {
      id: 'manifest_valid',
      label: 'component.json has key, name, version (slug key)',
      status: 'pending',
    },
    {
      id: 'entry_files',
      label: 'Declared entry HTML/CSS/JS files exist',
      status: 'pending',
      detail: 'Defaults: index.html, styles.css, index.js',
    },
    {
      id: 'mount_contract',
      label: 'JS exposes PresenceMount or PresenceComponent.mount',
      status: 'pending',
      detail: 'Required when the package includes JS',
    },
    { id: 'file_types', label: 'Only allowed built files (no .tsx / nested zip)', status: 'pending' },
    { id: 'file_count', label: 'At most 100 files', status: 'pending' },
    { id: 'html_safe', label: 'HTML has no <script> tags', status: 'pending' },
  ];
}

export async function validateComponentPackageZip(
  file: File,
): Promise<ComponentPackageValidationResult> {
  const criteria = componentPackageCriteriaTemplate();

  const isZipName = /\.zip$/i.test(file.name) || file.type.includes('zip');
  setStatus(
    criteria,
    'zip_file',
    isZipName ? 'pass' : 'fail',
    isZipName ? file.name : 'Choose a .zip file',
  );
  if (!isZipName) return { ok: false, criteria };

  if (file.size > MAX_ZIP_BYTES) {
    setStatus(criteria, 'size_limit', 'fail', `${(file.size / 1024 / 1024).toFixed(1)} MB zip exceeds 5 MB`);
    return { ok: false, criteria };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    setStatus(criteria, 'zip_file', 'fail', 'Could not read ZIP archive');
    return { ok: false, criteria };
  }

  const rawEntries: { path: string; buffer: Uint8Array }[] = [];
  let total = 0;
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;
    const path = normalizeZipPath(name);
    if (!path) continue;
    const data = await entry.async('uint8array');
    total += data.length;
    if (total > MAX_UNCOMPRESSED_BYTES) {
      setStatus(criteria, 'size_limit', 'fail', 'Uncompressed contents exceed 5 MB');
      return { ok: false, criteria };
    }
    rawEntries.push({ path, buffer: data });
  }

  setStatus(
    criteria,
    'size_limit',
    'pass',
    `${(file.size / 1024).toFixed(0)} KB zip · ${(total / 1024).toFixed(0)} KB uncompressed`,
  );

  if (!rawEntries.length) {
    setStatus(criteria, 'component_json', 'fail', 'ZIP is empty');
    return { ok: false, criteria };
  }

  const tops = new Set(rawEntries.map((e) => e.path.split('/')[0]));
  let stripPrefix = '';
  if (tops.size === 1) {
    const only = [...tops][0];
    const hasAtRoot = rawEntries.some((e) => e.path === 'component.json');
    if (!hasAtRoot && only && rawEntries.every((e) => e.path.startsWith(`${only}/`))) {
      stripPrefix = `${only}/`;
    }
  }

  const filesByPath = new Map<string, Uint8Array>();
  for (const entry of rawEntries) {
    const path = stripPrefix ? entry.path.slice(stripPrefix.length) : entry.path;
    filesByPath.set(path, entry.buffer);
  }

  setStatus(
    criteria,
    'file_count',
    filesByPath.size <= MAX_FILE_COUNT ? 'pass' : 'fail',
    `${filesByPath.size} files`,
  );

  let blocked = '';
  let badExt = '';
  for (const path of filesByPath.keys()) {
    const ext = extOf(path);
    if (BLOCKED_EXTENSIONS.has(ext)) {
      blocked = path;
      break;
    }
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      badExt = path;
      break;
    }
  }
  if (blocked) setStatus(criteria, 'file_types', 'fail', `Blocked: ${blocked}`);
  else if (badExt) setStatus(criteria, 'file_types', 'fail', `Unsupported: ${badExt}`);
  else setStatus(criteria, 'file_types', 'pass');

  const componentJsonBuf = filesByPath.get('component.json');
  if (!componentJsonBuf) {
    setStatus(criteria, 'component_json', 'fail', 'component.json missing at package root');
    return { ok: false, criteria };
  }
  setStatus(criteria, 'component_json', 'pass');

  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(new TextDecoder().decode(componentJsonBuf));
  } catch {
    setStatus(criteria, 'manifest_valid', 'fail', 'component.json is not valid JSON');
    return { ok: false, criteria };
  }

  const parsed = PresenceComponentPackageManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    setStatus(
      criteria,
      'manifest_valid',
      'fail',
      parsed.error.issues.map((i) => i.message).join('; '),
    );
    return { ok: false, criteria };
  }
  const manifest = parsed.data;
  setStatus(
    criteria,
    'manifest_valid',
    'pass',
    `${manifest.key} · v${manifest.version} · ${manifest.category}`,
  );

  const entry = manifest.entry || {};
  const htmlPath = entry.html || (filesByPath.has('index.html') ? 'index.html' : null);
  const cssPaths = entry.css?.length
    ? entry.css
    : filesByPath.has('styles.css')
      ? ['styles.css']
      : [];
  const jsPaths = entry.js?.length
    ? entry.js
    : filesByPath.has('index.js')
      ? ['index.js']
      : [];

  const missing: string[] = [];
  if (htmlPath && !filesByPath.has(htmlPath)) missing.push(htmlPath);
  for (const p of cssPaths) if (!filesByPath.has(p)) missing.push(p);
  for (const p of jsPaths) if (!filesByPath.has(p)) missing.push(p);

  if (!htmlPath && !cssPaths.length && !jsPaths.length) {
    setStatus(criteria, 'entry_files', 'fail', 'Need at least index.html, styles.css, or index.js');
  } else if (missing.length) {
    setStatus(criteria, 'entry_files', 'fail', `Missing: ${missing.join(', ')}`);
  } else {
    const parts = [
      htmlPath ? `html:${htmlPath}` : null,
      cssPaths.length ? `css:${cssPaths.join(',')}` : null,
      jsPaths.length ? `js:${jsPaths.join(',')}` : null,
    ].filter(Boolean);
    setStatus(criteria, 'entry_files', 'pass', parts.join(' · '));
  }

  if (!jsPaths.length) {
    setStatus(criteria, 'mount_contract', 'skip', 'No JS entry (static HTML/CSS only)');
  } else {
    let foundMount = false;
    for (const path of jsPaths) {
      const buf = filesByPath.get(path);
      if (!buf) continue;
      const src = new TextDecoder().decode(buf);
      if (
        /PresenceMount\s*=/.test(src) ||
        /PresenceComponent\s*=/.test(src) ||
        /\.mount\s*=/.test(src) ||
        /definePresenceComponent\s*\(/.test(src)
      ) {
        foundMount = true;
        break;
      }
    }
    setStatus(
      criteria,
      'mount_contract',
      foundMount ? 'pass' : 'fail',
      foundMount
        ? 'Mount export detected'
        : 'JS must set window.PresenceMount or PresenceComponent.mount',
    );
  }

  let htmlFail = '';
  for (const [path, buf] of filesByPath) {
    if (extOf(path) !== '.html') continue;
    const html = new TextDecoder().decode(buf);
    if (/<script[\s>]/i.test(html)) {
      htmlFail = path;
      break;
    }
  }
  if (htmlFail) {
    setStatus(criteria, 'html_safe', 'fail', `Script in ${htmlFail}`);
  } else {
    const htmlCount = [...filesByPath.keys()].filter((p) => extOf(p) === '.html').length;
    setStatus(
      criteria,
      'html_safe',
      'pass',
      htmlCount ? `${htmlCount} HTML file(s) OK` : 'No HTML in package',
    );
  }

  const ok = criteria.every((c) => c.status === 'pass' || c.status === 'skip');
  return {
    ok,
    criteria,
    manifest: {
      key: manifest.key,
      name: manifest.name,
      version: manifest.version,
      category: manifest.category,
    },
  };
}

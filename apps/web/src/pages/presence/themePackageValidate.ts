import JSZip from 'jszip';
import { PresenceThemePackageManifestSchema } from '@wayrune/contracts';

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

const PARENT_TOKEN_KEYS = [
  'primary',
  'accent',
  'background',
  'foreground',
  'muted',
  'fontDisplay',
  'fontBody',
] as const;

export type ThemePackageCriterionId =
  | 'zip_file'
  | 'size_limit'
  | 'theme_json'
  | 'manifest_valid'
  | 'tokens'
  | 'file_types'
  | 'file_count'
  | 'html_safe'
  | 'stylesheets';

export type ThemePackageCriterion = {
  id: ThemePackageCriterionId;
  label: string;
  detail?: string;
  status: 'pending' | 'pass' | 'fail' | 'skip';
};

export type ThemePackageValidationResult = {
  ok: boolean;
  criteria: ThemePackageCriterion[];
  manifest?: { key: string; name: string; version: string; parent?: string };
};

function extOf(path: string): string {
  const i = path.lastIndexOf('.');
  return i >= 0 ? path.slice(i).toLowerCase() : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
  criteria: ThemePackageCriterion[],
  id: ThemePackageCriterionId,
  status: ThemePackageCriterion['status'],
  detail?: string,
) {
  const row = criteria.find((c) => c.id === id);
  if (!row) return;
  row.status = status;
  if (detail !== undefined) row.detail = detail;
}

/** Static checklist shown before a file is chosen. */
export function themePackageCriteriaTemplate(): ThemePackageCriterion[] {
  return [
    { id: 'zip_file', label: 'File is a .zip package', status: 'pending' },
    { id: 'size_limit', label: 'Under 5 MB uncompressed / zip size', status: 'pending' },
    { id: 'theme_json', label: 'Contains theme.json at package root', status: 'pending' },
    {
      id: 'manifest_valid',
      label: 'theme.json has key, name, and version (slug key)',
      status: 'pending',
    },
    {
      id: 'tokens',
      label: 'tokens.json present (or child with parent key)',
      status: 'pending',
      detail: 'Parent themes need primary, accent, background, foreground, muted, fonts',
    },
    { id: 'file_types', label: 'Only allowed built files (no .tsx / nested zip)', status: 'pending' },
    { id: 'file_count', label: 'At most 100 files', status: 'pending' },
    { id: 'html_safe', label: 'HTML has no <script> tags', status: 'pending' },
    { id: 'stylesheets', label: 'Declared stylesheets exist in the ZIP', status: 'pending' },
  ];
}

/**
 * Client-side validation mirroring server package rules.
 * Call before upload so users see criteria match results.
 */
export async function validateThemePackageZip(file: File): Promise<ThemePackageValidationResult> {
  const criteria = themePackageCriteriaTemplate();

  const isZipName = /\.zip$/i.test(file.name) || file.type.includes('zip');
  setStatus(
    criteria,
    'zip_file',
    isZipName ? 'pass' : 'fail',
    isZipName ? file.name : 'Choose a .zip file',
  );
  if (!isZipName) {
    return { ok: false, criteria };
  }

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
    setStatus(criteria, 'theme_json', 'fail', 'ZIP is empty');
    return { ok: false, criteria };
  }

  const tops = new Set(rawEntries.map((e) => e.path.split('/')[0]));
  let stripPrefix = '';
  if (tops.size === 1) {
    const only = [...tops][0];
    const hasThemeAtRoot = rawEntries.some((e) => e.path === 'theme.json');
    if (!hasThemeAtRoot && only && rawEntries.every((e) => e.path.startsWith(`${only}/`))) {
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
  if (blocked) {
    setStatus(criteria, 'file_types', 'fail', `Blocked: ${blocked}`);
  } else if (badExt) {
    setStatus(criteria, 'file_types', 'fail', `Unsupported: ${badExt}`);
  } else {
    setStatus(criteria, 'file_types', 'pass');
  }

  const themeJsonBuf = filesByPath.get('theme.json');
  if (!themeJsonBuf) {
    setStatus(criteria, 'theme_json', 'fail', 'theme.json missing at package root');
    return { ok: false, criteria };
  }
  setStatus(criteria, 'theme_json', 'pass');

  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(new TextDecoder().decode(themeJsonBuf));
  } catch {
    setStatus(criteria, 'manifest_valid', 'fail', 'theme.json is not valid JSON');
    return { ok: false, criteria };
  }

  const parsed = PresenceThemePackageManifestSchema.safeParse(manifestRaw);
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
  if (manifest.parent && manifest.parent === manifest.key) {
    setStatus(criteria, 'manifest_valid', 'fail', 'Theme cannot be its own parent');
    return { ok: false, criteria };
  }
  setStatus(criteria, 'manifest_valid', 'pass', `${manifest.key} · v${manifest.version}`);

  const tokensBuf = filesByPath.get('tokens.json');
  let tokens: Record<string, unknown> = {};
  if (tokensBuf) {
    try {
      tokens = asRecord(JSON.parse(new TextDecoder().decode(tokensBuf)));
    } catch {
      setStatus(criteria, 'tokens', 'fail', 'tokens.json is not valid JSON');
      return { ok: false, criteria };
    }
  }

  if (!manifest.parent) {
    if (!tokensBuf) {
      setStatus(criteria, 'tokens', 'fail', 'tokens.json required for parent themes');
    } else {
      const missing = PARENT_TOKEN_KEYS.filter((k) => {
        const v = tokens[k];
        return typeof v !== 'string' || !v.trim();
      });
      if (missing.length) {
        setStatus(criteria, 'tokens', 'fail', `Missing: ${missing.join(', ')}`);
      } else {
        setStatus(criteria, 'tokens', 'pass', 'Parent tokens complete');
      }
    }
  } else {
    setStatus(
      criteria,
      'tokens',
      'pass',
      tokensBuf ? 'Child overrides (partial OK)' : `Inherits from parent “${manifest.parent}”`,
    );
  }

  let htmlFail = '';
  for (const [path, buf] of filesByPath) {
    if (path.startsWith('components/') || path.startsWith('site/')) continue;
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

  const stylesheetPaths =
    manifest.stylesheets?.length
      ? manifest.stylesheets
      : filesByPath.has('styles/theme.css')
        ? ['styles/theme.css']
        : [];
  const missingSheets = stylesheetPaths.filter((p) => !filesByPath.has(p));
  if (missingSheets.length) {
    setStatus(criteria, 'stylesheets', 'fail', `Missing: ${missingSheets.join(', ')}`);
  } else if (!stylesheetPaths.length) {
    setStatus(criteria, 'stylesheets', 'skip', 'No stylesheets declared (optional)');
  } else {
    setStatus(criteria, 'stylesheets', 'pass', stylesheetPaths.join(', '));
  }

  const ok = criteria.every((c) => c.status === 'pass' || c.status === 'skip');
  return {
    ok,
    criteria,
    manifest: {
      key: manifest.key,
      name: manifest.name,
      version: manifest.version,
      parent: manifest.parent,
    },
  };
}

import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { resolveAccount } from './auth.js';
import { apiUrl, loadProjectConfig } from './config.js';
import { detectPackageKind, resolvePackageRoot, type PackageKind } from './detect.js';
import { packComponentDirectory } from './pack-component.js';
import { packThemeDirectory } from './pack.js';
import {
  printComponentValidateResult,
  validateComponentDirectory,
} from './validate-component.js';
import { printValidateResult, validateThemeDirectory } from './validate.js';

export type DeployOptions = {
  dir: string;
  account?: string;
  apiBase?: string;
  siteName?: string;
  confirmReplace?: boolean;
  onConflict?: 'overwrite' | 'suffix';
  dryRun?: boolean;
  skipValidate?: boolean;
  type?: PackageKind | string;
};

export async function deployPackageDirectory(opts: DeployOptions): Promise<void> {
  const kind = detectPackageKind(opts.dir, opts.type);
  const root = resolvePackageRoot(opts.dir, kind);
  const project = loadProjectConfig(resolve(opts.dir));

  if (!opts.skipValidate) {
    if (kind === 'theme') {
      const result = validateThemeDirectory(root);
      printValidateResult(result);
      if (!result.ok) throw new Error('Validation failed — fix errors before deploy');
    } else {
      const result = validateComponentDirectory(root);
      printComponentValidateResult(result);
      if (!result.ok) throw new Error('Validation failed — fix errors before deploy');
    }
  }

  const packed =
    kind === 'theme'
      ? await packThemeDirectory({ dir: root, skipValidate: true })
      : await packComponentDirectory({ dir: root, skipValidate: true });

  console.log(`Packed ${(packed.bytes / 1024).toFixed(0)} KB → ${packed.outPath}`);
  console.log(`Kind: ${kind}`);

  let account;
  try {
    account = resolveAccount({
      account: opts.account || project.account,
      apiBase: opts.apiBase || project.apiBase,
    });
  } catch (err) {
    if (opts.dryRun) {
      console.log(err instanceof Error ? err.message : err);
      console.log('Dry run — skipping upload (no account).');
      return;
    }
    throw err;
  }

  const siteName = opts.siteName || project.siteName;
  const confirmReplace = opts.confirmReplace ?? project.confirmReplace ?? false;
  const onConflict = opts.onConflict || project.onConflict || 'overwrite';

  console.log(`Target org: ${account.organizationName} (${account.organizationId})`);
  console.log(`API: ${account.apiBase}`);
  if (kind === 'theme') {
    if (siteName) console.log(`Site name: ${siteName}`);
    if (confirmReplace) console.log('confirmReplace: true');
  }

  if (opts.dryRun) {
    console.log('Dry run — skipping upload.');
    return;
  }

  const zipBuf = readFileSync(packed.outPath);
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(zipBuf)], { type: 'application/zip' }),
    basename(packed.outPath),
  );

  const endpoint =
    kind === 'theme'
      ? '/presence/themes/upload-package'
      : '/presence/modules/upload-package';

  if (kind === 'theme') {
    if (siteName) form.append('siteName', siteName);
    if (confirmReplace) form.append('confirmReplace', 'true');
    if (onConflict) form.append('onConflict', onConflict);
  }

  const res = await fetch(apiUrl(account.apiBase, endpoint), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      Accept: 'application/json',
    },
    body: form,
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401) {
    throw new Error('Unauthorized (401). Run: wr auth login');
  }
  if (!res.ok) {
    const msg =
      typeof body.message === 'string'
        ? body.message
        : Array.isArray(body.message)
          ? body.message.join('; ')
          : `Upload failed (${res.status})`;
    throw new Error(msg);
  }

  console.log('Deploy succeeded.');
  if (kind === 'theme') {
    if (body.theme && typeof body.theme === 'object') {
      const theme = body.theme as { id?: string; key?: string; name?: string };
      console.log(`Theme: ${theme.name || theme.key || theme.id}`);
    }
    if (body.site && typeof body.site === 'object') {
      const site = body.site as { id?: string; name?: string };
      console.log(`Site: ${site.name || site.id}`);
    }
  } else {
    const mod = (body.module || body.component || body) as {
      id?: string;
      key?: string;
      name?: string;
    };
    if (mod.key || mod.name || mod.id) {
      console.log(`Component: ${mod.name || mod.key || mod.id}`);
    }
  }
}

/** @deprecated use deployPackageDirectory */
export async function deployThemeDirectory(opts: DeployOptions): Promise<void> {
  return deployPackageDirectory({ ...opts, type: opts.type || 'theme' });
}

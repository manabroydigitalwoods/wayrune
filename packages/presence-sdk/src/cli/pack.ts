import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { listThemePackageFiles, validateThemeDirectory } from './validate.js';

export type PackOptions = {
  dir: string;
  out?: string;
  skipValidate?: boolean;
};

export async function packThemeDirectory(opts: PackOptions): Promise<{ outPath: string; bytes: number }> {
  const root = resolve(opts.dir);
  if (!existsSync(join(root, 'theme.json'))) {
    throw new Error(`No theme.json in ${root}`);
  }

  if (!opts.skipValidate) {
    const result = validateThemeDirectory(root);
    if (!result.ok) {
      for (const issue of result.issues.filter((i) => i.level === 'error')) {
        console.error(`ERROR: ${issue.message}`);
      }
      throw new Error('Validation failed — fix errors before packing');
    }
  }

  const files = listThemePackageFiles(root);
  if (!files.length) throw new Error('No package files found to pack');

  const zip = new JSZip();
  let total = 0;
  for (const { abs, rel } of files) {
    const buf = readFileSync(abs);
    total += buf.length;
    zip.file(rel, buf);
  }

  if (total > 5 * 1024 * 1024) {
    throw new Error(`Uncompressed package exceeds 5 MB (${(total / 1024 / 1024).toFixed(1)} MB)`);
  }

  let manifestKey = 'theme';
  try {
    const m = JSON.parse(readFileSync(join(root, 'theme.json'), 'utf8')) as { key?: string };
    if (m.key) manifestKey = m.key;
  } catch {
    /* ignore */
  }

  const outPath = resolve(
    opts.out || join(root, 'out', `${manifestKey.replace(/[^a-z0-9-_]/gi, '_')}.zip`),
  );
  mkdirSync(dirname(outPath), { recursive: true });
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error(`ZIP exceeds 5 MB (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
  }
  writeFileSync(outPath, buffer);
  return { outPath, bytes: buffer.length };
}

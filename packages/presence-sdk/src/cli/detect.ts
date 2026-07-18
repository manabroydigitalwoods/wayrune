import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type PackageKind = 'theme' | 'component';

function hasThemeManifest(dir: string): boolean {
  return (
    existsSync(join(dir, 'theme.json')) ||
    existsSync(join(dir, 'site', 'theme.json'))
  );
}

function hasComponentManifest(dir: string): boolean {
  return (
    existsSync(join(dir, 'component.json')) ||
    existsSync(join(dir, 'component', 'component.json'))
  );
}

/** Detect theme vs component from manifests (root, site/, component/, or dist/). */
export function detectPackageKind(
  dir: string,
  override?: PackageKind | string,
): PackageKind {
  if (override === 'theme' || override === 'component') return override;
  if (override) {
    throw new Error(`Invalid --type ${override}. Use theme or component.`);
  }

  const root = resolve(dir);
  const dist = join(root, 'dist');

  const themeHere = hasThemeManifest(root) || hasThemeManifest(dist);
  const componentHere = hasComponentManifest(root) || hasComponentManifest(dist);

  if (themeHere && componentHere) {
    throw new Error(
      'Ambiguous package: found both theme and component manifests. Pass --type theme|component.',
    );
  }
  if (themeHere) return 'theme';
  if (componentHere) return 'component';
  throw new Error(
    `No theme.json or component.json in ${root} (or site/, component/, dist/).`,
  );
}

/**
 * Resolve directory that contains the ZIP-layout manifest (theme.json / component.json).
 * Prefers `dir`, then `dir/dist`.
 */
export function resolvePackageRoot(dir: string, kind: PackageKind): string {
  const root = resolve(dir);
  const dist = join(root, 'dist');

  if (kind === 'theme') {
    if (existsSync(join(root, 'theme.json'))) return root;
    if (existsSync(join(dist, 'theme.json'))) return dist;
    throw new Error(
      `No theme.json in ${root} or ${dist}. Run pnpm build first (site/ → dist/).`,
    );
  }

  if (existsSync(join(root, 'component.json'))) return root;
  if (existsSync(join(dist, 'component.json'))) return dist;
  throw new Error(
    `No component.json in ${root} or ${dist}. Run pnpm build first (component/ → dist/).`,
  );
}

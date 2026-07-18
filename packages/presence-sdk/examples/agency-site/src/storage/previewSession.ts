import { storageKeys } from './keys';
import { storageGet, storageGetJson, storageRemove, storageSet, storageSetJson } from './localStorage';

export type PreviewPrefs = {
  /** Persist last visited path across reloads. */
  rememberPath: boolean;
};

const defaultPrefs: PreviewPrefs = {
  rememberPath: true,
};

export function getPreviewPrefs(): PreviewPrefs {
  return { ...defaultPrefs, ...storageGetJson<Partial<PreviewPrefs>>(storageKeys.prefs) };
}

export function setPreviewPrefs(patch: Partial<PreviewPrefs>): PreviewPrefs {
  const next = { ...getPreviewPrefs(), ...patch };
  storageSetJson(storageKeys.prefs, next);
  return next;
}

export function getLastPath(): string | null {
  return storageGet(storageKeys.lastPath);
}

export function setLastPath(path: string): void {
  if (!getPreviewPrefs().rememberPath) return;
  storageSet(storageKeys.lastPath, path);
}

export function isBannerDismissed(): boolean {
  return storageGet(storageKeys.bannerDismissed) === '1';
}

export function dismissBanner(): void {
  storageSet(storageKeys.bannerDismissed, '1');
}

export function resetBanner(): void {
  storageRemove(storageKeys.bannerDismissed);
}

/** Central localStorage key registry for the local preview app. */
export const storageKeys = {
  lastPath: 'presence.agency-site.lastPath',
  bannerDismissed: 'presence.agency-site.bannerDismissed',
  prefs: 'presence.agency-site.prefs',
} as const;

export type StorageKey = (typeof storageKeys)[keyof typeof storageKeys];

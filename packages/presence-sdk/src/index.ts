/**
 * Local author helpers for Presence component packages.
 * Used at build time only — not loaded by the ERP runtime.
 *
 * CLI (validate / pack / deploy): `presence` bin or `@wayrune/presence-sdk/cli`.
 */

export {
  validateThemeDirectory,
  packThemeDirectory,
  deployThemeDirectory,
  deployPackageDirectory,
  validateComponentDirectory,
  packComponentDirectory,
  listThemePackageFiles,
  listComponentPackageFiles,
  detectPackageKind,
  resolvePackageRoot,
} from './cli/index.js';

export type PresenceTokens = {
  primary?: string;
  accent?: string;
  background?: string;
  foreground?: string;
  muted?: string;
  surface?: string;
  [key: string]: unknown;
};

export type PresenceMountContext = {
  tokens?: PresenceTokens;
  api?: string | null;
};

export type PresenceMountFn = (
  el: HTMLElement,
  props: Record<string, unknown>,
  ctx: PresenceMountContext,
) => void | (() => void);

declare global {
  interface Window {
    PresenceMount?: PresenceMountFn;
    PresenceComponent?: {
      mount: PresenceMountFn;
      unmount?: (el: HTMLElement) => void;
    };
  }
}

/** Register a mount function for Presence package iframes. */
export function definePresenceComponent(mount: PresenceMountFn, unmount?: (el: HTMLElement) => void) {
  if (typeof window === 'undefined') return;
  window.PresenceMount = mount;
  window.PresenceComponent = { mount, unmount };
}

/** Apply theme tokens as CSS variables on an element. */
export function applyPresenceTokens(el: HTMLElement, tokens: PresenceTokens | undefined) {
  if (!tokens) return;
  const map: Record<string, string> = {
    primary: '--primary',
    accent: '--accent',
    background: '--bg',
    foreground: '--fg',
    muted: '--muted',
    surface: '--surface',
  };
  for (const [key, cssVar] of Object.entries(map)) {
    const value = tokens[key];
    if (typeof value === 'string' && value) el.style.setProperty(cssVar, value);
  }
}

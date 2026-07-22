import { localStorageKit, StorageKeys } from '@wayrune/ui';
import {
  canPinLeadsView,
  leadsPinLabel,
  type LeadsQueryState,
} from './leadsQueryState';

/** Max deep-link pins in the sidebar (Queue Standard). */
export const MAX_NAV_DEEP_PINS = 7;

export type NavDeepPin = {
  id: string;
  label: string;
  /** App-relative path + query, e.g. `/leads?owner=me&followUp=overdue`. */
  to: string;
};

export function readNavDeepPins(): NavDeepPin[] {
  const stored = localStorageKit.getJson<NavDeepPin[]>(StorageKeys.ui.navDeepPins, {
    version: 1,
  });
  if (!Array.isArray(stored)) return [];
  return stored
    .filter(
      (p): p is NavDeepPin =>
        Boolean(
          p && typeof p.id === 'string' && typeof p.label === 'string' && typeof p.to === 'string',
        ),
    )
    .slice(0, MAX_NAV_DEEP_PINS);
}

export function writeNavDeepPins(pins: NavDeepPin[]) {
  localStorageKit.setJson(StorageKeys.ui.navDeepPins, pins.slice(0, MAX_NAV_DEEP_PINS), {
    version: 1,
  });
  window.dispatchEvent(new Event('wayrune:nav-deep-pins'));
}

export function pinDeepLink(pin: NavDeepPin) {
  const current = readNavDeepPins().filter((p) => p.id !== pin.id && p.to !== pin.to);
  writeNavDeepPins([{ ...pin }, ...current].slice(0, MAX_NAV_DEEP_PINS));
}

export function unpinDeepLink(id: string) {
  writeNavDeepPins(readNavDeepPins().filter((p) => p.id !== id));
}

export function pinLeadsView(state: LeadsQueryState, href: string) {
  if (!canPinLeadsView(state)) return;
  let to = href;
  try {
    if (href.startsWith('http')) {
      const u = new URL(href);
      to = `${u.pathname}${u.search}`;
    }
  } catch {
    /* keep href */
  }
  if (!to.startsWith('/')) to = `/${to}`;
  pinDeepLink({
    id: `leads:${to}`,
    label: leadsPinLabel(state),
    to,
  });
}

import type { ReactNode } from 'react';
import { Combobox } from '@wayrune/ui';
import { stayTabLabel } from '../../lib/orgKind';

export const STAY_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'properties', label: 'Properties' },
  { id: 'rooms', label: 'Rooms & inventory' },
  { id: 'front_desk', label: 'Front desk' },
  { id: 'reservations', label: 'Reservations' },
  { id: 'housekeeping', label: 'Housekeeping' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'rates', label: 'Rates' },
  { id: 'experiences', label: 'Experiences' },
  { id: 'qr_locations', label: 'QR Locations' },
  { id: 'guest_menu', label: 'Menu' },
  { id: 'live_tickets', label: 'Live tickets' },
  { id: 'companion_settings', label: 'Companion' },
  { id: 'care', label: 'Care' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'profile', label: 'Profile' },
] as const;

export type StayTabId = (typeof STAY_TABS)[number]['id'];

export function stayTabMeta(tab: StayTabId, orgKind?: string | null) {
  const base = STAY_TABS.find((t) => t.id === tab) || STAY_TABS[0];
  const label = stayTabLabel(orgKind, tab) ?? base.label;
  return { ...base, label };
}

export function filteredStayTabs(orgKind?: string | null, visibleTabIds?: string[]) {
  const allowed =
    visibleTabIds ??
    (orgKind
      ? STAY_TABS.filter((t) => t.id !== 'experiences' || orgKind === 'farmstay').map((t) => t.id)
      : STAY_TABS.map((t) => t.id));
  return STAY_TABS.filter((t) => allowed.includes(t.id)).map((t) => ({
    ...t,
    label: stayTabLabel(orgKind, t.id) ?? t.label,
  }));
}

/** Content chrome for stay screens — primary nav lives in the app sidebar. */
export function StayPortalLayout({
  children,
  propertySwitcher,
  orgKind,
  visibleTabIds,
}: {
  children: ReactNode;
  propertySwitcher?: ReactNode;
  orgKind?: string | null;
  visibleTabIds?: string[];
}) {
  const tabs = filteredStayTabs(orgKind, visibleTabIds);

  return (
    <div className="space-y-4">
      {propertySwitcher ? (
        <div className="flex flex-wrap items-center justify-end gap-3">{propertySwitcher}</div>
      ) : null}
      {tabs.length < STAY_TABS.length ? (
        <p className="sr-only">
          Showing {tabs.length} of {STAY_TABS.length} stay sections for this organization kind.
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function StayPropertySwitcher({
  assets,
  selectedId,
  onChange,
}: {
  assets: Array<{ id: string; name: string }>;
  selectedId: string | null;
  onChange: (id: string) => void;
}) {
  if (!assets.length) return null;
  return (
    <div className="flex min-w-[12rem] flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Property</span>
      <Combobox
        className="min-w-[12rem]"
        options={assets.map((a) => ({ value: a.id, label: a.name }))}
        value={selectedId || undefined}
        onChange={onChange}
        placeholder="Select property"
        searchable={assets.length > 6}
      />
    </div>
  );
}

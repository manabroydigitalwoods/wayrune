import type { ReactNode } from 'react';

export const MOBILITY_TABS = [
  { id: 'fleet', label: 'Fleet' },
  { id: 'rates', label: 'Rates' },
  { id: 'book', label: 'Book' },
  { id: 'ops', label: 'Checkout' },
  { id: 'bill', label: 'Bill' },
  { id: 'care', label: 'Care' },
  { id: 'profile', label: 'Profile' },
  { id: 'inbound', label: 'Inbound' },
] as const;

export type MobilityTabId = (typeof MOBILITY_TABS)[number]['id'];

/** Content chrome — primary nav lives in the app sidebar. */
export function MobilityPortalLayout({
  assetSwitcher,
  children,
}: {
  assetSwitcher?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      {assetSwitcher ? (
        <div className="flex flex-wrap items-center justify-end gap-3">{assetSwitcher}</div>
      ) : null}
      {children}
    </div>
  );
}

import type { ReactNode } from 'react';

export const RESTAURANT_TABS = [
  { id: 'inquiry', label: 'Inquiry' },
  { id: 'reserve', label: 'Reserve' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'qr_locations', label: 'QR Locations' },
  { id: 'guest_menu', label: 'Menu' },
  { id: 'live_tickets', label: 'Live tickets' },
  { id: 'companion_settings', label: 'Companion' },
  { id: 'bill', label: 'Bill' },
  { id: 'care', label: 'Care' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'profile', label: 'Profile' },
  { id: 'inbound', label: 'Inbound' },
] as const;

export type RestaurantTabId = (typeof RESTAURANT_TABS)[number]['id'];

export const GUEST_COMPANION_TAB_IDS = [
  'qr_locations',
  'guest_menu',
  'live_tickets',
  'companion_settings',
] as const satisfies ReadonlyArray<RestaurantTabId>;

/** Content chrome — primary nav lives in the app sidebar. */
export function RestaurantPortalLayout({
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

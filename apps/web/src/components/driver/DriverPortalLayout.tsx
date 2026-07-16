import type { ReactNode } from 'react';
import {
  CalendarDays,
  ClipboardList,
  FileText,
  HeartHandshake,
  LayoutDashboard,
  Wallet,
} from 'lucide-react';
import { partnerOsPathForSection } from '../../lib/partnerOsNav';

export const DRIVER_TABS = [
  { id: 'today', label: 'Today', icon: LayoutDashboard },
  { id: 'jobs', label: 'Jobs', icon: ClipboardList },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'pay', label: 'Pay', icon: Wallet },
  { id: 'care', label: 'Care', icon: HeartHandshake },
  { id: 'profile', label: 'Profile', icon: FileText },
  { id: 'inbound', label: 'Inbound', icon: ClipboardList },
] as const;

export type DriverTabId = (typeof DRIVER_TABS)[number]['id'];

const MOBILE_PRIMARY: DriverTabId[] = ['today', 'jobs', 'calendar', 'pay', 'care'];

/** Content chrome — desktop nav in sidebar; mobile bottom bar uses the same paths. */
export function DriverPortalLayout({
  tab,
  onNavigate,
  assetSwitcher,
  children,
}: {
  tab: DriverTabId;
  /** Navigate to a driver section path (e.g. `/jobs`). */
  onNavigate: (path: string) => void;
  assetSwitcher?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative space-y-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-4">
      {assetSwitcher ? (
        <div className="flex flex-wrap items-center justify-end gap-3">{assetSwitcher}</div>
      ) : null}

      {children}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Driver primary"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1 pt-1">
          {DRIVER_TABS.filter((t) => MOBILE_PRIMARY.includes(t.id)).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            const path = partnerOsPathForSection('driver', t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onNavigate(path)}
                className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium ${
                  active ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-primary' : ''}`} />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

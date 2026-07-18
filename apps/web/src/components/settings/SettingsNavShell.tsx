import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  Briefcase,
  Building2,
  FileText,
  Inbox,
  Network,
  Paintbrush,
  Scale,
  Settings,
  Shield,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Button, Card, CardContent, PageHeader, cn } from '@wayrune/ui';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { AGENCY_ROUTES } from '../../lib/agencyRoutes';
import { CAP } from '../../lib/capabilities';
import { usePermissions } from '../../lib/permissions';

export type SettingsNavId =
  | 'general'
  | 'workspaces'
  | 'organization'
  | 'branding'
  | 'business'
  | 'policies'
  | 'security'
  | 'inbox'
  | 'notifications'
  | 'privacy'
  | 'members';

const NAV_ITEMS: {
  id: SettingsNavId;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    id: 'general',
    label: 'General',
    description: 'Timezone, date/time format, currency, tax and itinerary defaults.',
    icon: Settings,
  },
  {
    id: 'workspaces',
    label: 'Workspaces',
    description: 'Create hotel, homestay, fleet, restaurant orgs and switch between them.',
    icon: Network,
  },
  {
    id: 'organization',
    label: 'Organization',
    description: 'Agency identity and public slug.',
    icon: Building2,
  },
  {
    id: 'branding',
    label: 'Branding',
    description: 'Logo, colors and client-facing look.',
    icon: Paintbrush,
  },
  {
    id: 'business',
    label: 'Business',
    description: 'Legal name, contact, trust signals and emergency support.',
    icon: Briefcase,
  },
  {
    id: 'policies',
    label: 'Policies',
    description: 'Cancellation, check-in/out, and meal policies for stays.',
    icon: FileText,
  },
  {
    id: 'security',
    label: 'Security',
    description: 'Session, MFA and password policy.',
    icon: Shield,
  },
  {
    id: 'inbox',
    label: 'Inbox',
    description: 'Channels, chat settings, and chatflows.',
    icon: Inbox,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Email sender and alert preferences.',
    icon: Bell,
  },
  {
    id: 'privacy',
    label: 'Privacy & policies',
    description: 'Policy links, consent and retention.',
    icon: Scale,
  },
  {
    id: 'members',
    label: 'Members',
    description: 'People with access to this organization.',
    icon: Users,
  },
];

export function settingsNavMeta(id: SettingsNavId) {
  return NAV_ITEMS.find((item) => item.id === id) ?? NAV_ITEMS[0]!;
}

/**
 * Shared Settings chrome — left nav + card — so Inbox/Chat pages match General settings.
 */
export function SettingsNavShell({
  activeId,
  children,
  title,
  description,
  actions,
  contentClassName,
  backTo,
}: {
  activeId: SettingsNavId;
  children: ReactNode;
  /** Section heading inside the card. Defaults to the nav item label. */
  title?: string;
  description?: string;
  actions?: ReactNode;
  contentClassName?: string;
  /** Shown on nested settings pages (Chat, Chatflows, editor). */
  backTo?: { href: string; label: string };
}) {
  const { navigate } = useOrgNavigate();
  const { hasAny } = usePermissions();
  const canUserManage = hasAny(CAP.userManage);
  const meta = settingsNavMeta(activeId);
  const sectionTitle = title ?? meta.label;
  const sectionDescription = description ?? meta.description;

  const visible = NAV_ITEMS.filter((item) => (item.id === 'members' ? canUserManage : true));

  const go = (id: SettingsNavId) => {
    if (id === 'inbox') {
      navigate(AGENCY_ROUTES.settingsInbox);
      return;
    }
    if (id === 'members') {
      navigate(AGENCY_ROUTES.teamMembers);
      return;
    }
    if (id === 'general') {
      navigate(AGENCY_ROUTES.settings);
      return;
    }
    navigate(`${AGENCY_ROUTES.settings}?section=${id}`);
  };

  return (
    <div>
      <PageHeader
        icon={Settings}
        title="Settings"
        subtitle="Configure your agency identity, compliance, security and integrations."
      />

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="h-fit space-y-1 rounded-2xl border p-2 glass-panel lg:sticky lg:top-4">
          {visible.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                  active
                    ? 'bg-primary/15 text-foreground'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                )}
              >
                <Icon className="size-4 shrink-0 opacity-80" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <Card className={cn('min-w-0 max-w-4xl', contentClassName)}>
          <CardContent className="space-y-5 p-5">
            {backTo ? (
              <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 px-2 text-muted-foreground">
                <Link to={backTo.href}>
                  <ArrowLeft className="size-3.5" />
                  {backTo.label}
                </Link>
              </Button>
            ) : null}
            <div className={cn('flex flex-wrap items-start justify-between gap-3', backTo && '-mt-2')}>
              <div className="space-y-1">
                <h2 className="text-base font-semibold tracking-tight">{sectionTitle}</h2>
                {sectionDescription ? (
                  <p className="text-sm text-muted-foreground">{sectionDescription}</p>
                ) : null}
              </div>
              {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
            {children}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { Shield, ShieldCheck, Users } from 'lucide-react';
import { PageHeader } from '@wayrune/ui';
import {
  AccessManagementPanel,
  type TeamAccessTab,
} from '../components/settings/AccessManagementPanel';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const TEAM_PAGE_COPY: Record<
  TeamAccessTab,
  { title: string; subtitle: string; documentTitle: string; icon: typeof Users }
> = {
  members: {
    title: 'Members',
    subtitle: 'People with access to this organization — invites, roles, and property scope.',
    documentTitle: 'Members',
    icon: Users,
  },
  roles: {
    title: 'Roles',
    subtitle: 'Role templates and permission bundles assigned to your team.',
    documentTitle: 'Roles',
    icon: Shield,
  },
  permissions: {
    title: 'Permissions',
    subtitle: 'Catalog of permission keys available for this organization and how roles use them.',
    documentTitle: 'Permissions',
    icon: ShieldCheck,
  },
  activity: {
    title: 'Team activity',
    subtitle: 'Membership and access changes across your organization.',
    documentTitle: 'Team activity',
    icon: Users,
  },
};

export function TeamAccessPage({ tab }: { tab: TeamAccessTab }) {
  const copy = TEAM_PAGE_COPY[tab];
  const Icon = copy.icon;
  useDocumentTitle(copy.documentTitle);

  return (
    <div>
      <PageHeader icon={Icon} title={copy.title} subtitle={copy.subtitle} className="mb-4" />
      <AccessManagementPanel active forcedTab={tab} hideTabBar />
    </div>
  );
}

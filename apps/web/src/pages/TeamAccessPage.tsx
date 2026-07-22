import { usePageChrome } from '@wayrune/ui';
import {
  AccessManagementPanel,
  type TeamAccessTab,
} from '../components/settings/AccessManagementPanel';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const TEAM_PAGE_COPY: Record<
  TeamAccessTab,
  { title: string; subtitle: string; documentTitle: string }
> = {
  members: {
    title: 'Team',
    subtitle: 'People with access to this organization — invites, roles, and property scope.',
    documentTitle: 'Team',
  },
  roles: {
    title: 'Roles',
    subtitle: 'Role templates and permission bundles assigned to your team.',
    documentTitle: 'Roles',
  },
  permissions: {
    title: 'Permissions',
    subtitle: 'Catalog of permission keys available for this organization and how roles use them.',
    documentTitle: 'Permissions',
  },
  activity: {
    title: 'Team activity',
    subtitle: 'Membership and access changes across your organization.',
    documentTitle: 'Team activity',
  },
};

export function TeamAccessPage({ tab }: { tab: TeamAccessTab }) {
  const copy = TEAM_PAGE_COPY[tab];
  useDocumentTitle(copy.documentTitle);
  usePageChrome({ title: copy.title, subtitle: copy.subtitle });

  return <AccessManagementPanel active forcedTab={tab} hideTabBar />;
}

import {
  ClipboardList,
  LayoutDashboard,
  MapPin,
  Network,
  Plane,
  Plus,
  Settings,
  Truck,
  Users,
  Wallet,
  CheckSquare,
  Globe2,
  IndianRupee,
  Building2,
  Contact,
  ChevronDown,
  Check,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@travel/ui';
import { GlobalSearch } from './components/GlobalSearch';
import { NotificationsBell } from './components/NotificationsBell';
import {
  type InquiryCreateDefaults,
} from './components/inquiries/inquiryIntakeTypes';
import { TravelRequestWorkspace } from './components/inquiries/TravelRequestWorkspace';
import { TravelRequestLauncherProvider } from './lib/travelRequestLauncher';
import { AGENCY_ROUTES, isAgencyNavActive } from './lib/agencyRoutes';
import { TRAVEL_REQUEST_PERMISSIONS } from './lib/capabilities';
import { useAgencyWorkspace } from './hooks/useAgencyWorkspace';
import {
  NEW_TRAVEL_REQUEST_ROUTE,
  resolveNavIcon,
  WORKSPACE_LABELS,
  workspaceShowsTravelRequestIntake,
} from './lib/progressiveComplexity';
import { useAuth } from './auth';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { LeadsPage } from './pages/LeadsPage';
import { LeadDetailPage } from './pages/LeadDetailPage';
import { InquiriesPage } from './pages/InquiriesPage';
import { InquiryDetailPage } from './pages/InquiryDetailPage';
import { PartiesPage } from './pages/PartiesPage';
import { PartyDetailPage } from './pages/PartyDetailPage';
import { InboxPage } from './pages/InboxPage';
import { TasksPage } from './pages/TasksPage';
import { TripsPage } from './pages/TripsPage';
import { TripWorkspacePage } from './pages/TripWorkspacePage';
import { ItineraryPreviewPage } from './pages/ItineraryPreviewPage';
import { PublicItineraryPage } from './pages/PublicItineraryPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { RatesPage } from './pages/RatesPage';
import { IntegrationsPage } from './pages/integrations/IntegrationsPage';
import { LeadSourcesPage } from './pages/LeadSourcesPage';
import { SettingsPage } from './pages/SettingsPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { TeamAccessPage } from './pages/TeamAccessPage';
import { NetworkPage } from './pages/NetworkPage';
import { PartnerHomePage } from './pages/PartnerHomePage';
import { PlacesPage } from './pages/PlacesPage';
import { PlatformCatalogPage } from './pages/PlatformCatalogPage';
import { ClaimInvitePage } from './pages/ClaimInvitePage';
import { AcceptInvitePage } from './pages/AcceptInvitePage';
import { PublicGuestOrderPage } from './pages/PublicGuestOrderPage';
import {
  agencyClientsLabel,
  isAgencyKind,
  isDmcOrgKind,
  isPlatformKind,
  isPartnerOrgKind,
  orgKindLabel,
} from './lib/orgKind';
import {
  allPartnerOsMountPaths,
  partnerOsNavForKind,
} from './lib/partnerOsNav';
import { hasPermission, hasAnyPermission, hasAllPermissions } from './lib/permissions';

/** Sentinel `to` for the unified intake CTA — intercepted in `onNavigate` to
 * open the Travel Request wizard instead of routing. */
const NEW_TRAVEL_REQUEST_ACTION = '#new-travel-request';

type AppNavItem = {
  id?: string;
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  section: string;
  /** Single permission (OR semantics with hasPermission). */
  permission?: string;
  /** All listed permissions required (AND). Takes precedence over `permission`. */
  permissionsAll?: string[];
};

function withNavId(item: Omit<AppNavItem, 'id'> & { id?: string }): AppNavItem {
  return { ...item, id: item.id ?? `${item.section}:${item.to}` };
}

function agencyNavForKind(kind?: string): AppNavItem[] {
  const clients = agencyClientsLabel(kind);
  const dmc = isDmcOrgKind(kind);
  return [
    withNavId({
      to: '/',
      label: dmc ? 'Home' : 'Dashboard',
      icon: LayoutDashboard,
      section: dmc ? 'DMC' : 'Sales',
    }),
    withNavId({ to: '/leads', label: 'Leads', icon: Users, section: dmc ? 'Acquire' : 'Sales', permission: 'lead.read.own' }),
    withNavId({ to: '/inquiries', label: 'Inquiries', icon: Contact, section: dmc ? 'Acquire' : 'Sales', permission: 'inquiry.read' }),
    withNavId({ to: '/parties', label: clients, icon: Building2, section: dmc ? 'Acquire' : 'Sales', permission: 'party.read' }),
    withNavId({ to: '/trips', label: dmc ? 'Packages' : 'Trips', icon: Plane, section: 'Operations', permission: 'trip.read' }),
    withNavId({
      to: '/trips?ops=1',
      label: 'Operations',
      icon: ClipboardList,
      section: 'Operations',
      permission: 'ops.read',
    }),
    withNavId({
      to: '/trips?finance=1',
      label: 'Finance',
      icon: Wallet,
      section: 'Operations',
      permission: 'finance.cost.read',
    }),
    withNavId({ to: '/tasks', label: 'Tasks', icon: CheckSquare, section: 'Operations', permission: 'task.read' }),
    withNavId({ to: '/places', label: 'Places', icon: MapPin, section: 'Operations', permission: 'trip.read' }),
    withNavId({ to: '/network', label: 'Network', icon: Network, section: 'Partners', permission: 'network.read' }),
    withNavId({
      to: '/suppliers',
      label: dmc ? 'Local suppliers' : 'Suppliers',
      icon: Truck,
      section: 'Partners',
      permission: 'network.read',
    }),
    withNavId({
      to: '/rates',
      label: dmc ? 'Net rates' : 'Rates',
      icon: IndianRupee,
      section: 'Partners',
      permission: 'quote.read',
    }),
    withNavId({ to: '/settings', label: 'Settings', icon: Settings, section: 'System', permission: 'org.settings.read' }),
  ];
}

function partnerNavForKind(kind?: string): AppNavItem[] {
  return partnerOsNavForKind(kind).map(({ path, label, icon, section, permission }) => ({
    id: `${section}:${path}`,
    to: path,
    label,
    icon,
    section,
    permission,
  }));
}

const platformNav: AppNavItem[] = [
  withNavId({ to: '/', label: 'Catalog', icon: Globe2, section: 'Travel OS', permission: 'platform.catalog.read' }),
  withNavId({ to: '/settings', label: 'Settings', icon: Settings, section: 'System', permission: 'org.settings.read' }),
];

function Shell({ children }: { children: React.ReactNode }) {
  const { me, logout, switchOrganization } = useAuth();
  const { workspace, workspaceLabel, navigation, isAgency: agencyWorkspace, availableWorkspaces, setJobWorkspace } = useAgencyWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeDefaults, setIntakeDefaults] = useState<InquiryCreateDefaults | undefined>();
  const intakeOnCreatedRef = useRef<(() => void) | undefined>(undefined);
  const openTravelRequest = useCallback((defaults?: InquiryCreateDefaults, options?: { onCreated?: () => void }) => {
    intakeOnCreatedRef.current = options?.onCreated;
    setIntakeDefaults(defaults);
    setIntakeOpen(true);
  }, []);
  const platform = isPlatformKind(me?.organization.kind);
  const agency = !platform && isAgencyKind(me?.organization.kind);
  const kind = me?.organization.kind;
  const legacyAgencyNav = useMemo(() => agencyNavForKind(kind), [kind]);
  const partnerNav = useMemo(() => partnerNavForKind(kind), [kind]);
  const nav = useMemo((): AppNavItem[] => {
    if (platform) return platformNav;
    if (agency && navigation) {
      return navigation.flat.map((item) => ({
        id: item.key,
        to: item.to,
        label: item.label,
        icon: resolveNavIcon(item.icon),
        section: item.section,
      }));
    }
    if (agency) return legacyAgencyNav;
    return partnerNav;
  }, [agency, legacyAgencyNav, navigation, partnerNav, platform, platformNav]);
  const permissions = me?.permissions;
  const visibleNav = useMemo(() => {
    if (agency && navigation) return nav;
    return nav.filter((item: AppNavItem) => {
      if (item.permissionsAll?.length) {
        return hasAllPermissions(permissions ?? [], item.permissionsAll);
      }
      return !item.permission || hasPermission(permissions ?? [], item.permission);
    });
  }, [agency, nav, navigation, permissions]);
  const canCreateTravelRequest =
    agency &&
    workspace &&
    workspaceShowsTravelRequestIntake(workspace, permissions ?? []);
  const memberships = me?.memberships ?? [];
  const workspaces = useMemo(
    () =>
      (memberships.length
        ? memberships
        : me?.organization
          ? [
              {
                organizationId: me.organization.id,
                name: me.organization.name,
                kind: me.organization.kind || 'travel_agency',
              },
            ]
          : []
      ).map((m) => ({
        id: m.organizationId,
        name: m.name,
        kindLabel: orgKindLabel(m.kind),
      })),
    [memberships, me?.organization],
  );

  return (
    <>
    <AppShell
      nav={visibleNav.map((item) => ({
        ...item,
        active: isAgencyNavActive(item.to, location.pathname, location.search),
      }))}
      user={{
        name: me?.fullName,
        org: `${me?.organization.name || ''} · ${orgKindLabel(me?.organization.kind)}`,
        role: agencyWorkspace && workspaceLabel ? workspaceLabel : undefined,
      }}
      workspaces={workspaces}
      activeWorkspaceId={me?.organization.id}
      onSwitchWorkspace={(id) => {
        void switchOrganization(id);
      }}
      onAddWorkspace={() => navigate('/settings?section=workspaces')}
      onNavigate={(to) => {
        if (to === NEW_TRAVEL_REQUEST_ACTION) {
          openTravelRequest();
          return;
        }
        navigate(to);
      }}
      onLogout={logout}
      headerActions={
        <>
          {agencyWorkspace && availableWorkspaces.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="hidden gap-1.5 md:inline-flex">
                  {workspaceLabel}
                  <ChevronDown className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Job workspace
                </DropdownMenuLabel>
                {availableWorkspaces.map((ws) => (
                  <DropdownMenuItem key={ws} onClick={() => setJobWorkspace(ws)}>
                    <span className="min-w-0 flex-1">{WORKSPACE_LABELS[ws]}</span>
                    {ws === workspace ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {canCreateTravelRequest ? (
            <Button
              type="button"
              size="sm"
              onClick={() => openTravelRequest()}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">New customer call</span>
            </Button>
          ) : null}
          <GlobalSearch onNavigate={(to) => navigate(to)} />
          <NotificationsBell onNavigate={(to) => navigate(to)} />
        </>
      }
    >
      <TravelRequestLauncherProvider value={openTravelRequest}>
        {children}
      </TravelRequestLauncherProvider>
    </AppShell>
    {agency ? (
      <TravelRequestWorkspace
        open={intakeOpen}
        onOpenChange={(next) => {
          setIntakeOpen(next);
          if (!next) {
            setIntakeDefaults(undefined);
            intakeOnCreatedRef.current = undefined;
          }
        }}
        defaults={intakeDefaults}
        onCreated={() => {
          intakeOnCreatedRef.current?.();
        }}
      />
    ) : null}
    </>
  );
}

function Private({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) {
    return <div className="p-10 text-muted-foreground">Loading…</div>;
  }
  if (!me) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

/** Agency CRM routes — partners / platform redirected home */
function AgencyOnly({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) {
    return <div className="p-10 text-muted-foreground">Loading…</div>;
  }
  if (!me) return <Navigate to="/login" replace />;
  if (isPlatformKind(me.organization.kind)) {
    return <Navigate to="/" replace />;
  }
  if (!isAgencyKind(me.organization.kind)) {
    return <Navigate to="/" replace />;
  }
  return <Shell>{children}</Shell>;
}

/** Partner OS section routes — agency / platform redirected home */
function PartnerOnly({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) {
    return <div className="p-10 text-muted-foreground">Loading…</div>;
  }
  if (!me) return <Navigate to="/login" replace />;
  if (!isPartnerOrgKind(me.organization.kind)) {
    return <Navigate to="/" replace />;
  }
  return <Shell>{children}</Shell>;
}

/** Redirect home when the user lacks any of the required permissions. Compose
 * inside an existing shell guard (Private/AgencyOnly) so the sidebar still renders. */
function RequirePermission({
  anyOf,
  children,
}: {
  anyOf: string[];
  children: React.ReactNode;
}) {
  const { me, loading } = useAuth();
  if (loading) {
    return <div className="p-10 text-muted-foreground">Loading…</div>;
  }
  if (!me) return <Navigate to="/login" replace />;
  if (!hasAnyPermission(me.permissions ?? [], anyOf)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function HomeRoute() {
  const { me } = useAuth();
  const { workspace } = useAgencyWorkspace();
  if (isPlatformKind(me?.organization.kind)) {
    return <PlatformCatalogPage />;
  }
  if (!isAgencyKind(me?.organization.kind)) {
    return <PartnerHomePage />;
  }
  // Sales users land on Unified Inbox (Agency Communication Hub).
  if (workspace === 'sales_executive' || workspace === 'sales_manager') {
    return <Navigate to="/inbox" replace />;
  }
  return <DashboardPage />;
}

const partnerOsPaths = allPartnerOsMountPaths().filter((p) => p !== '/inbox');

/** Agency omnichannel inbox and Stay partner inbound share `/inbox`. */
function InboxRoute() {
  const { me, loading } = useAuth();
  if (loading) {
    return <div className="p-10 text-muted-foreground">Loading…</div>;
  }
  if (!me) return <Navigate to="/login" replace />;
  if (isPartnerOrgKind(me.organization.kind)) {
    return (
      <PartnerOnly>
        <PartnerHomePage />
      </PartnerOnly>
    );
  }
  return (
    <AgencyOnly>
      <RequirePermission anyOf={['lead.read.own', 'lead.read', 'inquiry.read']}>
        <InboxPage />
      </RequirePermission>
    </AgencyOnly>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/claim/:token" element={<ClaimInvitePage />} />
      <Route path="/accept/:token" element={<AcceptInvitePage />} />
      <Route path="/p/itinerary/:token" element={<PublicItineraryPage />} />
      <Route path="/o/:token" element={<PublicGuestOrderPage />} />
      <Route path="/" element={<Private><HomeRoute /></Private>} />
      <Route path="/inbox" element={<InboxRoute />} />
      {partnerOsPaths.map((p) => (
        <Route
          key={p}
          path={p}
          element={
            <PartnerOnly>
              <PartnerHomePage />
            </PartnerOnly>
          }
        />
      ))}
      <Route path="/platform/places" element={<Navigate to="/" replace />} />
      <Route
        path="/business/sales"
        element={<AgencyOnly><RequirePermission anyOf={['inquiry.read']}><InquiriesPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/business/pipeline"
        element={<Navigate to="/leads" replace />}
      />
      <Route
        path="/business/customers"
        element={<AgencyOnly><RequirePermission anyOf={['party.read']}><PartiesPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/team/members"
        element={<AgencyOnly><RequirePermission anyOf={['user.manage']}><TeamAccessPage tab="members" /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/team/roles"
        element={<AgencyOnly><RequirePermission anyOf={['user.manage']}><TeamAccessPage tab="roles" /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/team/permissions"
        element={<AgencyOnly><RequirePermission anyOf={['user.manage']}><TeamAccessPage tab="permissions" /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/team/activity"
        element={<AgencyOnly><RequirePermission anyOf={['user.manage']}><TeamAccessPage tab="activity" /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/leads"
        element={<AgencyOnly><RequirePermission anyOf={['lead.read.own']}><LeadsPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/leads/:id"
        element={<AgencyOnly><RequirePermission anyOf={['lead.read.own']}><LeadDetailPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/work/requests"
        element={<AgencyOnly><RequirePermission anyOf={['inquiry.read']}><InquiriesPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/work/planning"
        element={<AgencyOnly><RequirePermission anyOf={['inquiry.read']}><InquiriesPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/work/quotations"
        element={<AgencyOnly><RequirePermission anyOf={['trip.read']}><TripsPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/work/quotation-drafts"
        element={<AgencyOnly><RequirePermission anyOf={['trip.read']}><TripsPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/work/follow-ups"
        element={<AgencyOnly><RequirePermission anyOf={['task.read']}><TasksPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/operations"
        element={<AgencyOnly><RequirePermission anyOf={['ops.read', 'trip.read']}><TripsPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/operations/bookings"
        element={<AgencyOnly><RequirePermission anyOf={['ops.read', 'trip.read']}><TripsPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/operations/suppliers"
        element={<AgencyOnly><RequirePermission anyOf={['ops.read']}><TripsPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/operations/incidents"
        element={<AgencyOnly><RequirePermission anyOf={['ops.read', 'incident.manage']}><TripsPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/finance"
        element={<AgencyOnly><RequirePermission anyOf={['finance.cost.read', 'trip.read']}><TripsPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/finance/overdue"
        element={<AgencyOnly><RequirePermission anyOf={['finance.cost.read']}><TripsPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/finance/payables"
        element={<AgencyOnly><RequirePermission anyOf={['finance.cost.read', 'finance.settlement.read']}><TripsPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/finance/reconciliation"
        element={<AgencyOnly><RequirePermission anyOf={['finance.payment.manage', 'finance.cost.read']}><TripsPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/finance/documents"
        element={<AgencyOnly><RequirePermission anyOf={['finance.cost.read']}><TripsPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/finance/payments"
        element={<AgencyOnly><RequirePermission anyOf={['finance.cost.read']}><TripsPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/inquiries"
        element={<AgencyOnly><RequirePermission anyOf={['inquiry.read']}><InquiriesPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/inquiries/:id"
        element={<AgencyOnly><RequirePermission anyOf={['inquiry.read']}><InquiryDetailPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/parties"
        element={<AgencyOnly><RequirePermission anyOf={['party.read']}><PartiesPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/parties/:id"
        element={<AgencyOnly><RequirePermission anyOf={['party.read']}><PartyDetailPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/suppliers"
        element={<Private><RequirePermission anyOf={['network.read']}><SuppliersPage /></RequirePermission></Private>}
      />
      <Route
        path="/rates"
        element={<AgencyOnly><RequirePermission anyOf={['quote.read']}><RatesPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/network"
        element={<Private><RequirePermission anyOf={['network.read']}><NetworkPage /></RequirePermission></Private>}
      />
      <Route
        path="/tasks"
        element={<AgencyOnly><RequirePermission anyOf={['task.read']}><TasksPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/trips"
        element={<AgencyOnly><RequirePermission anyOf={['trip.read']}><TripsPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/trips/:id"
        element={<AgencyOnly><RequirePermission anyOf={['trip.read']}><TripWorkspacePage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/trips/:id/itinerary/preview"
        element={<AgencyOnly><RequirePermission anyOf={['trip.read']}><ItineraryPreviewPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/places"
        element={<AgencyOnly><RequirePermission anyOf={['trip.read']}><PlacesPage /></RequirePermission></AgencyOnly>}
      />
      <Route
        path="/settings/integrations"
        element={<Private><RequirePermission anyOf={['org.settings.read']}><IntegrationsPage /></RequirePermission></Private>}
      />
      <Route
        path="/settings/lead-sources"
        element={<Private><RequirePermission anyOf={['org.settings.read', 'lead.read']}><LeadSourcesPage /></RequirePermission></Private>}
      />
      <Route
        path="/settings/audit"
        element={<Private><RequirePermission anyOf={['audit.read']}><AuditLogPage /></RequirePermission></Private>}
      />
      <Route
        path="/settings/access"
        element={<Navigate to="/team/members" replace />}
      />
      <Route
        path="/settings"
        element={<Private><RequirePermission anyOf={['org.settings.read']}><SettingsPage /></RequirePermission></Private>}
      />
    </Routes>
  );
}

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
import {
  useNavigate,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import {
  AppShell,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@wayrune/ui';
import { GlobalSearch } from './components/GlobalSearch';
import { NotificationsBell } from './components/NotificationsBell';
import { OrgScopedLayout } from './components/OrgScopedLayout';
import {
  type InquiryCreateDefaults,
} from './components/inquiries/inquiryIntakeTypes';
import { TravelRequestWorkspace } from './components/inquiries/TravelRequestWorkspace';
import { TravelRequestLauncherProvider } from './lib/travelRequestLauncher';
import {
  AGENCY_ROUTES,
  isAgencyNavActive,
  orgPath,
  orgPortalRef,
  presencePagesPath,
  rewriteOrgPrefix,
  settingsInboxChatflowsPath,
} from './lib/agencyRoutes';
import { useAgencyWorkspace } from './hooks/useAgencyWorkspace';
import {
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
import { MovementBoardPage } from './pages/MovementBoardPage';
import { FinanceAgingPage } from './pages/FinanceAgingPage';
import { FinancePortfolioPage } from './pages/FinancePortfolioPage';
import { TripsPage } from './pages/TripsPage';
import { TripWorkspacePage } from './pages/TripWorkspacePage';
import { ItineraryPreviewPage } from './pages/ItineraryPreviewPage';
import { PublicItineraryPage } from './pages/PublicItineraryPage';
import { PublicTripPaymentPage } from './pages/PublicTripPaymentPage';
import { PublicChangelogPage } from './pages/PublicChangelogPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { SupplierDetailPage } from './pages/SupplierDetailPage';
import { RatesPage } from './pages/RatesPage';
import { IntegrationsPage } from './pages/integrations/IntegrationsPage';
import { LeadSourcesPage } from './pages/LeadSourcesPage';
import { SettingsPage } from './pages/SettingsPage';
import { IntegrationHelpPage } from './pages/integrations/IntegrationHelpPage';
import { InboxSettingsPage } from './pages/inbox-settings/InboxSettingsPage';
import { ChatSettingsPage } from './pages/inbox-settings/ChatSettingsPage';
import { ChatflowsPage } from './pages/inbox-settings/ChatflowsPage';
import { ChatflowEditorPage } from './pages/inbox-settings/ChatflowEditorPage';
import { DigitalPresencePage } from './pages/DigitalPresencePage';
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

const NEW_TRAVEL_REQUEST_ACTION = '#new-travel-request';

type AppNavItem = {
  id?: string;
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  section: string;
  permission?: string;
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
      label: dmc ? 'Net rates' : 'Catalog & transfers',
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

function prefixAgencyHref(orgRef: string, href: string): string {
  if (!href || href.startsWith('#') || href.startsWith('http')) return href;
  const [pathPart, query = ''] = href.split('?');
  const path = pathPart || '/';
  const scoped = orgPath(orgRef, path);
  return query ? `${scoped}?${query}` : scoped;
}

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
  const partner = !platform && isPartnerOrgKind(me?.organization.kind);
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
  }, [agency, legacyAgencyNav, navigation, partnerNav, platform]);
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

  const activeOrgRef = me?.organization ? orgPortalRef(me.organization) : '';

  const resolveNavTo = useCallback(
    (item: AppNavItem) => {
      if ((!agency && !partner) || !activeOrgRef) return item.to;
      if (item.id === 'agency.presence') return presencePagesPath(activeOrgRef);
      return prefixAgencyHref(activeOrgRef, item.to);
    },
    [agency, partner, activeOrgRef],
  );

  const resolveAppHref = useCallback(
    (to: string) => {
      if ((!agency && !partner) || !activeOrgRef) return to;
      return prefixAgencyHref(activeOrgRef, to);
    },
    [agency, partner, activeOrgRef],
  );

  return (
    <>
    <AppShell
      nav={visibleNav.map((item) => {
        const to = resolveNavTo(item);
        return {
          ...item,
          to,
          active: isAgencyNavActive(to, location.pathname, location.search),
        };
      })}
      user={{
        name: me?.fullName,
        org: `${me?.organization.name || ''} · ${orgKindLabel(me?.organization.kind)}`,
        role: agencyWorkspace && workspaceLabel ? workspaceLabel : undefined,
      }}
      workspaces={workspaces}
      activeWorkspaceId={me?.organization.id}
      onSwitchWorkspace={(id) => {
        void (async () => {
          const membership = memberships.find((m) => m.organizationId === id);
          const newRef = membership
            ? orgPortalRef({
                id: membership.organizationId,
                publicCode: membership.publicCode,
              })
            : id;
          const fromAgency = isAgencyKind(me?.organization.kind);
          const toAgency = membership ? isAgencyKind(membership.kind) : fromAgency;
          const fromPartner = isPartnerOrgKind(me?.organization.kind);
          const toPartner = membership ? isPartnerOrgKind(membership.kind) : fromPartner;
          // Crossing agency ↔ partner: land on that org's home (paths differ).
          const crossKind = fromAgency !== toAgency || fromPartner !== toPartner;
          const next = crossKind
            ? orgPath(newRef, '/')
            : rewriteOrgPrefix(
                location.pathname,
                location.search,
                newRef,
                activeOrgRef || null,
              );
          await switchOrganization(id, { redirectTo: next });
        })();
      }}
      onAddWorkspace={() => navigate(resolveAppHref('/settings?section=workspaces'))}
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
          <GlobalSearch onNavigate={(to) => navigate(resolveAppHref(to))} />
          <NotificationsBell onNavigate={(to) => navigate(resolveAppHref(to))} />
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
  const location = useLocation();
  if (loading) {
    return <div className="p-10 text-muted-foreground">Loading…</div>;
  }
  if (!me) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Shell>{children}</Shell>;
}

/** Auth + Shell layout for nested org-scoped routes (agency + partner). */
function OrgPortalShellLayout() {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="p-10 text-muted-foreground">Loading…</div>;
  }
  if (!me) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (isPlatformKind(me.organization.kind)) {
    return <Navigate to="/" replace />;
  }
  if (!isAgencyKind(me.organization.kind) && !isPartnerOrgKind(me.organization.kind)) {
    return <Navigate to="/" replace />;
  }
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}

function PartnerGate({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const { orgRef } = useParams<{ orgRef?: string }>();
  if (loading) {
    return <div className="p-10 text-muted-foreground">Loading…</div>;
  }
  if (!me) return <Navigate to="/login" replace />;
  if (!isPartnerOrgKind(me.organization.kind)) {
    const home = orgRef
      ? orgPath(orgRef, '/')
      : me
        ? orgPath(orgPortalRef(me.organization), '/')
        : '/';
    return <Navigate to={home} replace />;
  }
  return <>{children}</>;
}

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

function RequirePermission({
  anyOf,
  children,
}: {
  anyOf: string[];
  children: React.ReactNode;
}) {
  const { me, loading } = useAuth();
  const { orgRef } = useParams<{ orgRef?: string }>();
  if (loading) {
    return <div className="p-10 text-muted-foreground">Loading…</div>;
  }
  if (!me) return <Navigate to="/login" replace />;
  if (!hasAnyPermission(me.permissions ?? [], anyOf)) {
    const home = orgRef
      ? orgPath(orgRef, '/')
      : isAgencyKind(me.organization.kind)
        ? orgPath(orgPortalRef(me.organization), '/')
        : '/';
    return <Navigate to={home} replace />;
  }
  return <>{children}</>;
}

function HomeRoute() {
  const { me } = useAuth();
  const { workspace } = useAgencyWorkspace();
  const { orgRef } = useParams<{ orgRef?: string }>();
  const ref = orgRef || (me ? orgPortalRef(me.organization) : '');

  if (isPlatformKind(me?.organization.kind)) {
    return <PlatformCatalogPage />;
  }
  if (isPartnerOrgKind(me?.organization.kind)) {
    return <PartnerHomePage />;
  }
  if (!isAgencyKind(me?.organization.kind)) {
    return <PartnerHomePage />;
  }
  if (workspace === 'sales_executive' || workspace === 'sales_manager') {
    return <Navigate to={orgPath(ref, AGENCY_ROUTES.inbox)} replace />;
  }
  return <DashboardPage />;
}

/** `/` entry: agency + partner → org home; platform stays flat. */
function RootEntry() {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="p-10 text-muted-foreground">Loading…</div>;
  }
  if (!me) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (isPlatformKind(me.organization.kind)) {
    return (
      <Private>
        <HomeRoute />
      </Private>
    );
  }
  if (isAgencyKind(me.organization.kind) || isPartnerOrgKind(me.organization.kind)) {
    return <Navigate to={orgPath(orgPortalRef(me.organization), '/')} replace />;
  }
  return (
    <Private>
      <HomeRoute />
    </Private>
  );
}

/** Redirect flat portal URLs into `/:orgRef/...` for agency + partner. */
function LegacyOrgPathRedirect() {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="p-10 text-muted-foreground">Loading…</div>;
  }
  if (!me) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (isPlatformKind(me.organization.kind)) {
    return <Navigate to="/" replace />;
  }
  if (!isAgencyKind(me.organization.kind) && !isPartnerOrgKind(me.organization.kind)) {
    return <Navigate to="/" replace />;
  }
  const ref = orgPortalRef(me.organization);
  return (
    <Navigate
      to={`${orgPath(ref, location.pathname)}${location.search}`}
      replace
    />
  );
}

/** Old `/presence/:orgId/...` → `/:orgId/presence/...`. */
function LegacyPresenceRedirect() {
  const { orgId } = useParams<{ orgId: string }>();
  const location = useLocation();
  if (!orgId) return <Navigate to="/" replace />;
  const suffix = location.pathname.replace(/^\/presence\/[^/]+/, '') || '';
  const rest = suffix.startsWith('/') ? suffix : `/${suffix}`;
  const target =
    rest === '/' || rest === ''
      ? presencePagesPath(orgId)
      : orgPath(orgId, `/presence${rest}`);
  return <Navigate to={`${target}${location.search}`} replace />;
}

const partnerOsPaths = allPartnerOsMountPaths().filter((p) => p !== '/inbox');

function InboxRoute() {
  const { me, loading } = useAuth();
  if (loading) {
    return <div className="p-10 text-muted-foreground">Loading…</div>;
  }
  if (!me) return <Navigate to="/login" replace />;
  if (isPartnerOrgKind(me.organization.kind) || isAgencyKind(me.organization.kind)) {
    return (
      <Navigate
        to={orgPath(orgPortalRef(me.organization), AGENCY_ROUTES.inbox)}
        replace
      />
    );
  }
  return <Navigate to="/" replace />;
}

function agencyPerm(anyOf: string[], element: React.ReactNode) {
  return <RequirePermission anyOf={anyOf}>{element}</RequirePermission>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/claim/:token" element={<ClaimInvitePage />} />
      <Route path="/accept/:token" element={<AcceptInvitePage />} />
      <Route path="/p/itinerary/:token" element={<PublicItineraryPage />} />
      <Route path="/p/pay/:token" element={<PublicTripPaymentPage />} />
      <Route path="/o/:token" element={<PublicGuestOrderPage />} />
      <Route path="/changelog" element={<PublicChangelogPage />} />

      <Route path="/" element={<RootEntry />} />
      <Route path="/inbox" element={<InboxRoute />} />

      {/* Legacy flat partner OS paths → /:orgRef/... */}
      {partnerOsPaths.map((p) => (
        <Route key={`legacy-partner${p}`} path={p} element={<LegacyOrgPathRedirect />} />
      ))}
      <Route path="/platform/places" element={<Navigate to="/" replace />} />

      {/* Legacy flat agency paths → /:orgRef/... */}
      <Route path="/leads/*" element={<LegacyOrgPathRedirect />} />
      <Route path="/inquiries/*" element={<LegacyOrgPathRedirect />} />
      <Route path="/parties/*" element={<LegacyOrgPathRedirect />} />
      <Route path="/trips/*" element={<LegacyOrgPathRedirect />} />
      <Route path="/tasks" element={<LegacyOrgPathRedirect />} />
      <Route path="/places" element={<LegacyOrgPathRedirect />} />
      <Route path="/rates" element={<LegacyOrgPathRedirect />} />
      <Route path="/work/*" element={<LegacyOrgPathRedirect />} />
      <Route path="/operations/*" element={<LegacyOrgPathRedirect />} />
      <Route path="/operations" element={<LegacyOrgPathRedirect />} />
      <Route path="/finance/*" element={<LegacyOrgPathRedirect />} />
      <Route path="/finance" element={<LegacyOrgPathRedirect />} />
      <Route path="/business/*" element={<LegacyOrgPathRedirect />} />
      <Route path="/team/*" element={<LegacyOrgPathRedirect />} />

      {/* Shared settings/network: agency + partner → org prefix; platform stays flat */}
      <Route path="/settings/integrations/help" element={<SharedSettingsRedirect page="integrationHelp" />} />
      <Route path="/settings/integrations" element={<SharedSettingsRedirect page="integrations" />} />
      <Route path="/settings/presence" element={<SharedSettingsRedirect page="presence" />} />
      <Route path="/settings/lead-sources" element={<SharedSettingsRedirect page="leadSources" />} />
      <Route path="/settings/audit" element={<SharedSettingsRedirect page="audit" />} />
      <Route path="/settings/access" element={<SharedSettingsRedirect page="access" />} />
      <Route path="/settings" element={<SharedSettingsRedirect page="settings" />} />
      <Route path="/network" element={<SharedNetworkRedirect />} />
      <Route path="/suppliers/*" element={<LegacyOrgPathRedirect />} />
      <Route path="/suppliers" element={<SharedSuppliersRedirect />} />

      {/* Legacy presence URLs */}
      <Route path="/presence/:orgId/*" element={<LegacyPresenceRedirect />} />
      <Route path="/presence/:orgId" element={<LegacyPresenceRedirect />} />

      {/* HubSpot-style org-scoped portal (agency + partner) */}
      <Route element={<OrgPortalShellLayout />}>
        <Route path="/:orgRef" element={<OrgScopedLayout />}>
          <Route index element={<HomeRoute />} />
          <Route path="inbox" element={<OrgInboxRoute />} />
          <Route path="business/sales" element={agencyPerm(['inquiry.read'], <InquiriesPage />)} />
          <Route path="business/pipeline" element={<Navigate to="../leads" replace />} />
          <Route path="business/customers" element={agencyPerm(['party.read'], <PartiesPage />)} />
          <Route path="team/members" element={agencyPerm(['user.manage'], <TeamAccessPage tab="members" />)} />
          <Route path="team/roles" element={agencyPerm(['user.manage'], <TeamAccessPage tab="roles" />)} />
          <Route path="team/permissions" element={agencyPerm(['user.manage'], <TeamAccessPage tab="permissions" />)} />
          <Route path="team/activity" element={agencyPerm(['user.manage'], <TeamAccessPage tab="activity" />)} />
          <Route path="leads" element={agencyPerm(['lead.read.own'], <LeadsPage />)} />
          <Route path="leads/:id" element={agencyPerm(['lead.read.own'], <LeadDetailPage />)} />
          <Route path="work/requests" element={agencyPerm(['inquiry.read'], <InquiriesPage />)} />
          <Route path="work/planning" element={agencyPerm(['inquiry.read'], <InquiriesPage />)} />
          <Route path="work/quotations" element={agencyPerm(['trip.read'], <TripsPage />)} />
          <Route path="work/quotation-drafts" element={agencyPerm(['trip.read'], <TripsPage />)} />
          <Route path="work/follow-ups" element={agencyPerm(['task.read'], <TasksPage />)} />
          <Route path="operations" element={agencyPerm(['ops.read', 'trip.read'], <TripsPage />)} />
          <Route path="operations/bookings" element={agencyPerm(['ops.read', 'trip.read'], <TripsPage />)} />
          <Route path="operations/movement" element={agencyPerm(['ops.read', 'trip.read'], <MovementBoardPage />)} />
          <Route path="operations/suppliers" element={agencyPerm(['ops.read'], <TripsPage />)} />
          <Route path="operations/incidents" element={agencyPerm(['ops.read', 'incident.manage'], <TripsPage />)} />
          <Route path="finance" element={agencyPerm(['finance.cost.read', 'trip.read'], <FinanceAgingPage />)} />
          <Route path="finance/overdue" element={agencyPerm(['finance.cost.read'], <FinanceAgingPage />)} />
          <Route path="finance/payables" element={agencyPerm(['finance.cost.read', 'finance.settlement.read'], <FinanceAgingPage />)} />
          <Route path="finance/profitability" element={agencyPerm(['finance.margin.read', 'finance.cost.read'], <FinancePortfolioPage />)} />
          <Route path="finance/reconciliation" element={agencyPerm(['finance.payment.manage', 'finance.cost.read'], <TripsPage />)} />
          <Route path="finance/documents" element={agencyPerm(['finance.cost.read'], <TripsPage />)} />
          <Route path="finance/payments" element={agencyPerm(['finance.cost.read'], <TripsPage />)} />
          <Route path="inquiries" element={agencyPerm(['inquiry.read'], <InquiriesPage />)} />
          <Route path="inquiries/:id" element={agencyPerm(['inquiry.read'], <InquiryDetailPage />)} />
          <Route path="parties" element={agencyPerm(['party.read'], <PartiesPage />)} />
          <Route path="parties/:id" element={agencyPerm(['party.read'], <PartyDetailPage />)} />
          <Route path="suppliers" element={<OrgSuppliersRoute />} />
          <Route
            path="suppliers/:id"
            element={
              <RequirePermission anyOf={['network.read']}>
                <SupplierDetailPage />
              </RequirePermission>
            }
          />
          <Route path="rates" element={agencyPerm(['quote.read'], <RatesPage />)} />
          <Route path="network" element={<OrgNetworkRoute />} />
          <Route path="tasks" element={agencyPerm(['task.read'], <TasksPage />)} />
          <Route path="trips" element={agencyPerm(['trip.read'], <TripsPage />)} />
          <Route path="trips/:id" element={agencyPerm(['trip.read'], <TripWorkspacePage />)} />
          <Route path="trips/:id/itinerary/preview" element={agencyPerm(['trip.read'], <ItineraryPreviewPage />)} />
          <Route path="places" element={agencyPerm(['trip.read'], <PlacesPage />)} />
          <Route path="settings/integrations/help" element={agencyPerm(['org.settings.read'], <IntegrationHelpPage />)} />
          <Route path="settings/integrations" element={agencyPerm(['org.settings.read'], <IntegrationsPage />)} />
          <Route path="settings/inbox/chat/chatflows/:chatflowId" element={agencyPerm(['org.settings.read'], <ChatflowEditorPage />)} />
          <Route path="settings/inbox/chat/chatflows" element={agencyPerm(['org.settings.read'], <ChatflowsPage />)} />
          <Route path="settings/inbox/chat" element={agencyPerm(['org.settings.read'], <ChatSettingsPage />)} />
          <Route path="settings/inbox" element={agencyPerm(['org.settings.read'], <InboxSettingsPage />)} />
          <Route path="settings/presence" element={<PresenceSettingsRedirect />} />
          <Route path="settings/lead-sources" element={agencyPerm(['org.settings.read', 'lead.read'], <LeadSourcesPage />)} />
          <Route path="settings/audit" element={agencyPerm(['audit.read'], <AuditLogPage />)} />
          <Route path="settings/access" element={<Navigate to="../team/members" replace />} />
          <Route path="settings" element={<OrgSettingsRoute />} />

          <Route path="presence/pages/:pageId/builder" element={agencyPerm(['org.settings.read'], <DigitalPresencePage />)} />
          <Route path="presence/pages" element={agencyPerm(['org.settings.read'], <DigitalPresencePage />)} />
          <Route path="presence/sites/:siteId" element={agencyPerm(['org.settings.read'], <DigitalPresencePage />)} />
          <Route path="presence/themes" element={agencyPerm(['org.settings.read'], <DigitalPresencePage />)} />
          <Route path="presence/modules" element={agencyPerm(['org.settings.read'], <DigitalPresencePage />)} />
          <Route path="presence/forms" element={agencyPerm(['org.settings.read'], <DigitalPresencePage />)} />
          <Route path="presence/widgets" element={<PresenceWidgetsRedirect />} />
          <Route path="presence/domains" element={agencyPerm(['org.settings.read'], <DigitalPresencePage />)} />
          <Route path="presence/assets" element={agencyPerm(['org.settings.read'], <DigitalPresencePage />)} />
          <Route path="presence/collections" element={agencyPerm(['org.settings.read'], <DigitalPresencePage />)} />
          <Route path="presence/marketplace" element={agencyPerm(['org.settings.read'], <DigitalPresencePage />)} />
          <Route path="presence/settings" element={agencyPerm(['org.settings.read'], <DigitalPresencePage />)} />
          <Route path="presence" element={<PresenceIndexRedirect />} />

          {/* Partner OS sections (hotel, restaurant, fleet, …) */}
          {partnerOsPaths.map((p) => (
            <Route
              key={`org-partner${p}`}
              path={p.replace(/^\//, '')}
              element={
                <PartnerGate>
                  <PartnerHomePage />
                </PartnerGate>
              }
            />
          ))}
        </Route>
      </Route>
    </Routes>
  );
}

function PresenceSettingsRedirect() {
  const { orgRef } = useParams<{ orgRef: string }>();
  if (!orgRef) return <Navigate to="/" replace />;
  return <Navigate to={presencePagesPath(orgRef)} replace />;
}

function PresenceIndexRedirect() {
  const { orgRef } = useParams<{ orgRef: string }>();
  if (!orgRef) return <Navigate to="/" replace />;
  return <Navigate to={presencePagesPath(orgRef)} replace />;
}

function PresenceWidgetsRedirect() {
  const { orgRef } = useParams<{ orgRef: string }>();
  if (!orgRef) return <Navigate to="/" replace />;
  return <Navigate to={settingsInboxChatflowsPath(orgRef)} replace />;
}

function OrgInboxRoute() {
  const { me, loading } = useAuth();
  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!me) return <Navigate to="/login" replace />;
  if (isPartnerOrgKind(me.organization.kind)) {
    return <PartnerHomePage />;
  }
  return agencyPerm(['lead.read.own', 'lead.read', 'inquiry.read'], <InboxPage />);
}

function OrgSettingsRoute() {
  const { me, loading } = useAuth();
  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!me) return <Navigate to="/login" replace />;
  if (isPartnerOrgKind(me.organization.kind)) {
    return (
      <RequirePermission anyOf={['org.settings.read']}>
        <SettingsPage />
      </RequirePermission>
    );
  }
  return agencyPerm(['org.settings.read'], <SettingsPage />);
}

function OrgNetworkRoute() {
  const { me, loading } = useAuth();
  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!me) return <Navigate to="/login" replace />;
  return (
    <RequirePermission anyOf={['network.read']}>
      <NetworkPage />
    </RequirePermission>
  );
}

function OrgSuppliersRoute() {
  const { me, loading } = useAuth();
  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!me) return <Navigate to="/login" replace />;
  return (
    <RequirePermission anyOf={['network.read']}>
      <SuppliersPage />
    </RequirePermission>
  );
}

function SharedSettingsRedirect({
  page,
}: {
  page:
    | 'settings'
    | 'integrations'
    | 'integrationHelp'
    | 'presence'
    | 'leadSources'
    | 'audit'
    | 'access';
}) {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!me) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  const portalOrg =
    (isAgencyKind(me.organization.kind) || isPartnerOrgKind(me.organization.kind)) &&
    !isPlatformKind(me.organization.kind);
  if (portalOrg) {
    const ref = orgPortalRef(me.organization);
    if (page === 'presence') {
      if (isPartnerOrgKind(me.organization.kind)) {
        return <Navigate to={orgPath(ref, '/')} replace />;
      }
      return <Navigate to={presencePagesPath(ref)} replace />;
    }
    if (page === 'access') {
      if (isPartnerOrgKind(me.organization.kind)) {
        return <Navigate to={orgPath(ref, AGENCY_ROUTES.settings)} replace />;
      }
      return <Navigate to={orgPath(ref, AGENCY_ROUTES.teamMembers)} replace />;
    }
    const map: Record<string, string> = {
      settings: AGENCY_ROUTES.settings,
      integrations: AGENCY_ROUTES.settingsIntegrations,
      integrationHelp: AGENCY_ROUTES.settingsIntegrationHelp,
      leadSources: AGENCY_ROUTES.settingsLeadSources,
      audit: AGENCY_ROUTES.settingsAudit,
    };
    // Partner orgs only use the main settings page for most of these.
    if (isPartnerOrgKind(me.organization.kind) && page !== 'settings') {
      return (
        <Navigate
          to={`${orgPath(ref, AGENCY_ROUTES.settings)}${location.search}`}
          replace
        />
      );
    }
    return (
      <Navigate
        to={`${orgPath(ref, map[page] || AGENCY_ROUTES.settings)}${location.search}`}
        replace
      />
    );
  }
  if (page === 'presence') {
    return <Navigate to="/" replace />;
  }
  if (page === 'access') {
    return <Navigate to="/team/members" replace />;
  }
  if (page === 'integrations') {
    return (
      <Private>
        <RequirePermission anyOf={['org.settings.read']}>
          <IntegrationsPage />
        </RequirePermission>
      </Private>
    );
  }
  if (page === 'integrationHelp') {
    return (
      <Private>
        <RequirePermission anyOf={['org.settings.read']}>
          <IntegrationHelpPage />
        </RequirePermission>
      </Private>
    );
  }
  if (page === 'leadSources') {
    return (
      <Private>
        <RequirePermission anyOf={['org.settings.read', 'lead.read']}>
          <LeadSourcesPage />
        </RequirePermission>
      </Private>
    );
  }
  if (page === 'audit') {
    return (
      <Private>
        <RequirePermission anyOf={['audit.read']}>
          <AuditLogPage />
        </RequirePermission>
      </Private>
    );
  }
  return (
    <Private>
      <RequirePermission anyOf={['org.settings.read']}>
        <SettingsPage />
      </RequirePermission>
    </Private>
  );
}

function SharedNetworkRedirect() {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!me) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (
    (isAgencyKind(me.organization.kind) || isPartnerOrgKind(me.organization.kind)) &&
    !isPlatformKind(me.organization.kind)
  ) {
    return (
      <Navigate
        to={orgPath(orgPortalRef(me.organization), AGENCY_ROUTES.network)}
        replace
      />
    );
  }
  return (
    <Private>
      <RequirePermission anyOf={['network.read']}>
        <NetworkPage />
      </RequirePermission>
    </Private>
  );
}

function SharedSuppliersRedirect() {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!me) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (
    (isAgencyKind(me.organization.kind) || isPartnerOrgKind(me.organization.kind)) &&
    !isPlatformKind(me.organization.kind)
  ) {
    return (
      <Navigate
        to={orgPath(orgPortalRef(me.organization), AGENCY_ROUTES.suppliers)}
        replace
      />
    );
  }
  return (
    <Private>
      <RequirePermission anyOf={['network.read']}>
        <SuppliersPage />
      </RequirePermission>
    </Private>
  );
}

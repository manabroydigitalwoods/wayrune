import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import {
  Building2,
  Bell,
  Briefcase,
  CalendarDays,
  Clock,
  DollarSign,
  Euro,
  FileText,
  Inbox,
  IndianRupee,
  Network,
  Paintbrush,
  Percent,
  Plug,
  PoundSterling,
  Scale,
  Settings,
  Shield,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Combobox,
  DATE_FORMAT_OPTIONS,
  DEFAULT_DATETIME_PREFS,
  EmailInput,
  FormGrid,
  Input,
  Label,
  PageHeader,
  PhoneInput,
  SimpleFormField as FormField,
  StatusBadge,
  Switch,
  Textarea,
  TIME_FORMAT_OPTIONS,
  cn,
  currencyAdornment,
  setDateTimePrefs,
  toastError,
  toastSuccess,
  type ComboboxOption,
  type DateFormatId,
  type TimeFormatId,
} from '@wayrune/ui';
import { api } from '../api';
import { useAuth } from '../auth';
import { Can } from '../components/Can';
import { CAP } from '../lib/capabilities';
import { usePermissions } from '../lib/permissions';
import { PlaceSinglePicker } from '../components/places/PlacePicker';
import { OrganizationProfileForm } from '../components/commerce/OrganizationProfileForm';
import { PoliciesPanel } from '../components/commerce/PoliciesPanel';
import { AccessManagementPanel } from '../components/settings/AccessManagementPanel';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAdvancedToolsPreference } from '../hooks/useProgressiveDisclosure';
import { AGENCY_ROUTES } from '../lib/agencyRoutes';
import { orgKindLabel } from '../lib/orgKind';
import type { PlaceRef } from '../lib/placeRefs';

type SettingsSection =
  | 'general'
  | 'workspaces'
  | 'organization'
  | 'branding'
  | 'business'
  | 'policies'
  | 'security'
  | 'inbox'
  | 'integrations'
  | 'lead-sources'
  | 'notifications'
  | 'privacy'
  | 'members';

type BrandingForm = {
  companyName: string;
  tagline: string;
  primaryColor: string;
  logoUrl: string;
  faviconUrl: string;
  previewFooter: string;
};

type BusinessForm = {
  legalName: string;
  gstin: string;
  pan: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  emergencyPhone: string;
  website: string;
  supportEmail: string;
};

type TrustForm = {
  licensed: boolean;
  yearsExperience: string;
  travellerCountLabel: string;
  support247: boolean;
  verifiedHotels: boolean;
  defaultCancellationNote: string;
};

type SecurityForm = {
  sessionTimeoutMinutes: number;
  requireMfa: boolean;
  allowPasswordLogin: boolean;
  passwordMinLength: number;
};

type NotificationsForm = {
  emailFromName: string;
  emailReplyTo: string;
  notifyOnLead: boolean;
  notifyOnQuoteAccept: boolean;
  notifyOnPayment: boolean;
  notifyOnIncident: boolean;
  notifyOnTask: boolean;
  notifyOnQuoteApproval: boolean;
  digestEnabled: boolean;
  digestCadence: 'daily' | 'weekly';
};

type PrivacyForm = {
  privacyPolicyUrl: string;
  termsUrl: string;
  cookieBanner: boolean;
  dataRetentionDays: number;
  marketingConsentDefault: boolean;
};

type ItineraryForm = {
  shareLinkDefaultDays: number;
  showAgencyFooter: boolean;
};

type DisplayForm = {
  dateFormat: DateFormatId;
  timeFormat: TimeFormatId;
};

const DATE_FORMAT_IDS = DATE_FORMAT_OPTIONS.map((o) => o.id) as DateFormatId[];
const TIME_FORMAT_IDS = TIME_FORMAT_OPTIONS.map((o) => o.id) as TimeFormatId[];

function asDateFormat(value: unknown): DateFormatId {
  return DATE_FORMAT_IDS.includes(value as DateFormatId)
    ? (value as DateFormatId)
    : DEFAULT_DATETIME_PREFS.dateFormat;
}

function asTimeFormat(value: unknown): TimeFormatId {
  return TIME_FORMAT_IDS.includes(value as TimeFormatId)
    ? (value as TimeFormatId)
    : DEFAULT_DATETIME_PREFS.timeFormat;
}

const SECTIONS: {
  id: SettingsSection;
  label: string;
  description: string;
  icon: typeof Settings;
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
    id: 'integrations',
    label: 'Integrations',
    description: 'SSO, CRM and inbound webhooks.',
    icon: Plug,
  },
  {
    id: 'lead-sources',
    label: 'Lead sources',
    description: 'Acquisition sources and round-robin assignment.',
    icon: Tags,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Email sender and alert preferences (drive in-app + SMTP email via worker).',
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

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'THB', 'AUD'];

const TAX_LABELS = ['GST', 'VAT', 'Sales Tax', 'None'];

const CURRENCY_LUCIDE: Partial<Record<string, LucideIcon>> = {
  INR: IndianRupee,
  USD: DollarSign,
  EUR: Euro,
  GBP: PoundSterling,
  AUD: DollarSign,
  SGD: DollarSign,
};

function currencyIcon(code: string): ComboboxOption['icon'] {
  const Lucide = CURRENCY_LUCIDE[code];
  if (Lucide) return Lucide;
  const symbol = currencyAdornment(code);
  return function CurrencyGlyph({ className }: { className?: string }) {
    return (
      <span
        className={cn(
          'inline-flex size-3.5 shrink-0 items-center justify-center text-[11px] font-semibold leading-none',
          className,
        )}
        aria-hidden
      >
        {symbol}
      </span>
    );
  };
}

const TIMEZONE_OPTIONS: ComboboxOption[] = TIMEZONES.map((tz) => ({
  value: tz,
  label: tz,
  icon: Clock,
}));

const CURRENCY_OPTIONS: ComboboxOption[] = CURRENCIES.map((c) => ({
  value: c,
  label: `${currencyAdornment(c)} ${c}`,
  icon: currencyIcon(c),
}));

const DATE_FORMAT_COMBO_OPTIONS: ComboboxOption[] = DATE_FORMAT_OPTIONS.map((opt) => ({
  value: opt.id,
  label: opt.label,
  icon: CalendarDays,
}));

const TIME_FORMAT_COMBO_OPTIONS: ComboboxOption[] = TIME_FORMAT_OPTIONS.map((opt) => ({
  value: opt.id,
  label: opt.label,
  icon: Clock,
}));

const TAX_LABEL_OPTIONS: ComboboxOption[] = TAX_LABELS.map((t) => ({
  value: t,
  label: t,
  icon: Percent,
}));

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

const WORKSPACE_KIND_OPTIONS: ComboboxOption[] = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'homestay', label: 'Homestay' },
  { value: 'farmstay', label: 'Farmstay' },
  { value: 'car_rental', label: 'Car rental' },
  { value: 'driver', label: 'Driver' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'dmc', label: 'DMC' },
  { value: 'travel_agency', label: 'Travel agency' },
  { value: 'other', label: 'Other' },
];

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border px-3 py-3 glass-well">
      <div className="min-w-0 space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function ComingSoonNote({ children }: { children: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border/70 px-4 py-3 text-xs leading-5 text-muted-foreground glass-well">
      {children}
    </p>
  );
}

export function SettingsPage({
  forcedSection,
  standalone = false,
}: {
  forcedSection?: SettingsSection;
  standalone?: boolean;
} = {}) {
  useDocumentTitle('Settings');
  const { me, refreshMe, switchOrganization } = useAuth();
  const { toOrgPath, navigate } = useOrgNavigate();
  const { hasAny } = usePermissions();
  const canUserManage = hasAny(CAP.userManage);
  const [showAdvancedByDefault, setShowAdvancedByDefault] = useAdvancedToolsPreference();
  const visibleSections = useMemo(
    () =>
      SECTIONS.filter((s) => {
        if (s.id === 'members') return canUserManage;
        // Integrations / lead sources live on their own routes (System nav).
        if (s.id === 'integrations') return false;
        if (s.id === 'lead-sources') return false;
        return true;
      }),
    [canUserManage],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get('section') as SettingsSection | null;
  const section: SettingsSection =
    forcedSection && visibleSections.some((s) => s.id === forcedSection)
      ? forcedSection
      : visibleSections.some((s) => s.id === sectionParam) && sectionParam
        ? sectionParam
        : 'general';
  const activeMeta = SECTIONS.find((s) => s.id === section)!;

  const [org, setOrg] = useState<any>(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [workspaceForm, setWorkspaceForm] = useState({
    name: '',
    kind: 'hotel',
    place: null as PlaceRef | null,
    contactEmail: '',
    contactPhone: '',
    capacityHint: '',
    discoverable: true,
  });

  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [currency, setCurrency] = useState('INR');
  const [taxLabel, setTaxLabel] = useState('GST');
  const [defaultTaxPercent, setDefaultTaxPercent] = useState(5);
  const [defaultMarkupPercent, setDefaultMarkupPercent] = useState(20);
  const [minMarginPercent, setMinMarginPercent] = useState(0);
  const [branding, setBranding] = useState<BrandingForm>({
    companyName: '',
    tagline: '',
    primaryColor: '#0f6e56',
    logoUrl: '',
    faviconUrl: '',
    previewFooter: '',
  });
  const [business, setBusiness] = useState<BusinessForm>({
    legalName: '',
    gstin: '',
    pan: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    emergencyPhone: '',
    website: '',
    supportEmail: '',
  });
  const [trust, setTrust] = useState<TrustForm>({
    licensed: false,
    yearsExperience: '',
    travellerCountLabel: '',
    support247: false,
    verifiedHotels: false,
    defaultCancellationNote: '',
  });
  const [security, setSecurity] = useState<SecurityForm>({
    sessionTimeoutMinutes: 480,
    requireMfa: false,
    allowPasswordLogin: true,
    passwordMinLength: 8,
  });
  const [notifications, setNotifications] = useState<NotificationsForm>({
    emailFromName: '',
    emailReplyTo: '',
    notifyOnLead: true,
    notifyOnQuoteAccept: true,
    notifyOnPayment: true,
    notifyOnIncident: true,
    notifyOnTask: true,
    notifyOnQuoteApproval: true,
    digestEnabled: false,
    digestCadence: 'daily',
  });
  const [privacy, setPrivacy] = useState<PrivacyForm>({
    privacyPolicyUrl: '',
    termsUrl: '',
    cookieBanner: false,
    dataRetentionDays: 730,
    marketingConsentDefault: false,
  });
  const [itinerary, setItinerary] = useState<ItineraryForm>({
    shareLinkDefaultDays: 30,
    showAgencyFooter: true,
  });
  const [display, setDisplay] = useState<DisplayForm>({ ...DEFAULT_DATETIME_PREFS });

  function hydrateFromOrg(o: any) {
    const settings = asRecord(o.settingsJson);
    const brandingJson = asRecord(o.brandingJson);
    const businessJson = asRecord(settings.business);
    const trustJson = asRecord(settings.trust);
    const securityJson = asRecord(settings.security);
    const notificationsJson = asRecord(settings.notifications);
    const privacyJson = asRecord(settings.privacy);
    const itineraryJson = asRecord(settings.itinerary);
    const displayJson = asRecord(settings.display);
    const nextDisplay: DisplayForm = {
      dateFormat: asDateFormat(displayJson.dateFormat),
      timeFormat: asTimeFormat(displayJson.timeFormat),
    };

    setOrg(o);
    setName(o.name || '');
    setTimezone(o.timezone || 'Asia/Kolkata');
    setCurrency(o.currency || 'INR');
    setTaxLabel(o.taxLabel || 'GST');
    setDefaultTaxPercent(num(settings.defaultTaxPercent, 5));
    setDefaultMarkupPercent(num(settings.defaultMarkupPercent, 20));
    setMinMarginPercent(num(settings.minMarginPercent, 0));
    setDisplay(nextDisplay);
    setDateTimePrefs(nextDisplay);
    setBranding({
      companyName: str(brandingJson.companyName, o.name || ''),
      tagline: str(brandingJson.tagline),
      primaryColor: str(brandingJson.primaryColor, '#0f6e56'),
      logoUrl: str(brandingJson.logoUrl),
      faviconUrl: str(brandingJson.faviconUrl),
      previewFooter: str(brandingJson.previewFooter),
    });
    setBusiness({
      legalName: str(businessJson.legalName, o.name || ''),
      gstin: str(businessJson.gstin),
      pan: str(businessJson.pan),
      address: str(businessJson.address),
      city: str(businessJson.city),
      state: str(businessJson.state),
      pincode: str(businessJson.pincode),
      phone: str(businessJson.phone),
      emergencyPhone: str(businessJson.emergencyPhone),
      website: str(businessJson.website),
      supportEmail: str(businessJson.supportEmail),
    });
    setTrust({
      licensed: bool(trustJson.licensed, false),
      yearsExperience:
        trustJson.yearsExperience != null && Number.isFinite(Number(trustJson.yearsExperience))
          ? String(trustJson.yearsExperience)
          : '',
      travellerCountLabel: str(trustJson.travellerCountLabel),
      support247: bool(trustJson.support247, false),
      verifiedHotels: bool(trustJson.verifiedHotels, false),
      defaultCancellationNote: str(trustJson.defaultCancellationNote),
    });
    setSecurity({
      sessionTimeoutMinutes: num(securityJson.sessionTimeoutMinutes, 480),
      requireMfa: bool(securityJson.requireMfa, false),
      allowPasswordLogin: bool(securityJson.allowPasswordLogin, true),
      passwordMinLength: num(securityJson.passwordMinLength, 8),
    });
    setNotifications({
      emailFromName: str(notificationsJson.emailFromName, o.name || ''),
      emailReplyTo: str(notificationsJson.emailReplyTo),
      notifyOnLead: bool(notificationsJson.notifyOnLead, true),
      notifyOnQuoteAccept: bool(notificationsJson.notifyOnQuoteAccept, true),
      notifyOnPayment: bool(notificationsJson.notifyOnPayment, true),
      notifyOnIncident: bool(notificationsJson.notifyOnIncident, true),
      notifyOnTask: bool(notificationsJson.notifyOnTask, true),
      notifyOnQuoteApproval: bool(notificationsJson.notifyOnQuoteApproval, true),
      digestEnabled: bool(notificationsJson.digestEnabled, false),
      digestCadence:
        notificationsJson.digestCadence === 'weekly' ? 'weekly' : 'daily',
    });
    setPrivacy({
      privacyPolicyUrl: str(privacyJson.privacyPolicyUrl),
      termsUrl: str(privacyJson.termsUrl),
      cookieBanner: bool(privacyJson.cookieBanner, false),
      dataRetentionDays: num(privacyJson.dataRetentionDays, 730),
      marketingConsentDefault: bool(privacyJson.marketingConsentDefault, false),
    });
    setItinerary({
      shareLinkDefaultDays: num(itineraryJson.shareLinkDefaultDays, 30),
      showAgencyFooter: bool(itineraryJson.showAgencyFooter, true),
    });
  }

  useEffect(() => {
    api('/organizations/current')
      .then((o) => {
        hydrateFromOrg(o);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Could not load settings';
        setLoadError(msg);
        toastError(msg);
      });
  }, []);

  function setSection(next: SettingsSection) {
    if (next === 'inbox') {
      navigate(AGENCY_ROUTES.settingsInbox);
      return;
    }
    const params = new URLSearchParams(searchParams);
    if (next === 'general') params.delete('section');
    else params.set('section', next);
    setSearchParams(params, { replace: true });
  }

  async function createWorkspace() {
    if (!workspaceForm.name.trim()) {
      toastError('Organization name is required');
      return;
    }
    const isPartner =
      workspaceForm.kind !== 'travel_agency' && workspaceForm.kind !== 'dmc';
    if (isPartner && !workspaceForm.place?.placeId) {
      toastError('Select a city for this partner workspace');
      return;
    }
    setCreatingWorkspace(true);
    try {
      const created = await api<{ id: string; name: string; kind: string }>('/organizations', {
        method: 'POST',
        body: JSON.stringify({
          name: workspaceForm.name.trim(),
          kind: workspaceForm.kind,
          city: workspaceForm.place?.name || null,
          placeId: workspaceForm.place?.placeId || null,
          contactEmail: workspaceForm.contactEmail.trim() || null,
          contactPhone: workspaceForm.contactPhone.trim() || null,
          capacityHint: workspaceForm.capacityHint.trim() || null,
          discoverable: isPartner ? workspaceForm.discoverable : false,
        }),
      });
      toastSuccess(`Created ${orgKindLabel(created.kind)} workspace`);
      setWorkspaceForm({
        name: '',
        kind: 'hotel',
        place: null,
        contactEmail: '',
        contactPhone: '',
        capacityHint: '',
        discoverable: true,
      });
      await refreshMe();
      await switchOrganization(created.id);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create workspace');
      setCreatingWorkspace(false);
    }
  }

  const patchBody = useMemo(() => {
    if (section === 'general') {
      return {
        timezone,
        currency,
        taxLabel,
        settingsJson: {
          defaultTaxPercent,
          defaultMarkupPercent,
          minMarginPercent,
          itinerary,
          display,
        },
      };
    }
    if (section === 'organization') {
      return { name };
    }
    if (section === 'branding') {
      return { brandingJson: branding };
    }
    if (section === 'business') {
      const years = Number(trust.yearsExperience);
      return {
        settingsJson: {
          business,
          trust: {
            licensed: trust.licensed,
            yearsExperience:
              trust.yearsExperience.trim() && Number.isFinite(years) ? years : null,
            travellerCountLabel: trust.travellerCountLabel.trim() || null,
            support247: trust.support247,
            verifiedHotels: trust.verifiedHotels,
            defaultCancellationNote: trust.defaultCancellationNote.trim() || null,
          },
        },
      };
    }
    if (section === 'security') {
      return { settingsJson: { security } };
    }
    if (section === 'notifications') {
      return { settingsJson: { notifications } };
    }
    if (section === 'privacy') {
      return { settingsJson: { privacy } };
    }
    return null;
  }, [
    section,
    timezone,
    currency,
    taxLabel,
    defaultTaxPercent,
    defaultMarkupPercent,
    minMarginPercent,
    itinerary,
    display,
    name,
    branding,
    business,
    trust,
    security,
    notifications,
    privacy,
  ]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!patchBody) return;
    setSaving(true);
    try {
      const updated = await api('/organizations/current', {
        method: 'PATCH',
        body: JSON.stringify(patchBody),
      });
      hydrateFromOrg(updated);
      if (section === 'general') {
        await refreshMe();
      }
      toastSuccess('Settings saved');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <p className="text-sm text-destructive">{loadError}</p>;
  if (!org) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!forcedSection && searchParams.get('section') === 'audit') {
    return <Navigate to={toOrgPath(AGENCY_ROUTES.settingsAudit)} replace />;
  }
  if (!forcedSection && searchParams.get('section') === 'access') {
    return <Navigate to={toOrgPath(AGENCY_ROUTES.teamMembers)} replace />;
  }
  if (!forcedSection && searchParams.get('section') === 'members') {
    return <Navigate to={toOrgPath(AGENCY_ROUTES.teamMembers)} replace />;
  }
  if (!forcedSection && searchParams.get('section') === 'inbox') {
    return <Navigate to={toOrgPath(AGENCY_ROUTES.settingsInbox)} replace />;
  }
  if (!forcedSection && searchParams.get('section') === 'integrations') {
    return <Navigate to={toOrgPath(AGENCY_ROUTES.settingsIntegrations)} replace />;
  }
  if (!forcedSection && searchParams.get('section') === 'lead-sources') {
    return <Navigate to={toOrgPath(AGENCY_ROUTES.settingsLeadSources)} replace />;
  }

  const sectionMeta = SECTIONS.find((s) => s.id === section)!;
  const pageTitle = standalone && forcedSection ? sectionMeta.label : 'Settings';
  const pageSubtitle =
    standalone && forcedSection
      ? sectionMeta.description
      : 'Configure your agency identity, compliance, security and integrations.';

  return (
    <div>
      <PageHeader
        icon={standalone && forcedSection ? sectionMeta.icon : Settings}
        title={pageTitle}
        subtitle={pageSubtitle}
      />

      <div
        className={
          standalone
            ? 'mt-4'
            : 'grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]'
        }
      >
        {standalone ? null : (
        <nav className="h-fit space-y-1 rounded-2xl border p-2 glass-panel lg:sticky lg:top-4">
          {visibleSections.map((item) => {
            const Icon = item.icon;
            const active = item.id === section;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
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
        )}

        <Card className="min-w-0 max-w-4xl">
          <CardContent className="space-y-5 p-5">
            {standalone ? null : (
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-tight">{activeMeta.label}</h2>
              <p className="text-sm text-muted-foreground">{activeMeta.description}</p>
            </div>
            )}

            {section === 'workspaces' ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Your workspaces</p>
                  <p className="text-xs text-muted-foreground">
                    Same login can own an agency and partner businesses. Use the switcher at the top
                    after you have more than one.
                  </p>
                  <ul className="divide-y overflow-hidden rounded-xl border glass-well">
                    {(me?.memberships?.length
                      ? me.memberships
                      : me?.organization
                        ? [
                            {
                              organizationId: me.organization.id,
                              name: me.organization.name,
                              kind: me.organization.kind || 'travel_agency',
                              slug: me.organization.slug,
                            },
                          ]
                        : []
                    ).map((m) => {
                      const active = m.organizationId === me?.organization.id;
                      return (
                        <li
                          key={m.organizationId}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{m.name}</p>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <StatusBadge
                                value={m.kind || 'partner'}
                                label={orgKindLabel(m.kind)}
                                showIcon={false}
                              />
                              {active ? (
                                <span className="text-[11px] text-muted-foreground">Current</span>
                              ) : null}
                            </div>
                          </div>
                          {!active ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void switchOrganization(m.organizationId)}
                            >
                              Switch
                            </Button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="space-y-3 rounded-xl border border-border/70 p-4">
                  <div>
                    <p className="text-sm font-medium">Create another workspace</p>
                    <p className="text-xs text-muted-foreground">
                      Hotel, homestay, farmstay, cars, driver, restaurant — opens as that kind after
                      create.
                    </p>
                  </div>
                  <FormGrid>
                    <FormField label="Name" required className="sm:col-span-2">
                      <Input
                        value={workspaceForm.name}
                        onChange={(e) =>
                          setWorkspaceForm((f) => ({ ...f, name: e.target.value }))
                        }
                        placeholder="Mayfair Spa Resort"
                      />
                    </FormField>
                    <FormField label="Type" required>
                      <Combobox
                        options={WORKSPACE_KIND_OPTIONS}
                        value={workspaceForm.kind}
                        onChange={(kind) => setWorkspaceForm((f) => ({ ...f, kind }))}
                        searchable
                        searchPlaceholder="Search type…"
                      />
                    </FormField>
                    {workspaceForm.kind !== 'travel_agency' &&
                    workspaceForm.kind !== 'dmc' ? (
                      <PlaceSinglePicker
                        label="City"
                        required
                        kind="city"
                        value={workspaceForm.place}
                        onChange={(place) => setWorkspaceForm((f) => ({ ...f, place }))}
                        placeholder="Search city…"
                      />
                    ) : null}
                    {workspaceForm.kind !== 'travel_agency' &&
                    workspaceForm.kind !== 'dmc' ? (
                      <>
                        <FormField label="B2B email">
                          <EmailInput
                            value={workspaceForm.contactEmail}
                            onChange={(contactEmail) =>
                              setWorkspaceForm((f) => ({ ...f, contactEmail }))
                            }
                            placeholder="sales@hotel.com"
                          />
                        </FormField>
                        <FormField label="B2B phone">
                          <PhoneInput
                            value={workspaceForm.contactPhone}
                            onChange={(contactPhone) =>
                              setWorkspaceForm((f) => ({ ...f, contactPhone }))
                            }
                          />
                        </FormField>
                        <FormField label="Capacity hint" className="sm:col-span-2">
                          <Input
                            value={workspaceForm.capacityHint}
                            onChange={(e) =>
                              setWorkspaceForm((f) => ({
                                ...f,
                                capacityHint: e.target.value,
                              }))
                            }
                            placeholder="24 rooms · groups OK"
                          />
                        </FormField>
                        <div className="flex items-start gap-2 sm:col-span-2">
                          <Checkbox
                            id="workspace-discoverable"
                            checked={workspaceForm.discoverable}
                            onCheckedChange={(checked) =>
                              setWorkspaceForm((f) => ({
                                ...f,
                                discoverable: checked === true,
                              }))
                            }
                          />
                          <label
                            htmlFor="workspace-discoverable"
                            className="cursor-pointer text-sm leading-snug"
                          >
                            <span className="font-medium">Discoverable on Network</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              Agencies can find this workspace when browsing partners.
                            </span>
                          </label>
                        </div>
                      </>
                    ) : null}
                  </FormGrid>
                  <Button
                    type="button"
                    disabled={creatingWorkspace}
                    onClick={() => void createWorkspace()}
                  >
                    {creatingWorkspace ? 'Creating…' : 'Create & switch'}
                  </Button>
                </div>
              </div>
            ) : section === 'members' ? (
              <AccessManagementPanel active={section === 'members'} />
            ) : section === 'policies' ? (
              <PoliciesPanel />
            ) : (
              <form onSubmit={onSave} className="space-y-6">
                {section === 'general' ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="Timezone" required>
                        <Combobox
                          options={
                            TIMEZONES.includes(timezone)
                              ? TIMEZONE_OPTIONS
                              : [{ value: timezone, label: timezone, icon: Clock }, ...TIMEZONE_OPTIONS]
                          }
                          value={timezone}
                          onChange={setTimezone}
                          searchable
                          searchPlaceholder="Search timezone…"
                        />
                      </FormField>
                      <FormField label="Currency" required>
                        <Combobox
                          options={
                            CURRENCIES.includes(currency)
                              ? CURRENCY_OPTIONS
                              : [
                                  {
                                    value: currency,
                                    label: `${currencyAdornment(currency)} ${currency}`,
                                    icon: currencyIcon(currency),
                                  },
                                  ...CURRENCY_OPTIONS,
                                ]
                          }
                          value={currency}
                          onChange={setCurrency}
                        />
                      </FormField>
                      <FormField label="Date format" required>
                        <Combobox
                          options={DATE_FORMAT_COMBO_OPTIONS}
                          value={display.dateFormat}
                          onChange={(v) =>
                            setDisplay((prev) => ({
                              ...prev,
                              dateFormat: asDateFormat(v),
                            }))
                          }
                        />
                      </FormField>
                      <FormField label="Time format" required>
                        <Combobox
                          options={TIME_FORMAT_COMBO_OPTIONS}
                          value={display.timeFormat}
                          onChange={(v) =>
                            setDisplay((prev) => ({
                              ...prev,
                              timeFormat: asTimeFormat(v),
                            }))
                          }
                        />
                      </FormField>
                      <FormField
                        label="Show advanced tools by default"
                        description="Keeps cost, margin, and CRM metadata sections expanded across agency workspaces."
                        className="sm:col-span-2"
                      >
                        <div className="flex items-center gap-3 pt-1">
                          <Switch
                            checked={showAdvancedByDefault}
                            onCheckedChange={setShowAdvancedByDefault}
                            aria-label="Show advanced tools by default"
                          />
                          <span className="text-sm text-muted-foreground">
                            {showAdvancedByDefault ? 'Advanced sections start open' : 'Advanced sections stay collapsed'}
                          </span>
                        </div>
                      </FormField>
                      <FormField label="Tax label" required>
                        <Combobox
                          options={
                            TAX_LABELS.includes(taxLabel)
                              ? TAX_LABEL_OPTIONS
                              : [{ value: taxLabel, label: taxLabel, icon: Percent }, ...TAX_LABEL_OPTIONS]
                          }
                          value={taxLabel}
                          onChange={setTaxLabel}
                        />
                      </FormField>
                      <FormField label="Default tax %" required>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={defaultTaxPercent}
                          onChange={(e) => setDefaultTaxPercent(Number(e.target.value))}
                          required
                        />
                      </FormField>
                      <FormField
                        label="Default markup %"
                        description="Sell = cost × (1 + markup/100) when pricing from the rate directory."
                      >
                        <Input
                          type="number"
                          min={0}
                          max={500}
                          step={0.5}
                          value={defaultMarkupPercent}
                          onChange={(e) =>
                            setDefaultMarkupPercent(Number(e.target.value))
                          }
                        />
                      </FormField>
                      <FormField
                        label="Minimum margin %"
                        description="Lines below this margin on sell need below-margin approval before send. 0 = only block sell-below-cost."
                      >
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={minMarginPercent}
                          onChange={(e) =>
                            setMinMarginPercent(Number(e.target.value))
                          }
                        />
                      </FormField>
                      <FormField label="Share link default (days)">
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          value={itinerary.shareLinkDefaultDays}
                          onChange={(e) =>
                            setItinerary((prev) => ({
                              ...prev,
                              shareLinkDefaultDays: Number(e.target.value),
                            }))
                          }
                        />
                      </FormField>
                    </div>
                    <ToggleRow
                      label="Show agency footer on client itineraries"
                      description="Adds your brand line under shared and preview pages."
                      checked={itinerary.showAgencyFooter}
                      onCheckedChange={(checked) =>
                        setItinerary((prev) => ({ ...prev, showAgencyFooter: checked }))
                      }
                    />
                  </>
                ) : null}

                {section === 'organization' ? (
                  <>
                    <FormField label="Organization name" required>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your agency name"
                        required
                      />
                    </FormField>
                    <dl className="grid gap-2 rounded-xl border px-3 py-3 text-sm glass-well">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Public code</dt>
                        <dd className="font-medium tabular-nums">
                          {me?.organization.publicCode ?? '—'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Slug</dt>
                        <dd className="font-medium tabular-nums">{org.slug}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Subdomain</dt>
                        <dd className="font-medium text-right">
                          {me?.organization.subdomain
                            ? `${me.organization.subdomain}.${(import.meta.env.VITE_SITE_BASE_DOMAIN as string | undefined) || 'codepoetry.app'}`
                            : '—'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Custom domain</dt>
                        <dd className="font-medium text-right text-muted-foreground">
                          {me?.organization.customDomain || 'Not set'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Kind</dt>
                        <dd className="font-medium">{String(org.kind || 'travel_agency')}</dd>
                      </div>
                    </dl>
                    <ComingSoonNote>
                      Custom domain DNS/SSL verification ships later. Open Website pages from the
                      sidebar — URLs use your public org code like HubSpot HubID.
                    </ComingSoonNote>
                  </>
                ) : null}

                {section === 'branding' ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="Display name">
                        <Input
                          value={branding.companyName}
                          onChange={(e) =>
                            setBranding((prev) => ({ ...prev, companyName: e.target.value }))
                          }
                          placeholder="Shown on proposals and itineraries"
                        />
                      </FormField>
                      <FormField label="Primary color">
                        <div className="flex gap-2">
                          <Input
                            type="color"
                            className="h-10 w-14 cursor-pointer p-1"
                            value={branding.primaryColor || '#0f6e56'}
                            onChange={(e) =>
                              setBranding((prev) => ({ ...prev, primaryColor: e.target.value }))
                            }
                          />
                          <Input
                            value={branding.primaryColor}
                            onChange={(e) =>
                              setBranding((prev) => ({ ...prev, primaryColor: e.target.value }))
                            }
                            placeholder="#0f6e56"
                          />
                        </div>
                      </FormField>
                      <FormField label="Tagline" className="sm:col-span-2">
                        <Input
                          value={branding.tagline}
                          onChange={(e) =>
                            setBranding((prev) => ({ ...prev, tagline: e.target.value }))
                          }
                          placeholder="Crafted journeys, locally led"
                        />
                      </FormField>
                      <FormField label="Logo URL">
                        <Input
                          value={branding.logoUrl}
                          onChange={(e) =>
                            setBranding((prev) => ({ ...prev, logoUrl: e.target.value }))
                          }
                          placeholder="https://…"
                        />
                      </FormField>
                      <FormField label="Favicon URL">
                        <Input
                          value={branding.faviconUrl}
                          onChange={(e) =>
                            setBranding((prev) => ({ ...prev, faviconUrl: e.target.value }))
                          }
                          placeholder="https://…"
                        />
                      </FormField>
                      <FormField label="Client preview footer" className="sm:col-span-2">
                        <Textarea
                          value={branding.previewFooter}
                          onChange={(e) =>
                            setBranding((prev) => ({ ...prev, previewFooter: e.target.value }))
                          }
                          placeholder="Questions? Reply to this email or WhatsApp us."
                          rows={3}
                        />
                      </FormField>
                    </div>
                    <ComingSoonNote>
                      Image upload for logo/favicon is coming soon — paste hosted URLs for now.
                    </ComingSoonNote>
                  </>
                ) : null}

                {section === 'business' ? (
                  <div className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="Legal name" className="sm:col-span-2">
                        <Input
                          value={business.legalName}
                          onChange={(e) =>
                            setBusiness((prev) => ({ ...prev, legalName: e.target.value }))
                          }
                        />
                      </FormField>
                      <FormField label="GSTIN">
                        <Input
                          value={business.gstin}
                          onChange={(e) =>
                            setBusiness((prev) => ({ ...prev, gstin: e.target.value }))
                          }
                          placeholder="22AAAAA0000A1Z5"
                        />
                      </FormField>
                      <FormField label="PAN">
                        <Input
                          value={business.pan}
                          onChange={(e) => setBusiness((prev) => ({ ...prev, pan: e.target.value }))}
                          placeholder="AAAAA0000A"
                        />
                      </FormField>
                      <FormField label="Address" className="sm:col-span-2">
                        <Textarea
                          value={business.address}
                          onChange={(e) =>
                            setBusiness((prev) => ({ ...prev, address: e.target.value }))
                          }
                          rows={2}
                        />
                      </FormField>
                      <FormField label="City">
                        <Input
                          value={business.city}
                          onChange={(e) =>
                            setBusiness((prev) => ({ ...prev, city: e.target.value }))
                          }
                        />
                      </FormField>
                      <FormField label="State">
                        <Input
                          value={business.state}
                          onChange={(e) =>
                            setBusiness((prev) => ({ ...prev, state: e.target.value }))
                          }
                        />
                      </FormField>
                      <FormField label="PIN code">
                        <Input
                          value={business.pincode}
                          onChange={(e) =>
                            setBusiness((prev) => ({ ...prev, pincode: e.target.value }))
                          }
                        />
                      </FormField>
                      <FormField label="Phone">
                        <Input
                          value={business.phone}
                          onChange={(e) =>
                            setBusiness((prev) => ({ ...prev, phone: e.target.value }))
                          }
                        />
                      </FormField>
                      <FormField label="Emergency phone (24×7)">
                        <Input
                          value={business.emergencyPhone}
                          onChange={(e) =>
                            setBusiness((prev) => ({ ...prev, emergencyPhone: e.target.value }))
                          }
                          placeholder="Falls back to main phone if empty"
                        />
                      </FormField>
                      <FormField label="Website">
                        <Input
                          value={business.website}
                          onChange={(e) =>
                            setBusiness((prev) => ({ ...prev, website: e.target.value }))
                          }
                          placeholder="https://"
                        />
                      </FormField>
                      <FormField label="Support email">
                        <Input
                          type="email"
                          value={business.supportEmail}
                          onChange={(e) =>
                            setBusiness((prev) => ({ ...prev, supportEmail: e.target.value }))
                          }
                        />
                      </FormField>
                    </div>

                    <div className="space-y-3 border-t pt-4">
                      <div>
                        <h3 className="text-sm font-semibold">Proposal trust signals</h3>
                        <p className="text-xs text-muted-foreground">
                          Shown on customer proposals when filled — only non-empty items appear.
                        </p>
                      </div>
                      <ToggleRow
                        label="Licensed agency"
                        checked={trust.licensed}
                        onCheckedChange={(checked) =>
                          setTrust((prev) => ({ ...prev, licensed: checked }))
                        }
                      />
                      <ToggleRow
                        label="24×7 support"
                        checked={trust.support247}
                        onCheckedChange={(checked) =>
                          setTrust((prev) => ({ ...prev, support247: checked }))
                        }
                      />
                      <ToggleRow
                        label="Verified hotels"
                        checked={trust.verifiedHotels}
                        onCheckedChange={(checked) =>
                          setTrust((prev) => ({ ...prev, verifiedHotels: checked }))
                        }
                      />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField label="Years of experience">
                          <Input
                            type="number"
                            min={1}
                            value={trust.yearsExperience}
                            onChange={(e) =>
                              setTrust((prev) => ({ ...prev, yearsExperience: e.target.value }))
                            }
                            placeholder="12"
                          />
                        </FormField>
                        <FormField label="Happy travellers">
                          <Input
                            value={trust.travellerCountLabel}
                            onChange={(e) =>
                              setTrust((prev) => ({
                                ...prev,
                                travellerCountLabel: e.target.value,
                              }))
                            }
                            placeholder="5000+"
                          />
                        </FormField>
                      </div>
                      <FormField label="Default cancellation policy">
                        <Textarea
                          value={trust.defaultCancellationNote}
                          onChange={(e) =>
                            setTrust((prev) => ({
                              ...prev,
                              defaultCancellationNote: e.target.value,
                            }))
                          }
                          rows={3}
                          placeholder="Free cancellation up to 15 days before travel; thereafter per hotel rules."
                        />
                      </FormField>
                    </div>

                    <div className="space-y-3 border-t pt-4">
                      <p className="text-xs text-muted-foreground">
                        Portfolio profile (city, phone, public bio) is managed below for partner
                        organizations.
                      </p>
                      <OrganizationProfileForm />
                    </div>
                  </div>
                ) : null}

                {section === 'security' ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="Session timeout (minutes)">
                        <Input
                          type="number"
                          min={15}
                          max={10080}
                          value={security.sessionTimeoutMinutes}
                          onChange={(e) =>
                            setSecurity((prev) => ({
                              ...prev,
                              sessionTimeoutMinutes: Number(e.target.value),
                            }))
                          }
                        />
                      </FormField>
                      <FormField label="Minimum password length">
                        <Input
                          type="number"
                          min={8}
                          max={128}
                          value={security.passwordMinLength}
                          onChange={(e) =>
                            setSecurity((prev) => ({
                              ...prev,
                              passwordMinLength: Number(e.target.value),
                            }))
                          }
                        />
                      </FormField>
                    </div>
                    <ToggleRow
                      label="Allow password login"
                      description="Disable only when SSO is fully rolled out."
                      checked={security.allowPasswordLogin}
                      onCheckedChange={(checked) =>
                        setSecurity((prev) => ({ ...prev, allowPasswordLogin: checked }))
                      }
                    />
                    <ToggleRow
                      label="Require MFA for all members"
                      description="Stored preference — MFA enrollment ships next."
                      checked={security.requireMfa}
                      onCheckedChange={(checked) =>
                        setSecurity((prev) => ({ ...prev, requireMfa: checked }))
                      }
                    />
                    <ComingSoonNote>
                      Enforcement for MFA and session expiry will hook into auth in a follow-up.
                    </ComingSoonNote>
                  </>
                ) : null}

                {section === 'notifications' ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="From name">
                        <Input
                          value={notifications.emailFromName}
                          onChange={(e) =>
                            setNotifications((prev) => ({
                              ...prev,
                              emailFromName: e.target.value,
                            }))
                          }
                        />
                      </FormField>
                      <FormField label="Reply-to email">
                        <Input
                          type="email"
                          value={notifications.emailReplyTo}
                          onChange={(e) =>
                            setNotifications((prev) => ({
                              ...prev,
                              emailReplyTo: e.target.value,
                            }))
                          }
                        />
                      </FormField>
                    </div>
                    <ToggleRow
                      label="Notify on new lead"
                      checked={notifications.notifyOnLead}
                      onCheckedChange={(checked) =>
                        setNotifications((prev) => ({ ...prev, notifyOnLead: checked }))
                      }
                    />
                    <ToggleRow
                      label="Notify when a quote is accepted"
                      checked={notifications.notifyOnQuoteAccept}
                      onCheckedChange={(checked) =>
                        setNotifications((prev) => ({ ...prev, notifyOnQuoteAccept: checked }))
                      }
                    />
                    <ToggleRow
                      label="Notify on payment recorded"
                      checked={notifications.notifyOnPayment}
                      onCheckedChange={(checked) =>
                        setNotifications((prev) => ({ ...prev, notifyOnPayment: checked }))
                      }
                    />
                    <ToggleRow
                      label="Notify on service incident"
                      checked={notifications.notifyOnIncident}
                      onCheckedChange={(checked) =>
                        setNotifications((prev) => ({ ...prev, notifyOnIncident: checked }))
                      }
                    />
                    <ToggleRow
                      label="Notify when a task is assigned"
                      checked={notifications.notifyOnTask}
                      onCheckedChange={(checked) =>
                        setNotifications((prev) => ({ ...prev, notifyOnTask: checked }))
                      }
                    />
                    <ToggleRow
                      label="Notify when a quote needs approval"
                      checked={notifications.notifyOnQuoteApproval}
                      onCheckedChange={(checked) =>
                        setNotifications((prev) => ({
                          ...prev,
                          notifyOnQuoteApproval: checked,
                        }))
                      }
                    />
                    <ToggleRow
                      label="Ops digest for owners (email + in-app)"
                      checked={notifications.digestEnabled}
                      onCheckedChange={(checked) =>
                        setNotifications((prev) => ({ ...prev, digestEnabled: checked }))
                      }
                    />
                    {notifications.digestEnabled ? (
                      <FormField label="Digest cadence">
                        <Combobox
                          options={[
                            { value: 'daily', label: 'Daily' },
                            { value: 'weekly', label: 'Weekly' },
                          ]}
                          value={notifications.digestCadence}
                          onChange={(digestCadence) =>
                            setNotifications((prev) => ({
                              ...prev,
                              digestCadence: digestCadence as 'daily' | 'weekly',
                            }))
                          }
                        />
                      </FormField>
                    ) : null}
                  </>
                ) : null}

                {section === 'privacy' ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="Privacy policy URL" className="sm:col-span-2">
                        <Input
                          value={privacy.privacyPolicyUrl}
                          onChange={(e) =>
                            setPrivacy((prev) => ({ ...prev, privacyPolicyUrl: e.target.value }))
                          }
                          placeholder="https://"
                        />
                      </FormField>
                      <FormField label="Terms of service URL" className="sm:col-span-2">
                        <Input
                          value={privacy.termsUrl}
                          onChange={(e) =>
                            setPrivacy((prev) => ({ ...prev, termsUrl: e.target.value }))
                          }
                          placeholder="https://"
                        />
                      </FormField>
                      <FormField label="Data retention (days)">
                        <Input
                          type="number"
                          min={30}
                          max={3650}
                          value={privacy.dataRetentionDays}
                          onChange={(e) =>
                            setPrivacy((prev) => ({
                              ...prev,
                              dataRetentionDays: Number(e.target.value),
                            }))
                          }
                        />
                      </FormField>
                    </div>
                    <ToggleRow
                      label="Show cookie / consent banner on public pages"
                      checked={privacy.cookieBanner}
                      onCheckedChange={(checked) =>
                        setPrivacy((prev) => ({ ...prev, cookieBanner: checked }))
                      }
                    />
                    <ToggleRow
                      label="Default marketing consent to opt-in"
                      description="Only enable where local consent rules allow."
                      checked={privacy.marketingConsentDefault}
                      onCheckedChange={(checked) =>
                        setPrivacy((prev) => ({ ...prev, marketingConsentDefault: checked }))
                      }
                    />
                  </>
                ) : null}

                <Can anyOf={CAP.orgSettingsWrite}>
                  <div className="border-t border-border/60 pt-5">
                    <Button type="submit" disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </Can>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

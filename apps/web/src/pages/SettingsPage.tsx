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
  Info,
  MonitorCog,
  Moon,
  Network,
  Paintbrush,
  PanelLeftClose,
  Percent,
  Plug,
  PoundSterling,
  Scale,
  Settings,
  Shield,
  Sun,
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
  NumberField,
  PageSkeleton,
  PageStack,
  SectionStack,
  PhoneInput,
  PriceField,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  Switch,
  Textarea,
  TIME_FORMAT_OPTIONS,
  cn,
  currencyAdornment,
  setDateTimePrefs,
  toastError,
  toastSuccess,
  usePageChrome,
  useUiPrefs,
  type ComboboxOption,
  type DateFormatId,
  type Density,
  type FontScale,
  type GlassPreference,
  type MotionPreference,
  type TimeFormatId,
  type Theme,
  COLOR_THEME_OPTIONS,
} from '@wayrune/ui';
import { api } from '../api';
import {
  formatOrgFxRatesMetaCue,
  formatOrgFxRefreshToast,
  type OrgFxRatesMetaCue,
} from '../lib/orgFxRefresh';
import { useAuth } from '../auth';
import { Can } from '../components/Can';
import { CAP } from '../lib/capabilities';
import { usePermissions } from '../lib/permissions';
import { PlaceSinglePicker } from '../components/places/PlacePicker';
import { OrganizationProfileForm } from '../components/commerce/OrganizationProfileForm';
import { PoliciesPanel } from '../components/commerce/PoliciesPanel';
import { AccessManagementPanel } from '../components/settings/AccessManagementPanel';
import { AboutReleaseNotesPanel } from '../components/agency/AboutReleaseNotesPanel';
import { type MarkupPreset, normalizeMarkupPresets } from '../lib/markupPresets';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAdvancedToolsPreference } from '../hooks/useProgressiveDisclosure';
import { AGENCY_ROUTES } from '../lib/agencyRoutes';
import { orgKindLabel } from '../lib/orgKind';
import type { PlaceRef } from '../lib/placeRefs';

type SettingsSection =
  | 'general'
  | 'appearance'
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
  | 'members'
  | 'about';

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
  placeOfSupply: string;
  destinationPlaceOfSupply: string;
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

type OrgAppearanceForm = {
  theme: Theme;
  colorTheme: (typeof COLOR_THEME_OPTIONS)[number]['id'];
  highContrast: boolean;
  customAccent: string;
  glass: GlassPreference;
};

const DATE_FORMAT_IDS = DATE_FORMAT_OPTIONS.map((o) => o.id) as DateFormatId[];
const TIME_FORMAT_IDS = TIME_FORMAT_OPTIONS.map((o) => o.id) as TimeFormatId[];
const APPEARANCE_THEME_OPTIONS: Array<{ value: Theme; label: string; description: string }> = [
  { value: 'light', label: 'Light', description: 'Bright surfaces for daytime work.' },
  { value: 'dark', label: 'Dark', description: 'Lower-glare shell for long ops sessions.' },
  { value: 'system', label: 'System', description: 'Follow your device appearance.' },
];
const APPEARANCE_DENSITY_OPTIONS: Array<{ value: Density; label: string; description: string }> = [
  { value: 'compact', label: 'Compact', description: 'Current tight workspace density.' },
  { value: 'comfortable', label: 'Comfortable', description: 'Adds breathing room to panels and forms.' },
  { value: 'spacious', label: 'Spacious', description: 'Largest spacing for more relaxed scanning.' },
];
const APPEARANCE_FONT_OPTIONS: Array<{ value: FontScale; label: string; description: string }> = [
  { value: 'small', label: 'Small', description: 'Slightly denser text for more on screen.' },
  { value: 'default', label: 'Default', description: 'Standard text scale.' },
  { value: 'large', label: 'Large', description: 'Easier reading without page zoom.' },
  { value: 'xlarge', label: 'Extra large', description: 'Maximum readable scale for long sessions.' },
];
const APPEARANCE_MOTION_OPTIONS: Array<{ value: MotionPreference; label: string; description: string }> =
  [
    { value: 'system', label: 'System', description: 'Follow your device motion preference.' },
    { value: 'reduce', label: 'Reduce', description: 'Minimize animation and transitions.' },
    { value: 'allow', label: 'Allow', description: 'Use the normal app motion.' },
  ];
const APPEARANCE_GLASS_OPTIONS: Array<{ value: GlassPreference; label: string; description: string }> = [
  {
    value: 'frosted',
    label: 'Frosted',
    description: 'Liquid glass panels — luminous rims, soft depth, vibrant blur.',
  },
  {
    value: 'solid',
    label: 'Solid',
    description: 'Opaque panels without blur — calmer and often snappier.',
  },
];

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
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme, color packs, contrast, density, motion, glass, and sidebar defaults.',
    icon: MonitorCog,
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
  {
    id: 'about',
    label: 'About',
    description: 'Claim-safe release notes for demos and onboarding.',
    icon: Info,
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

/** Mirrors API `DEFAULT_INR_PER_FOREIGN` — book currency per 1 foreign unit. */
const ORG_FX_CODES = ['USD', 'EUR', 'AED', 'GBP'] as const;
const ORG_FX_DEFAULTS: Record<(typeof ORG_FX_CODES)[number], number> = {
  USD: 83.25,
  EUR: 90.5,
  AED: 22.7,
  GBP: 105,
};

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
    <div className="flex items-start justify-between gap-[var(--gap-section)] rounded-xl border px-3 py-3 glass-well">
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
  const { me, refreshMe, switchOrganization, resetAppearanceToWorkspaceDefault } = useAuth();
  const {
    prefs,
    setTheme,
    setDensity,
    setFontScale,
    setMotion,
    setGlass,
    setColorTheme,
    setHighContrast,
    setCustomAccent,
    setSidebarCollapsedDefault,
  } = useUiPrefs();
  const { toOrgPath, navigate } = useOrgNavigate();
  const { hasAny } = usePermissions();
  const canUserManage = hasAny(CAP.userManage);
  const canOrgSettingsWrite = hasAny(CAP.orgSettingsWrite);
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
  const pageTitle = standalone && forcedSection ? activeMeta.label : 'Settings';
  const pageSubtitle =
    standalone && forcedSection
      ? activeMeta.description
      : 'Configure your agency identity, compliance, security and integrations.';
  usePageChrome({ title: pageTitle, subtitle: pageSubtitle });

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
  const [agentMarkupPercent, setAgentMarkupPercent] = useState(20);
  const [markupPresets, setMarkupPresets] = useState<MarkupPreset[]>([]);
  const [defaultQuoteValidityDays, setDefaultQuoteValidityDays] = useState(7);
  const [quoteValidityGraceHours, setQuoteValidityGraceHours] = useState(24);
  const [inboxAgingHours, setInboxAgingHours] = useState(4);
  const [firstTouchTargetHours, setFirstTouchTargetHours] = useState('');
  const [leadToQuoteTargetHours, setLeadToQuoteTargetHours] = useState('');
  const [fitBuildTargetMinutes, setFitBuildTargetMinutes] = useState('');
  const [minMarginPercent, setMinMarginPercent] = useState(0);
  const [fxRateInputs, setFxRateInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(ORG_FX_CODES.map((c) => [c, String(ORG_FX_DEFAULTS[c])])),
  );
  const [fxRatesMeta, setFxRatesMeta] = useState<OrgFxRatesMetaCue | null>(null);
  const [fxAutoRefreshEnabled, setFxAutoRefreshEnabled] = useState(true);
  const [refreshingFx, setRefreshingFx] = useState(false);
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
    placeOfSupply: '',
    destinationPlaceOfSupply: '',
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
  const [orgAppearance, setOrgAppearance] = useState<OrgAppearanceForm>({
    theme: 'light',
    colorTheme: 'wayrune',
    highContrast: false,
    customAccent: '#0f766e',
    glass: 'frosted',
  });

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
    const appearanceJson = asRecord(settings.appearance);
    const nextDisplay: DisplayForm = {
      dateFormat: asDateFormat(displayJson.dateFormat),
      timeFormat: asTimeFormat(displayJson.timeFormat),
    };
    const colorThemeRaw = str(appearanceJson.colorTheme);
    const themeRaw = str(appearanceJson.theme);
    const glassRaw = str(appearanceJson.glass);
    const accentRaw = str(appearanceJson.customAccent);
    setOrgAppearance({
      theme:
        themeRaw === 'light' || themeRaw === 'dark' || themeRaw === 'system'
          ? themeRaw
          : 'light',
      colorTheme: COLOR_THEME_OPTIONS.some((t) => t.id === colorThemeRaw)
        ? (colorThemeRaw as OrgAppearanceForm['colorTheme'])
        : 'wayrune',
      highContrast: Boolean(appearanceJson.highContrast),
      customAccent: /^#[0-9a-fA-F]{6}$/.test(accentRaw) ? accentRaw : '#0f766e',
      glass: glassRaw === 'solid' || glassRaw === 'frosted' ? glassRaw : 'frosted',
    });

    setOrg(o);
    setName(o.name || '');
    setTimezone(o.timezone || 'Asia/Kolkata');
    setCurrency(o.currency || 'INR');
    setTaxLabel(o.taxLabel || 'GST');
    setDefaultTaxPercent(num(settings.defaultTaxPercent, 5));
    setDefaultMarkupPercent(num(settings.defaultMarkupPercent, 20));
    setAgentMarkupPercent(
      settings.agentMarkupPercent != null
        ? num(settings.agentMarkupPercent, 20)
        : num(settings.defaultMarkupPercent, 20),
    );
    setMarkupPresets(normalizeMarkupPresets(settings.markupPresets));
    setDefaultQuoteValidityDays(num(settings.defaultQuoteValidityDays, 7));
    setQuoteValidityGraceHours(num(settings.quoteValidityGraceHours, 24));
    setInboxAgingHours(num(settings.inboxAgingHours, 4));
    setFirstTouchTargetHours(
      settings.firstTouchTargetHours != null && Number(settings.firstTouchTargetHours) > 0
        ? String(settings.firstTouchTargetHours)
        : '',
    );
    setLeadToQuoteTargetHours(
      settings.leadToQuoteTargetHours != null && Number(settings.leadToQuoteTargetHours) > 0
        ? String(settings.leadToQuoteTargetHours)
        : '',
    );
    setFitBuildTargetMinutes(
      settings.fitBuildTargetMinutes != null && Number(settings.fitBuildTargetMinutes) > 0
        ? String(settings.fitBuildTargetMinutes)
        : '',
    );
    setMinMarginPercent(num(settings.minMarginPercent, 0));
    {
      const fxRaw = asRecord(settings.fxRates);
      const nextFx: Record<string, string> = {};
      for (const code of ORG_FX_CODES) {
        const n = Number(fxRaw[code]);
        nextFx[code] =
          Number.isFinite(n) && n > 0 ? String(n) : String(ORG_FX_DEFAULTS[code]);
      }
      setFxRateInputs(nextFx);
      const metaRaw = asRecord(settings.fxRatesMeta);
      setFxRatesMeta(
        metaRaw.fetchedAt || metaRaw.asOf
          ? {
              fetchedAt: str(metaRaw.fetchedAt) || null,
              asOf: str(metaRaw.asOf) || null,
              source: str(metaRaw.source) || null,
              refreshed: Array.isArray(metaRaw.refreshed)
                ? metaRaw.refreshed.map(String)
                : null,
              skipped: Array.isArray(metaRaw.skipped)
                ? metaRaw.skipped.map(String)
                : null,
            }
          : null,
      );
      setFxAutoRefreshEnabled(settings.fxAutoRefreshEnabled !== false);
    }
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
      placeOfSupply: str(businessJson.placeOfSupply),
      destinationPlaceOfSupply: str(businessJson.destinationPlaceOfSupply),
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
      const fxRates: Record<string, number> = {};
      for (const code of ORG_FX_CODES) {
        const raw = (fxRateInputs[code] || '').trim();
        const n = raw ? Number(raw) : ORG_FX_DEFAULTS[code];
        fxRates[code] = Number.isFinite(n) && n > 0 ? n : ORG_FX_DEFAULTS[code];
      }
      const optionalTarget = (raw: string, max: number): number | null => {
        const t = raw.trim();
        if (!t) return null;
        const n = Number(t);
        if (!Number.isFinite(n) || n <= 0 || n > max) return null;
        return n;
      };
      return {
        timezone,
        currency,
        taxLabel,
        settingsJson: {
          defaultTaxPercent,
          defaultMarkupPercent,
          agentMarkupPercent,
          markupPresets,
          defaultQuoteValidityDays,
          quoteValidityGraceHours,
          inboxAgingHours,
          firstTouchTargetHours: optionalTarget(firstTouchTargetHours, 168),
          leadToQuoteTargetHours: optionalTarget(leadToQuoteTargetHours, 720),
          fitBuildTargetMinutes: optionalTarget(fitBuildTargetMinutes, 1440),
          minMarginPercent,
          fxRates,
          fxAutoRefreshEnabled,
          itinerary,
          display,
        },
      };
    }
    if (section === 'organization') {
      return { name };
    }
    if (section === 'branding') {
      return {
        brandingJson: branding,
        settingsJson: {
          appearance: {
            theme: orgAppearance.theme,
            colorTheme: orgAppearance.colorTheme,
            highContrast: orgAppearance.highContrast,
            customAccent:
              orgAppearance.colorTheme === 'custom' ? orgAppearance.customAccent : undefined,
            glass: orgAppearance.glass,
          },
        },
      };
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
    agentMarkupPercent,
    markupPresets,
    defaultQuoteValidityDays,
    quoteValidityGraceHours,
    inboxAgingHours,
    firstTouchTargetHours,
    leadToQuoteTargetHours,
    fitBuildTargetMinutes,
    minMarginPercent,
    fxRateInputs,
    itinerary,
    display,
    name,
    branding,
    orgAppearance,
    business,
    trust,
    security,
    notifications,
    privacy,
  ]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!patchBody) return;
    if (section === 'general') {
      for (const code of ORG_FX_CODES) {
        const raw = (fxRateInputs[code] || '').trim();
        if (!raw) continue;
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) {
          toastError(`Enter a positive FX rate for ${code}`);
          return;
        }
      }
      const checkTarget = (
        raw: string,
        label: string,
        max: number,
      ): boolean => {
        const t = raw.trim();
        if (!t) return true;
        const n = Number(t);
        if (!Number.isFinite(n) || n <= 0 || n > max) {
          toastError(`${label} must be between 0 and ${max} (or blank)`);
          return false;
        }
        return true;
      };
      if (
        !checkTarget(firstTouchTargetHours, 'First-touch target', 168) ||
        !checkTarget(leadToQuoteTargetHours, 'Lead → quote target', 720) ||
        !checkTarget(fitBuildTargetMinutes, 'FIT build target', 1440)
      ) {
        return;
      }
    }
    setSaving(true);
    try {
      const updated = await api('/organizations/current', {
        method: 'PATCH',
        body: JSON.stringify(patchBody),
      });
      hydrateFromOrg(updated);
      if (section === 'general' || section === 'branding') {
        await refreshMe();
      }
      toastSuccess('Settings saved');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  }

  async function refreshFxFromMarket() {
    setRefreshingFx(true);
    try {
      const res = await api<{
        currency?: string;
        fxRates?: Record<string, number>;
        fxRatesMeta?: OrgFxRatesMetaCue;
        settingsJson?: unknown;
      }>('/organizations/current/fx/refresh', { method: 'POST' });
      if (res.settingsJson != null && org) {
        hydrateFromOrg({
          ...org,
          currency: res.currency ?? org.currency,
          settingsJson: res.settingsJson,
        });
      } else if (res.fxRates) {
        const nextFx: Record<string, string> = {};
        for (const code of ORG_FX_CODES) {
          const n = Number(res.fxRates[code]);
          nextFx[code] =
            Number.isFinite(n) && n > 0
              ? String(n)
              : fxRateInputs[code] || String(ORG_FX_DEFAULTS[code]);
        }
        setFxRateInputs(nextFx);
        setFxRatesMeta(res.fxRatesMeta ?? null);
      }
      toastSuccess(formatOrgFxRefreshToast(res.fxRatesMeta));
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not refresh FX rates');
    } finally {
      setRefreshingFx(false);
    }
  }

  if (loadError) return <p className="text-sm text-destructive">{loadError}</p>;
  if (!org) return <PageSkeleton variant="settings" />;

  const fxMetaCue = formatOrgFxRatesMetaCue(fxRatesMeta);

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

  return (
    <PageStack>
      <div
        className={
          standalone
            ? undefined
            : 'grid gap-[var(--gap-section)] lg:grid-cols-[220px_minmax(0,1fr)]'
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
          <CardContent className="p-[var(--pad-card)]">
            <SectionStack>
            {standalone ? null : (
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-tight">{activeMeta.label}</h2>
              <p className="text-sm text-muted-foreground">{activeMeta.description}</p>
            </div>
            )}

            {section === 'workspaces' ? (
              <SectionStack>
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

                <div className="stack-form rounded-xl border border-border/70 pad-panel">
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
              </SectionStack>
            ) : section === 'members' ? (
              <AccessManagementPanel active={section === 'members'} />
            ) : section === 'policies' ? (
              <PoliciesPanel />
            ) : section === 'about' ? (
              <AboutReleaseNotesPanel showPublicLink />
            ) : section === 'appearance' ? (
              <SectionStack>
                <div className="rounded-xl border border-border/60 pad-panel glass-well flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Workspace default</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {me?.organization.appearanceDefaults
                        ? 'Admins set a workspace theme under Branding. Your choices here override it.'
                        : 'No workspace theme yet — admins can set one under Branding for new members.'}
                    </p>
                  </div>
                  {me?.organization.appearanceDefaults ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void resetAppearanceToWorkspaceDefault()
                          .then(() => toastSuccess('Using workspace default theme'))
                          .catch((err) =>
                            toastError(
                              err instanceof Error
                                ? err.message
                                : 'Could not reset to workspace default',
                            ),
                          );
                      }}
                    >
                      Use workspace default
                    </Button>
                  ) : null}
                </div>
                <div className="rounded-xl border border-border/60 pad-panel glass">
                  <div className="grid gap-[var(--gap-section)] sm:grid-cols-2">
                    <FormField
                      label="Theme"
                      description="Light, dark, or follow your device."
                    >
                      <div className="grid gap-[var(--field-gap)]">
                        {APPEARANCE_THEME_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setTheme(option.value)}
                            className={cn(
                              'flex items-start justify-between rounded-xl border pad-panel text-left transition-colors',
                              prefs.theme === option.value
                                ? 'border-primary/50 bg-primary/10'
                                : 'border-border/60 hover:bg-muted/30',
                            )}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                {option.value === 'light' ? (
                                  <Sun className="size-4" />
                                ) : option.value === 'dark' ? (
                                  <Moon className="size-4" />
                                ) : (
                                  <MonitorCog className="size-4" />
                                )}
                                {option.label}
                              </div>
                              <p className="text-xs text-muted-foreground">{option.description}</p>
                            </div>
                            <StatusBadge
                              value={prefs.theme === option.value ? 'active' : 'inactive'}
                              label={prefs.theme === option.value ? 'Selected' : 'Available'}
                              showIcon={false}
                            />
                          </button>
                        ))}
                      </div>
                    </FormField>
                    <FormField
                      label="Color theme"
                      description="Accent pack for chrome, buttons, and atmosphere — like VS Code color themes."
                    >
                      <div className="grid gap-[var(--field-gap)] sm:grid-cols-2">
                        {COLOR_THEME_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setColorTheme(option.id)}
                            className={cn(
                              'flex items-start gap-3 rounded-xl border pad-panel text-left transition-colors',
                              prefs.colorTheme === option.id
                                ? 'border-primary/50 bg-primary/10'
                                : 'border-border/60 hover:bg-muted/30',
                            )}
                          >
                            <span
                              className="mt-0.5 size-5 shrink-0 rounded-full border border-border/70 shadow-sm"
                              style={{ backgroundColor: option.swatch }}
                              aria-hidden
                            />
                            <span className="min-w-0 space-y-1">
                              <span className="block text-sm font-medium">{option.label}</span>
                              <span className="block text-xs text-muted-foreground">
                                {option.description}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                      {prefs.colorTheme === 'custom' ? (
                        <div className="mt-[var(--field-gap)] flex items-center gap-3 rounded-xl border border-border/60 pad-panel">
                          <label className="text-sm font-medium" htmlFor="custom-accent">
                            Custom accent
                          </label>
                          <input
                            id="custom-accent"
                            type="color"
                            value={prefs.customAccent}
                            onChange={(e) => setCustomAccent(e.target.value)}
                            className="size-9 cursor-pointer rounded-md border border-border/60 bg-transparent p-0.5"
                          />
                          <span className="font-mono text-xs text-muted-foreground">
                            {prefs.customAccent}
                          </span>
                        </div>
                      ) : null}
                    </FormField>
                    <FormField
                      label="High contrast"
                      description="Stronger text and borders for accessibility or bright rooms."
                      className="sm:col-span-2"
                    >
                      <div className="flex items-center gap-3 pt-1">
                        <Switch
                          checked={prefs.highContrast}
                          onCheckedChange={setHighContrast}
                          aria-label="High contrast"
                        />
                        <span className="text-sm text-muted-foreground">
                          {prefs.highContrast
                            ? 'High contrast is on'
                            : 'Standard contrast'}
                        </span>
                      </div>
                    </FormField>
                    <FormField
                      label="Density"
                      description="Scales panel spacing, control heights, and table rhythm across the app."
                    >
                      <div className="grid gap-[var(--field-gap)]">
                        {APPEARANCE_DENSITY_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setDensity(option.value)}
                            className={cn(
                              'rounded-xl border pad-panel text-left transition-colors',
                              prefs.density === option.value
                                ? 'border-primary/50 bg-primary/10'
                                : 'border-border/60 hover:bg-muted/30',
                            )}
                          >
                            <div className="text-sm font-medium">{option.label}</div>
                            <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                          </button>
                        ))}
                      </div>
                    </FormField>
                    <FormField
                      label="Text size"
                      description="Scales rem-based UI text across the app without browser zoom."
                    >
                      <div className="grid gap-[var(--field-gap)]">
                        {APPEARANCE_FONT_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setFontScale(option.value)}
                            className={cn(
                              'rounded-xl border pad-panel text-left transition-colors',
                              prefs.fontScale === option.value
                                ? 'border-primary/50 bg-primary/10'
                                : 'border-border/60 hover:bg-muted/30',
                            )}
                          >
                            <div className="text-sm font-medium">{option.label}</div>
                            <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                          </button>
                        ))}
                      </div>
                    </FormField>
                    <FormField label="Motion" description="Reduce non-essential animation when you want a calmer UI.">
                      <div className="grid gap-[var(--field-gap)]">
                        {APPEARANCE_MOTION_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setMotion(option.value)}
                            className={cn(
                              'rounded-xl border pad-panel text-left transition-colors',
                              prefs.motion === option.value
                                ? 'border-primary/50 bg-primary/10'
                                : 'border-border/60 hover:bg-muted/30',
                            )}
                          >
                            <div className="text-sm font-medium">{option.label}</div>
                            <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                          </button>
                        ))}
                      </div>
                    </FormField>
                    <FormField
                      label="Glass"
                      description="Frosted translucent panels, or solid surfaces without blur."
                    >
                      <div className="grid gap-[var(--field-gap)]">
                        {APPEARANCE_GLASS_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setGlass(option.value)}
                            className={cn(
                              'rounded-xl border pad-panel text-left transition-colors',
                              prefs.glass === option.value
                                ? 'border-primary/50 bg-primary/10'
                                : 'border-border/60 hover:bg-muted/30',
                            )}
                          >
                            <div className="text-sm font-medium">{option.label}</div>
                            <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                          </button>
                        ))}
                      </div>
                    </FormField>
                    <FormField
                      label="Start with collapsed sidebar"
                      description="Applies immediately and becomes the default for new sessions on this device."
                      className="sm:col-span-2"
                    >
                      <div className="flex items-center gap-3 pt-1">
                        <Switch
                          checked={prefs.sidebarCollapsedDefault}
                          onCheckedChange={setSidebarCollapsedDefault}
                          aria-label="Start with collapsed sidebar"
                        />
                        <span className="flex items-center gap-2 text-sm text-muted-foreground">
                          <PanelLeftClose className="size-4" />
                          {prefs.sidebarCollapsedDefault
                            ? 'Sidebar uses the narrow icon rail'
                            : 'Sidebar uses the full navigation'}
                        </span>
                      </div>
                    </FormField>
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 pad-panel glass-well">
                  <div className="mb-[var(--field-gap)] text-sm font-medium">Live preview</div>
                  <div className="stack-form">
                    <div className="grid gap-[var(--gap-section)] sm:grid-cols-[minmax(0,1fr)_auto]">
                      <FormField label="Sample field" description="Spacing and control height respond immediately.">
                        <Input value="Preview text" readOnly />
                      </FormField>
                      <div className="flex items-end gap-2">
                        <Button type="button">Primary</Button>
                        <Button type="button" variant="outline">
                          Secondary
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/60 overflow-hidden">
                      <div className="grid grid-cols-[1.2fr_0.8fr_0.6fr] border-b border-border/60 bg-muted/40 text-[length:var(--control-text-sm)] font-semibold uppercase tracking-wide text-muted-foreground">
                        <div className="px-3 py-[var(--field-gap)]">Panel</div>
                        <div className="px-3 py-[var(--field-gap)]">State</div>
                        <div className="px-3 py-[var(--field-gap)]">SLA</div>
                      </div>
                      {[
                        ['Inbox workspace', 'Ready', 'On track'],
                        ['Trip control centre', 'Queued', '2 hrs'],
                      ].map(([label, state, sla]) => (
                        <div key={label} className="grid grid-cols-[1.2fr_0.8fr_0.6fr] border-b border-border/60 last:border-b-0">
                          <div className="px-3 py-[var(--field-gap)] text-sm">{label}</div>
                          <div className="px-3 py-[var(--field-gap)] text-sm text-muted-foreground">{state}</div>
                          <div className="px-3 py-[var(--field-gap)] text-sm text-muted-foreground">{sla}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </SectionStack>
            ) : (
              <form onSubmit={onSave} className="flex flex-col gap-[var(--gap-section)]">
                {section === 'general' ? (
                  <>
                    <div className="grid gap-[var(--gap-section)] sm:grid-cols-2">
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
                      <FormField
                        label={`FX rates (${currency} per 1 foreign)`}
                        description="Used when Lock FX has no manual rate. Refresh pulls ECB rates via Frankfurter (AED kept if not in feed)."
                        className="sm:col-span-2"
                      >
                        <div className="stack-form">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {ORG_FX_CODES.map((code) => (
                              <div key={code} className="space-y-1.5">
                                <Label htmlFor={`fx-rate-${code}`}>{code}</Label>
                                <NumberField
                                  id={`fx-rate-${code}`}
                                  min={0.0001}
                                  integer={false}
                                  value={fxRateInputs[code] ?? ''}
                                  onChange={(v) =>
                                    setFxRateInputs((prev) => ({
                                      ...prev,
                                      [code]: v,
                                    }))
                                  }
                                  placeholder={String(ORG_FX_DEFAULTS[code])}
                                />
                              </div>
                            ))}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Can anyOf={CAP.orgSettingsWrite}>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={refreshingFx || saving}
                                onClick={() => void refreshFxFromMarket()}
                              >
                                {refreshingFx ? 'Refreshing…' : 'Refresh from market'}
                              </Button>
                            </Can>
                            {fxMetaCue ? (
                              <p className="text-xs text-muted-foreground">{fxMetaCue}</p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-3 pt-1">
                            <Switch
                              id="fx-auto-refresh"
                              checked={fxAutoRefreshEnabled}
                              onCheckedChange={setFxAutoRefreshEnabled}
                              disabled={!canOrgSettingsWrite}
                            />
                            <label
                              htmlFor="fx-auto-refresh"
                              className="cursor-pointer text-sm text-muted-foreground"
                            >
                              Auto-refresh weekly from market (worker). Manual refresh and Lock FX
                              still run when off.
                            </label>
                          </div>
                        </div>
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
                        <NumberField
                          min={0}
                          max={100}
                          integer={false}
                          value={defaultTaxPercent}
                          onChange={(v) =>
                            setDefaultTaxPercent(v === '' ? 0 : Number(v))
                          }
                          required
                        />
                      </FormField>
                      <FormField
                        label="Default markup %"
                        description="Sell = cost × (1 + markup/100) when pricing from the rate directory (retail / FIT clients)."
                      >
                        <NumberField
                          min={0}
                          max={500}
                          integer={false}
                          value={defaultMarkupPercent}
                          onChange={(v) =>
                            setDefaultMarkupPercent(v === '' ? 0 : Number(v))
                          }
                        />
                      </FormField>
                      <FormField
                        label="Agent / B2B markup %"
                        description="Used for travel agency, reseller, and DMC clients when set. Leave equal to default if you do not split trade vs retail."
                      >
                        <NumberField
                          min={0}
                          max={500}
                          integer={false}
                          value={agentMarkupPercent}
                          onChange={(v) =>
                            setAgentMarkupPercent(v === '' ? 0 : Number(v))
                          }
                        />
                      </FormField>
                      <div className="md:col-span-2 stack-form rounded-xl border border-border/60 pad-panel">
                        <div>
                          <div className="text-sm font-medium">Markup preset library</div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Named presets appear on trip quotes beside Apply default markup (percent
                            or fixed ₹ add-on).
                          </p>
                        </div>
                        {markupPresets.map((preset, index) => (
                          <FormGrid key={preset.id}>
                            <FormField label="Label">
                              <Input
                                value={preset.label}
                                onChange={(e) =>
                                  setMarkupPresets((rows) =>
                                    rows.map((row, i) =>
                                      i === index
                                        ? { ...row, label: e.target.value }
                                        : row,
                                    ),
                                  )
                                }
                              />
                            </FormField>
                            <FormField label="Type">
                              <SuggestionChips
                                aria-label="Markup preset type"
                                allowDeselect={false}
                                options={[
                                  { value: 'percent', label: 'Percent' },
                                  { value: 'fixed', label: 'Fixed ₹' },
                                ]}
                                value={preset.mode}
                                onChange={(mode) =>
                                  setMarkupPresets((rows) =>
                                    rows.map((row, i) =>
                                      i === index
                                        ? {
                                            ...row,
                                            mode: mode as MarkupPreset['mode'],
                                          }
                                        : row,
                                    ),
                                  )
                                }
                              />
                            </FormField>
                            <FormField label="Value">
                              {preset.mode === 'fixed' ? (
                                <PriceField
                                  currency={currency}
                                  value={preset.value}
                                  onChange={(v) =>
                                    setMarkupPresets((rows) =>
                                      rows.map((row, i) =>
                                        i === index
                                          ? {
                                              ...row,
                                              value: v === '' ? 0 : Number(v),
                                            }
                                          : row,
                                      ),
                                    )
                                  }
                                />
                              ) : (
                                <NumberField
                                  min={0}
                                  integer={false}
                                  value={preset.value}
                                  onChange={(v) =>
                                    setMarkupPresets((rows) =>
                                      rows.map((row, i) =>
                                        i === index
                                          ? {
                                              ...row,
                                              value: v === '' ? 0 : Number(v),
                                            }
                                          : row,
                                      ),
                                    )
                                  }
                                />
                              )}
                            </FormField>
                            <div className="flex items-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setMarkupPresets((rows) =>
                                    rows.filter((_, i) => i !== index),
                                  )
                                }
                              >
                                Remove
                              </Button>
                            </div>
                          </FormGrid>
                        ))}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={markupPresets.length >= 12}
                            onClick={() =>
                              setMarkupPresets((rows) => [
                                ...rows,
                                {
                                  id: `preset-${rows.length + 1}`,
                                  label: `Preset ${rows.length + 1}`,
                                  mode: 'percent',
                                  value: defaultMarkupPercent,
                                },
                              ])
                            }
                          >
                            Add preset
                          </Button>
                          {!markupPresets.length ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setMarkupPresets([
                                  {
                                    id: 'retail-fit',
                                    label: 'Retail FIT',
                                    mode: 'percent',
                                    value: defaultMarkupPercent,
                                  },
                                  {
                                    id: 'agent-b2b',
                                    label: 'Agent / B2B',
                                    mode: 'percent',
                                    value: agentMarkupPercent,
                                  },
                                ])
                              }
                            >
                              Seed from org defaults
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      <FormField
                        label="Default quote validity (days)"
                        description="New, cloned, template, and revise-from-accepted drafts get Valid until = today + this many days."
                      >
                        <NumberField
                          min={1}
                          max={365}
                          value={defaultQuoteValidityDays}
                          onChange={(v) =>
                            setDefaultQuoteValidityDays(v === '' ? 1 : Number(v))
                          }
                        />
                      </FormField>
                      <FormField
                        label="Post-expiry grace (hours)"
                        description="After Valid until passes, send keeps that date for this many hours. Past grace blocks send until you reset the date (0 = no grace). Default 24."
                      >
                        <NumberField
                          min={0}
                          max={72}
                          value={quoteValidityGraceHours}
                          onChange={(v) =>
                            setQuoteValidityGraceHours(v === '' ? 0 : Number(v))
                          }
                        />
                      </FormField>
                      <FormField
                        label="Inbox aging (hours)"
                        description="Unread open threads older than this count as aging on the sales dashboard and /inbox?aging=1."
                      >
                        <NumberField
                          min={1}
                          max={72}
                          value={inboxAgingHours}
                          onChange={(v) =>
                            setInboxAgingHours(v === '' ? 1 : Number(v))
                          }
                        />
                      </FormField>
                      <FormField
                        label="First-touch target (hours)"
                        description="Optional. When set, the sales dashboard tones median first touch against this (blank = no target)."
                      >
                        <NumberField
                          min={0.25}
                          max={168}
                          integer={false}
                          placeholder="e.g. 4"
                          value={firstTouchTargetHours}
                          onChange={setFirstTouchTargetHours}
                        />
                      </FormField>
                      <FormField
                        label="Lead → quote target (hours)"
                        description="Optional. Tones median lead→quote on the sales dashboard (blank = no target)."
                      >
                        <NumberField
                          min={0.25}
                          max={720}
                          integer={false}
                          placeholder="e.g. 48"
                          value={leadToQuoteTargetHours}
                          onChange={setLeadToQuoteTargetHours}
                        />
                      </FormField>
                      <FormField
                        label="FIT build target (minutes)"
                        description="Optional. Tones median FIT build (workspace open → first send) on the sales dashboard (blank = no target)."
                      >
                        <NumberField
                          min={1}
                          max={1440}
                          placeholder="e.g. 30"
                          value={fitBuildTargetMinutes}
                          onChange={setFitBuildTargetMinutes}
                        />
                      </FormField>
                      <FormField
                        label="Minimum margin %"
                        description="Lines below this margin on sell need below-margin approval before send. 0 = only block sell-below-cost."
                      >
                        <NumberField
                          min={0}
                          max={100}
                          integer={false}
                          value={minMarginPercent}
                          onChange={(v) =>
                            setMinMarginPercent(v === '' ? 0 : Number(v))
                          }
                        />
                      </FormField>
                      <FormField label="Share link default (days)">
                        <NumberField
                          min={1}
                          max={365}
                          value={itinerary.shareLinkDefaultDays}
                          onChange={(v) =>
                            setItinerary((prev) => ({
                              ...prev,
                              shareLinkDefaultDays: v === '' ? 1 : Number(v),
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
                      sidebar — URLs use your public org code.
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
                    <div className="rounded-xl border border-border/60 pad-panel glass-well space-y-[var(--gap-section)]">
                      <div>
                        <div className="text-sm font-medium">Workspace app theme</div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Default ERP chrome for members who have not set personal Appearance yet.
                          Personal settings always override this.
                        </p>
                      </div>
                      <div className="grid gap-[var(--gap-section)] sm:grid-cols-2">
                        <FormField label="Mode">
                          <div className="grid gap-[var(--field-gap)]">
                            {APPEARANCE_THEME_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                  setOrgAppearance((prev) => ({ ...prev, theme: option.value }))
                                }
                                className={cn(
                                  'rounded-xl border pad-panel text-left text-sm transition-colors',
                                  orgAppearance.theme === option.value
                                    ? 'border-primary/50 bg-primary/10'
                                    : 'border-border/60 hover:bg-muted/30',
                                )}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </FormField>
                        <FormField label="Color pack">
                          <div className="grid gap-[var(--field-gap)]">
                            {COLOR_THEME_OPTIONS.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() =>
                                  setOrgAppearance((prev) => ({
                                    ...prev,
                                    colorTheme: option.id,
                                  }))
                                }
                                className={cn(
                                  'flex items-center gap-2 rounded-xl border pad-panel text-left text-sm transition-colors',
                                  orgAppearance.colorTheme === option.id
                                    ? 'border-primary/50 bg-primary/10'
                                    : 'border-border/60 hover:bg-muted/30',
                                )}
                              >
                                <span
                                  className="size-3.5 shrink-0 rounded-full border border-border/70"
                                  style={{ backgroundColor: option.swatch }}
                                  aria-hidden
                                />
                                {option.label}
                              </button>
                            ))}
                          </div>
                          {orgAppearance.colorTheme === 'custom' ? (
                            <div className="mt-[var(--field-gap)] flex items-center gap-2">
                              <input
                                type="color"
                                value={orgAppearance.customAccent}
                                onChange={(e) =>
                                  setOrgAppearance((prev) => ({
                                    ...prev,
                                    customAccent: e.target.value,
                                  }))
                                }
                                className="size-9 cursor-pointer rounded-md border border-border/60 bg-transparent p-0.5"
                                aria-label="Workspace custom accent"
                              />
                              <span className="font-mono text-xs text-muted-foreground">
                                {orgAppearance.customAccent}
                              </span>
                            </div>
                          ) : null}
                        </FormField>
                        <FormField label="Glass">
                          <div className="grid gap-[var(--field-gap)]">
                            {APPEARANCE_GLASS_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                  setOrgAppearance((prev) => ({ ...prev, glass: option.value }))
                                }
                                className={cn(
                                  'rounded-xl border pad-panel text-left text-sm transition-colors',
                                  orgAppearance.glass === option.value
                                    ? 'border-primary/50 bg-primary/10'
                                    : 'border-border/60 hover:bg-muted/30',
                                )}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </FormField>
                        <FormField label="High contrast">
                          <div className="flex items-center gap-3 pt-1">
                            <Switch
                              checked={orgAppearance.highContrast}
                              onCheckedChange={(checked) =>
                                setOrgAppearance((prev) => ({
                                  ...prev,
                                  highContrast: checked === true,
                                }))
                              }
                              aria-label="Workspace high contrast default"
                            />
                            <span className="text-sm text-muted-foreground">
                              {orgAppearance.highContrast ? 'On by default' : 'Off by default'}
                            </span>
                          </div>
                        </FormField>
                      </div>
                    </div>
                    <ComingSoonNote>
                      Image upload for logo/favicon is coming soon — paste hosted URLs for now.
                    </ComingSoonNote>
                  </>
                ) : null}

                {section === 'business' ? (
                  <div className="flex flex-col gap-[var(--gap-section)]">
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
                      <FormField
                        label="Place of supply"
                        description="Agency/supplier state/UT for proposal footer and tax display split (does not change line tax %)."
                      >
                        <Input
                          value={business.placeOfSupply}
                          onChange={(e) =>
                            setBusiness((prev) => ({
                              ...prev,
                              placeOfSupply: e.target.value,
                            }))
                          }
                          placeholder="KA or Karnataka"
                        />
                      </FormField>
                      <FormField
                        label="Destination place of supply"
                        description="Default destination state/UT. Same as place of supply → CGST+SGST display; different → IGST. Display only — not a GST invoice claim."
                      >
                        <Input
                          value={business.destinationPlaceOfSupply}
                          onChange={(e) =>
                            setBusiness((prev) => ({
                              ...prev,
                              destinationPlaceOfSupply: e.target.value,
                            }))
                          }
                          placeholder="MH or Maharashtra"
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
                          <NumberField
                            min={1}
                            value={trust.yearsExperience}
                            onChange={(yearsExperience) =>
                              setTrust((prev) => ({ ...prev, yearsExperience }))
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
                        <NumberField
                          min={15}
                          max={10080}
                          value={security.sessionTimeoutMinutes}
                          onChange={(v) =>
                            setSecurity((prev) => ({
                              ...prev,
                              sessionTimeoutMinutes: v === '' ? 15 : Number(v),
                            }))
                          }
                        />
                      </FormField>
                      <FormField label="Minimum password length">
                        <NumberField
                          min={8}
                          max={128}
                          value={security.passwordMinLength}
                          onChange={(v) =>
                            setSecurity((prev) => ({
                              ...prev,
                              passwordMinLength: v === '' ? 8 : Number(v),
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
                        <NumberField
                          min={30}
                          max={3650}
                          value={privacy.dataRetentionDays}
                          onChange={(v) =>
                            setPrivacy((prev) => ({
                              ...prev,
                              dataRetentionDays: v === '' ? 30 : Number(v),
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
            </SectionStack>
          </CardContent>
        </Card>
      </div>
    </PageStack>
  );
}

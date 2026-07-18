import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Plane } from 'lucide-react';
import { LoginSchema, RegisterSchema, parseWithFieldErrors } from '@wayrune/contracts';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Input,
  SoftIcon,
  SuggestionChips,
  toastError,
  toastWarning,
} from '@wayrune/ui';
import { useAuth } from '../auth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { orgPath, orgPortalRef } from '../lib/agencyRoutes';
import { isAgencyKind, isPartnerOrgKind, isPlatformKind } from '../lib/orgKind';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api/v1';

const isDev = import.meta.env.DEV;
const isLocalApp =
  isDev ||
  import.meta.env.VITE_APP_ENV === 'local' ||
  import.meta.env.MODE === 'development';

const DEMO_LOGIN = {
  email: 'owner@demo.travel',
  password: 'Password123!',
} as const;

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  sales_manager: 'Sales manager',
  sales_executive: 'Sales executive',
  travel_consultant: 'Travel consultant',
  finance: 'Finance',
  operations: 'Operations',
  auditor: 'Auditor',
  front_desk: 'Front desk',
  reservation_manager: 'Reservation manager',
  housekeeping: 'Housekeeping',
  accountant: 'Accountant',
  platform_admin: 'Platform admin',
};

// Keep in sync with ROLE_EMAIL_SUFFIX in prisma/seed/seed.ts
const ROLE_EMAIL_SUFFIX: Record<string, string> = {
  owner: 'owner',
  admin: 'admin',
  sales_manager: 'sales',
  sales_executive: 'salesexec',
  travel_consultant: 'consultant',
  finance: 'finance',
  operations: 'ops',
  auditor: 'auditor',
  front_desk: 'frontdesk',
  reservation_manager: 'reservations',
  housekeeping: 'housekeeping',
  accountant: 'accountant',
};

const AGENCY_ROLE_KEYS = [
  'owner',
  'admin',
  'sales_manager',
  'sales_executive',
  'travel_consultant',
  'finance',
  'operations',
  'auditor',
];
const PARTNER_ROLE_KEYS = [
  'owner',
  'admin',
  'front_desk',
  'reservation_manager',
  'housekeeping',
  'accountant',
];

// Agency staff keep short, historical emails rather than the derived scheme.
const AGENCY_EMAIL_OVERRIDES: Record<string, string> = {
  admin: 'admin@demo.travel',
  sales_manager: 'sales@demo.travel',
  sales_executive: 'salesexec@demo.travel',
  travel_consultant: 'consultant@demo.travel',
  finance: 'finance@demo.travel',
  operations: 'ops@demo.travel',
  auditor: 'auditor@demo.travel',
};

type DemoRole = { key: string; label: string; email: string };
type DemoOrg = { key: string; label: string; roles: DemoRole[] };

function deriveRoleEmail(ownerEmail: string, roleKey: string): string {
  if (roleKey === 'owner') return ownerEmail;
  const [local, domain] = ownerEmail.split('@');
  return `${local}.${ROLE_EMAIL_SUFFIX[roleKey] ?? roleKey}@${domain}`;
}

function rolesFor(
  ownerEmail: string,
  roleKeys: string[],
  overrides?: Record<string, string>,
): DemoRole[] {
  return roleKeys.map((key) => ({
    key,
    label: ROLE_LABELS[key] ?? key,
    email:
      key === 'owner' ? ownerEmail : overrides?.[key] ?? deriveRoleEmail(ownerEmail, key),
  }));
}

const DEMO_ORGS: DemoOrg[] = [
  {
    key: 'platform',
    label: 'Platform',
    roles: [{ key: 'platform_admin', label: 'Platform admin', email: 'admin@travelos.platform' }],
  },
  { key: 'agency', label: 'Agency', roles: rolesFor('owner@demo.travel', AGENCY_ROLE_KEYS, AGENCY_EMAIL_OVERRIDES) },
  {
    key: 'agency_sso',
    label: 'Agency (SSO)',
    roles: [{ key: 'owner', label: 'Owner', email: 'manab@digitalwoods.io' }],
  },
  { key: 'hotel', label: 'Hotel', roles: rolesFor('hotel.goa@demo.travel', PARTNER_ROLE_KEYS) },
  { key: 'homestay', label: 'Homestay', roles: rolesFor('homestay.manali@demo.travel', PARTNER_ROLE_KEYS) },
  { key: 'farmstay', label: 'Farmstay', roles: rolesFor('farmstay.coorg@demo.travel', PARTNER_ROLE_KEYS) },
  { key: 'car_rental', label: 'Car rental', roles: rolesFor('cars.mumbai@demo.travel', PARTNER_ROLE_KEYS) },
  { key: 'driver', label: 'Driver', roles: rolesFor('driver.delhi@demo.travel', PARTNER_ROLE_KEYS) },
  { key: 'restaurant', label: 'Restaurant', roles: rolesFor('restaurant.jaipur@demo.travel', PARTNER_ROLE_KEYS) },
  { key: 'dmc', label: 'DMC', roles: rolesFor('dmc.rajasthan@demo.travel', AGENCY_ROLE_KEYS) },
  { key: 'other', label: 'Other', roles: rolesFor('events.jaipur@demo.travel', PARTNER_ROLE_KEYS) },
];

const ORG_KINDS = [
  { value: 'travel_agency', label: 'Travel agency' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'homestay', label: 'Homestay' },
  { value: 'farmstay', label: 'Farmstay' },
  { value: 'car_rental', label: 'Car rental' },
  { value: 'driver', label: 'Driver' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'dmc', label: 'DMC' },
  { value: 'other', label: 'Other' },
];

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-.9 2.4-2 3.1l3.2 2.5c1.9-1.7 3-4.3 3-7.3 0-.7-.1-1.4-.2-2H12z"
      />
      <path
        fill="#34A853"
        d="M6.6 14.3l-.7.5-2.5 1.9C5.1 19.5 8.3 21.5 12 21.5c2.4 0 4.4-.8 5.9-2.2l-3.2-2.5c-.9.6-2 .9-2.7.9-2.3 0-4.3-1.6-5-3.7l-.4-.7z"
      />
      <path
        fill="#4A90E2"
        d="M3.4 7.3C2.5 9 2 10.9 2 12.9c0 2 .5 3.9 1.4 5.5l3.2-2.5c-.4-1.1-.6-2.3-.6-3.5s.2-2.4.6-3.5L3.4 7.3z"
      />
      <path
        fill="#FBBC05"
        d="M12 5.3c1.3 0 2.5.5 3.4 1.3l2.6-2.6C16.4 2.6 14.4 1.8 12 1.8 8.3 1.8 5.1 3.8 3.4 7.3l3.2 2.5c.7-2.1 2.7-3.7 5.4-3.7z"
      />
    </svg>
  );
}

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 23 23" aria-hidden>
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}

export function LoginPage() {
  useDocumentTitle('Sign in');
  const { me, login, register } = useAuth();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [demoOrgKey, setDemoOrgKey] = useState<string>('agency');
  const [ssoProviders, setSsoProviders] = useState<{ google: boolean; microsoft: boolean }>({
    google: false,
    microsoft: false,
  });
  const [form, setForm] = useState({
    email: isLocalApp ? DEMO_LOGIN.email : '',
    password: isLocalApp ? DEMO_LOGIN.password : '',
    fullName: '',
    organizationName: '',
    organizationKind: 'travel_agency',
    city: '',
    discoverable: true,
  });

  useEffect(() => {
    if (searchParams.get('sso') === 'error') {
      toastError('Sign-in failed — try again or use email/password');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/auth/oauth/providers`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { google?: boolean; microsoft?: boolean };
        setSsoProviders({
          google: Boolean(data.google),
          microsoft: Boolean(data.microsoft),
        });
      })
      .catch(() => undefined);
  }, []);

  function patchForm(patch: Partial<typeof form>) {
    setForm((f) => ({ ...f, ...patch }));
    setFieldErrors((errs) => {
      const next = { ...errs };
      for (const key of Object.keys(patch)) delete next[key];
      return next;
    });
  }

  function fillDemo(email: string) {
    setMode('login');
    patchForm({ email, password: DEMO_LOGIN.password });
    setFieldErrors({});
    setError('');
  }

  function selectDemoOrg(org: DemoOrg) {
    setDemoOrgKey(org.key);
    if (org.roles[0]) fillDemo(org.roles[0].email);
  }

  function switchMode(next: 'login' | 'register') {
    setMode(next);
    setFieldErrors({});
    setError('');
  }

  function startSso(provider: 'google' | 'microsoft') {
    window.location.href = `${API_BASE}/auth/oauth/${provider}`;
  }

  const activeDemoOrg =
    DEMO_ORGS.find((o) => o.key === demoOrgKey) ?? DEMO_ORGS[1];
  const showSso = ssoProviders.google || ssoProviders.microsoft;

  const nextParam = searchParams.get('next');
  const resolvedNext = (() => {
    if (nextParam && nextParam.startsWith('/') && nextParam !== '/') return nextParam;
    if (!me) return '/';
    if (isAgencyKind(me.organization.kind) && !isPlatformKind(me.organization.kind)) {
      return orgPath(orgPortalRef(me.organization), '/');
    }
    if (isPartnerOrgKind(me.organization.kind)) {
      return orgPath(orgPortalRef(me.organization), '/');
    }
    return '/';
  })();
  if (me) return <Navigate to={resolvedNext} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const parsed =
      mode === 'login'
        ? parseWithFieldErrors(LoginSchema, {
            email: form.email,
            password: form.password,
          })
        : parseWithFieldErrors(RegisterSchema, {
            email: form.email,
            password: form.password,
            fullName: form.fullName,
            organizationName: form.organizationName,
            organizationKind: form.organizationKind,
            city: form.city || undefined,
            discoverable:
              form.organizationKind === 'travel_agency' ||
              form.organizationKind === 'dmc'
                ? false
                : form.discoverable,
          });
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      const msg = Object.values(parsed.errors)[0] || 'Fix the highlighted fields';
      setError(msg);
      toastError(msg);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const data = parsed.data as { email: string; password: string };
        await login(data.email, data.password);
      } else {
        await register(parsed.data as typeof form);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign in failed';
      setError(msg);
      toastError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center p-6">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-sky-200/25 dark:to-sky-900/25" />
      <Card className="relative z-10 w-full max-w-[420px] shadow-xl">
        <CardContent className="space-y-6 p-8">
          <div className="space-y-3 text-center">
            <div className="flex justify-center">
              <SoftIcon icon={Plane} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide text-primary">Wayrune</p>
              <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground">
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {mode === 'login'
                  ? 'Enter your credentials to access your account'
                  : 'Set up your agency or partner organization'}
              </p>
            </div>
          </div>

          {showSso ? (
            <div className="space-y-2.5">
              {ssoProviders.google ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full justify-center gap-2.5 text-sm font-semibold"
                  onClick={() => startSso('google')}
                >
                  <GoogleIcon className="size-5" />
                  {mode === 'login' ? 'Continue with Google' : 'Sign up with Google'}
                </Button>
              ) : null}
              {ssoProviders.microsoft ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full justify-center gap-2.5 text-sm font-semibold"
                  onClick={() => startSso('microsoft')}
                >
                  <MicrosoftIcon className="size-5" />
                  {mode === 'login' ? 'Continue with Microsoft' : 'Sign up with Microsoft'}
                </Button>
              ) : null}
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/70" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-wider">
                  <span className="bg-card/80 px-3 text-muted-foreground backdrop-blur-sm">or</span>
                </div>
              </div>
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-3.5" aria-busy={submitting} noValidate>
            {mode === 'register' ? (
              <>
                <Field label="Full name" required error={fieldErrors.fullName}>
                  <Input
                    className="h-11"
                    value={form.fullName}
                    onChange={(e) => patchForm({ fullName: e.target.value })}
                    placeholder="Your name"
                    aria-invalid={Boolean(fieldErrors.fullName)}
                  />
                </Field>
                <Field label="Organization" required error={fieldErrors.organizationName}>
                  <Input
                    className="h-11"
                    value={form.organizationName}
                    onChange={(e) => patchForm({ organizationName: e.target.value })}
                    placeholder="Agency or property name"
                    aria-invalid={Boolean(fieldErrors.organizationName)}
                  />
                </Field>
                <Field label="Organization type">
                  <SuggestionChips
                    aria-label="Organization type"
                    allowDeselect={false}
                    options={ORG_KINDS}
                    value={form.organizationKind}
                    onChange={(organizationKind) => patchForm({ organizationKind })}
                  />
                </Field>
                {form.organizationKind !== 'travel_agency' &&
                form.organizationKind !== 'dmc' ? (
                  <>
                    <Field label="City">
                      <Input
                        className="h-11"
                        value={form.city}
                        onChange={(e) => patchForm({ city: e.target.value })}
                        placeholder="City for discovery"
                      />
                    </Field>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="signup-discoverable"
                        checked={form.discoverable}
                        onCheckedChange={(checked) =>
                          patchForm({ discoverable: checked === true })
                        }
                      />
                      <label htmlFor="signup-discoverable" className="cursor-pointer text-sm">
                        List me on the partner network
                      </label>
                    </div>
                  </>
                ) : null}
              </>
            ) : null}

            <Field label="Email" required error={fieldErrors.email}>
              <Input
                className="h-11"
                type="email"
                value={form.email}
                onChange={(e) => patchForm({ email: e.target.value })}
                placeholder="Email"
                autoComplete="username"
                aria-invalid={Boolean(fieldErrors.email)}
              />
            </Field>
            <Field label="Password" required error={fieldErrors.password}>
              <Input
                className="h-11"
                type="password"
                value={form.password}
                onChange={(e) => patchForm({ password: e.target.value })}
                placeholder="Password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                aria-invalid={Boolean(fieldErrors.password)}
              />
            </Field>

            {mode === 'login' ? (
              <div className="flex justify-end -mt-1">
                <button
                  type="button"
                  className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
                  onClick={() => toastWarning('Password reset coming soon')}
                >
                  Forgot password?
                </button>
              </div>
            ) : null}

            {isLocalApp && mode === 'login' ? (
              <div className="space-y-2.5 rounded-xl border px-3 py-2.5 glass-well">
                <p className="text-xs text-muted-foreground">
                  Local demo — pick an org type, then a role. Fields autofill.
                </p>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Org type
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {DEMO_ORGS.map((org) => (
                      <Button
                        key={org.key}
                        type="button"
                        size="sm"
                        variant={demoOrgKey === org.key ? 'default' : 'secondary'}
                        className="h-7"
                        onClick={() => selectDemoOrg(org)}
                      >
                        {org.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Role · {activeDemoOrg.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeDemoOrg.roles.map((role) => (
                      <Button
                        key={role.email}
                        type="button"
                        size="sm"
                        variant={form.email === role.email ? 'default' : 'secondary'}
                        className="h-7"
                        title={role.email}
                        onClick={() => fillDemo(role.email)}
                      >
                        {role.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="text-sm text-destructive" role="alert" aria-live="polite">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="h-11 w-full text-sm font-semibold" disabled={submitting}>
              {submitting
                ? mode === 'login'
                  ? 'Signing in…'
                  : 'Creating…'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                  onClick={() => switchMode('register')}
                >
                  Create now
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                  onClick={() => switchMode('login')}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  hasDeviceAppearanceCache,
  setDateTimePrefs,
  toastError,
  useUiPrefs,
  type DateFormatId,
  type UiAppearancePrefs,
  type TimeFormatId,
  type ColorThemeId,
  type GlassPreference,
  type Theme,
} from '@wayrune/ui';
import { api, setToken } from './api';
import { orgPath, orgPortalRef } from './lib/agencyRoutes';
import { identifyAnalyticsUser } from './lib/progressiveComplexity/analytics';

type Membership = {
  organizationId: string;
  name: string;
  slug: string;
  kind: string;
  publicCode?: number;
  subdomain?: string | null;
  customDomain?: string | null;
};

type OrgAppearanceDefaults = {
  theme?: Theme;
  colorTheme?: ColorThemeId;
  highContrast?: boolean;
  customAccent?: string;
  glass?: GlassPreference;
};

type Me = {
  id: string;
  email: string;
  fullName: string;
  preferences?: {
    appearance?: Partial<UiAppearancePrefs>;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    kind?: string;
    publicCode?: number;
    subdomain?: string | null;
    customDomain?: string | null;
    timezone?: string;
    currency?: string;
    dateFormat?: DateFormatId;
    timeFormat?: TimeFormatId;
    appearanceDefaults?: OrgAppearanceDefaults;
  };
  memberships?: Membership[];
  /** RBAC role keys for the active organization membership. */
  roles?: string[];
  permissions: string[];
};

type AuthState = {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    email: string;
    password: string;
    fullName: string;
    organizationName: string;
    organizationKind?: string;
    city?: string;
    discoverable?: boolean;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<Me | null>;
  /** Clear personal appearance and apply the active workspace defaults. */
  resetAppearanceToWorkspaceDefault: () => Promise<void>;
  switchOrganization: (organizationId: string, opts?: { redirectTo?: string | false }) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function applyOrgDateTimePrefs(me: Me | null) {
  if (!me?.organization) {
    setDateTimePrefs(null);
    return;
  }
  setDateTimePrefs({
    dateFormat: me.organization.dateFormat,
    timeFormat: me.organization.timeFormat,
  });
}

function clearLegacyTokenStorage() {
  try {
    localStorage.removeItem('accessToken');
  } catch {
    /* ignore */
  }
  setToken(null);
}

function hydrateAppearanceFromServer(
  hydrateFromServer: ReturnType<typeof useUiPrefs>['hydrateFromServer'],
  appearance: Partial<UiAppearancePrefs> | undefined,
  orgDefaults?: OrgAppearanceDefaults | undefined,
  markFollowingOrg?: () => void,
) {
  // Personal prefs win. Otherwise apply workspace defaults for new members / clean devices.
  if (appearanceHasValues(appearance)) {
    hydrateFromServer(appearance, { force: true });
    return;
  }
  if (orgAppearanceDefaultsHaveValues(orgDefaults)) {
    hydrateFromServer(orgDefaults as Partial<UiAppearancePrefs>, { force: true });
    markFollowingOrg?.();
    return;
  }
  if (hasDeviceAppearanceCache()) return;
  hydrateFromServer(appearance);
}

function appearancePrefsFingerprint(appearance: Partial<UiAppearancePrefs> | undefined) {
  const prefs = appearance ?? {};
  return [
    prefs.theme ?? '',
    prefs.density ?? '',
    prefs.fontScale ?? '',
    prefs.motion ?? '',
    prefs.glass ?? '',
    prefs.colorTheme ?? '',
    prefs.highContrast === true ? '1' : prefs.highContrast === false ? '0' : '',
    prefs.customAccent ?? '',
    prefs.sidebarCollapsedDefault === true ? '1' : prefs.sidebarCollapsedDefault === false ? '0' : '',
  ].join('|');
}

function appearanceHasValues(appearance: Partial<UiAppearancePrefs> | undefined) {
  if (!appearance) return false;
  return (
    appearance.theme != null ||
    appearance.density != null ||
    appearance.fontScale != null ||
    appearance.motion != null ||
    appearance.glass != null ||
    appearance.colorTheme != null ||
    typeof appearance.highContrast === 'boolean' ||
    appearance.customAccent != null ||
    typeof appearance.sidebarCollapsedDefault === 'boolean'
  );
}

function orgAppearanceDefaultsHaveValues(appearance: OrgAppearanceDefaults | undefined) {
  if (!appearance) return false;
  return (
    appearance.theme != null ||
    appearance.colorTheme != null ||
    typeof appearance.highContrast === 'boolean' ||
    appearance.customAccent != null ||
    appearance.glass != null
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { prefs, hydrateFromServer } = useUiPrefs();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const meRef = useRef(me);
  meRef.current = me;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  /** Last appearance fingerprint successfully sent (or seeded) — prevents duplicate PATCH storms. */
  const lastSyncedAppearanceRef = useRef<string | null>(null);
  const appearanceSyncGenRef = useRef(0);
  /**
   * When set, skip PATCH until prefs diverge from this baseline.
   * `'pending'` = capture next prefs fingerprint after org-default hydrate.
   */
  const followingOrgAppearanceBaselineRef = useRef<string | null>(null);

  function markFollowingOrgAppearance() {
    followingOrgAppearanceBaselineRef.current = 'pending';
  }

  function seedAppearanceSyncBaseline(
    appearance: Partial<UiAppearancePrefs> | undefined,
    orgDefaults?: OrgAppearanceDefaults | undefined,
  ) {
    const local = prefsRef.current;
    if (appearanceHasValues(appearance) || orgAppearanceDefaultsHaveValues(orgDefaults)) {
      // Mark current local as synced so the sync effect does not upload stale
      // device prefs over the server before force-hydrate commits.
      lastSyncedAppearanceRef.current = appearancePrefsFingerprint({
        theme: local.theme,
        density: local.density,
        fontScale: local.fontScale,
        motion: local.motion,
        glass: local.glass,
        colorTheme: local.colorTheme,
        highContrast: local.highContrast,
        customAccent: local.customAccent,
        sidebarCollapsedDefault: local.sidebarCollapsedDefault,
      });
      return;
    }
    followingOrgAppearanceBaselineRef.current = null;
    // Empty server: allow one upload of device prefs.
    lastSyncedAppearanceRef.current = appearancePrefsFingerprint(appearance);
  }

  useEffect(() => {
    clearLegacyTokenStorage();
    api<Me>('/auth/me', { skipAuthRefresh: false })
      .then((user) => {
        applyOrgDateTimePrefs(user);
        hydrateAppearanceFromServer(
          hydrateFromServer,
          user.preferences?.appearance,
          user.organization.appearanceDefaults,
          markFollowingOrgAppearance,
        );
        seedAppearanceSyncBaseline(
          user.preferences?.appearance,
          user.organization.appearanceDefaults,
        );
        setMe(user);
      })
      .catch(() => {
        applyOrgDateTimePrefs(null);
        lastSyncedAppearanceRef.current = null;
        followingOrgAppearanceBaselineRef.current = null;
        setMe(null);
      })
      .finally(() => setLoading(false));
  }, [hydrateFromServer]);

  useEffect(() => {
    if (!me) return;
    identifyAnalyticsUser({
      userId: me.id,
      role: me.roles?.[0],
      orgId: me.organization.id,
      userExperienceLevel: 'unknown',
    });
  }, [me]);

  const value = useMemo<AuthState>(
    () => ({
      me,
      loading,
      async login(email, password) {
        clearLegacyTokenStorage();
        await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
          skipAuthRefresh: true,
        });
        const user = await api<Me>('/auth/me');
        applyOrgDateTimePrefs(user);
        hydrateAppearanceFromServer(
          hydrateFromServer,
          user.preferences?.appearance,
          user.organization.appearanceDefaults,
          markFollowingOrgAppearance,
        );
        seedAppearanceSyncBaseline(
          user.preferences?.appearance,
          user.organization.appearanceDefaults,
        );
        setMe(user);
      },
      async register(payload) {
        clearLegacyTokenStorage();
        await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify(payload),
          skipAuthRefresh: true,
        });
        const user = await api<Me>('/auth/me');
        applyOrgDateTimePrefs(user);
        hydrateAppearanceFromServer(
          hydrateFromServer,
          user.preferences?.appearance,
          user.organization.appearanceDefaults,
          markFollowingOrgAppearance,
        );
        seedAppearanceSyncBaseline(
          user.preferences?.appearance,
          user.organization.appearanceDefaults,
        );
        setMe(user);
      },
      async logout() {
        try {
          await api('/auth/logout', { method: 'POST', body: '{}', skipAuthRefresh: true });
        } catch {
          /* still clear local session */
        }
        clearLegacyTokenStorage();
        applyOrgDateTimePrefs(null);
        lastSyncedAppearanceRef.current = null;
        followingOrgAppearanceBaselineRef.current = null;
        setMe(null);
      },
      async refreshMe() {
        try {
          const user = await api<Me>('/auth/me');
          applyOrgDateTimePrefs(user);
          setMe(user);
          return user;
        } catch {
          applyOrgDateTimePrefs(null);
          setMe(null);
          return null;
        }
      },
      async resetAppearanceToWorkspaceDefault() {
        const defaults = meRef.current?.organization.appearanceDefaults;
        if (!orgAppearanceDefaultsHaveValues(defaults)) {
          throw new Error('This workspace has no default theme yet. Set one under Branding.');
        }
        await api('/auth/me/preferences', {
          method: 'PATCH',
          body: JSON.stringify({ appearance: null }),
        });
        hydrateAppearanceFromServer(
          hydrateFromServer,
          undefined,
          defaults,
          markFollowingOrgAppearance,
        );
        seedAppearanceSyncBaseline(undefined, defaults);
        setMe((prev) =>
          prev
            ? {
                ...prev,
                preferences: { appearance: {} },
              }
            : prev,
        );
      },
      async switchOrganization(organizationId: string, opts?: { redirectTo?: string | false }) {
        await api('/auth/switch-organization', {
          method: 'POST',
          body: JSON.stringify({ organizationId }),
        });
        const user = await api<Me>('/auth/me');
        applyOrgDateTimePrefs(user);
        hydrateAppearanceFromServer(
          hydrateFromServer,
          user.preferences?.appearance,
          user.organization.appearanceDefaults,
          markFollowingOrgAppearance,
        );
        seedAppearanceSyncBaseline(
          user.preferences?.appearance,
          user.organization.appearanceDefaults,
        );
        setMe(user);
        if (opts?.redirectTo === false) return;
        const home = orgPath(orgPortalRef(user.organization), '/');
        window.location.assign(opts?.redirectTo ?? home);
      },
    }),
    [hydrateFromServer, me, loading],
  );

  useEffect(() => {
    if (!me) return;
    const nextAppearance: Partial<UiAppearancePrefs> = {
      theme: prefs.theme,
      density: prefs.density,
      fontScale: prefs.fontScale,
      motion: prefs.motion,
      glass: prefs.glass,
      colorTheme: prefs.colorTheme,
      highContrast: prefs.highContrast,
      customAccent: prefs.customAccent,
      sidebarCollapsedDefault: prefs.sidebarCollapsedDefault,
    };
    const fingerprint = appearancePrefsFingerprint(nextAppearance);
    const followingBaseline = followingOrgAppearanceBaselineRef.current;
    if (followingBaseline === 'pending') {
      followingOrgAppearanceBaselineRef.current = fingerprint;
      lastSyncedAppearanceRef.current = fingerprint;
      return;
    }
    if (fingerprint === lastSyncedAppearanceRef.current) return;

    if (followingBaseline != null) {
      if (fingerprint === followingBaseline) {
        lastSyncedAppearanceRef.current = fingerprint;
        return;
      }
      // Member customized away from the org-default snapshot — persist as personal.
      followingOrgAppearanceBaselineRef.current = null;
    }

    const gen = ++appearanceSyncGenRef.current;
    const timeout = window.setTimeout(() => {
      // A newer change superseded this debounce window.
      if (gen !== appearanceSyncGenRef.current) return;
      lastSyncedAppearanceRef.current = fingerprint;
      void api<{ preferences: { appearance: Partial<UiAppearancePrefs> } }>('/auth/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ appearance: nextAppearance }),
      })
        .then((res) => {
          if (!meRef.current || gen !== appearanceSyncGenRef.current) return;
          const saved = res.preferences.appearance ?? nextAppearance;
          lastSyncedAppearanceRef.current = appearancePrefsFingerprint(saved);
          setMe((prev) =>
            prev
              ? {
                  ...prev,
                  preferences: { appearance: saved },
                }
              : prev,
          );
        })
        .catch((err) => {
          if (gen !== appearanceSyncGenRef.current) return;
          // Allow retry on next prefs change.
          if (lastSyncedAppearanceRef.current === fingerprint) {
            lastSyncedAppearanceRef.current = null;
          }
          toastError(
            err instanceof Error ? err.message : 'Could not save appearance preferences',
          );
        });
    }, 300);
    return () => window.clearTimeout(timeout);
    // Intentionally omit `me`: setMe after PATCH must not re-trigger sync.
  }, [
    me?.id,
    prefs.theme,
    prefs.density,
    prefs.fontScale,
    prefs.motion,
    prefs.glass,
    prefs.colorTheme,
    prefs.highContrast,
    prefs.customAccent,
    prefs.sidebarCollapsedDefault,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider missing');
  return ctx;
}

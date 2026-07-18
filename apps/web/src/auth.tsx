import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  setDateTimePrefs,
  type DateFormatId,
  type TimeFormatId,
} from '@wayrune/ui';
import { api, setToken } from './api';
import { orgPath, orgPortalRef } from './lib/agencyRoutes';

type Membership = {
  organizationId: string;
  name: string;
  slug: string;
  kind: string;
  publicCode?: number;
  subdomain?: string | null;
  customDomain?: string | null;
};

type Me = {
  id: string;
  email: string;
  fullName: string;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clearLegacyTokenStorage();
    api<Me>('/auth/me', { skipAuthRefresh: false })
      .then((user) => {
        applyOrgDateTimePrefs(user);
        setMe(user);
      })
      .catch(() => {
        applyOrgDateTimePrefs(null);
        setMe(null);
      })
      .finally(() => setLoading(false));
  }, []);

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
      async switchOrganization(organizationId: string, opts?: { redirectTo?: string | false }) {
        await api('/auth/switch-organization', {
          method: 'POST',
          body: JSON.stringify({ organizationId }),
        });
        const user = await api<Me>('/auth/me');
        applyOrgDateTimePrefs(user);
        setMe(user);
        if (opts?.redirectTo === false) return;
        const home = orgPath(orgPortalRef(user.organization), '/');
        window.location.assign(opts?.redirectTo ?? home);
      },
    }),
    [me, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider missing');
  return ctx;
}

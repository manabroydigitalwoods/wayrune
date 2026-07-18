import type {
  PresenceContentRule,
  PresenceDataSourceQuery,
  PresenceVisitorContext,
} from '@wayrune/contracts';

export type ResolveContext = {
  organizationId: string;
  org: {
    id: string;
    name: string;
    brandingJson?: unknown;
    settingsJson?: unknown;
  };
  site: {
    id: string;
    name: string;
    primaryDomain?: string | null;
    platformSlug?: string | null;
    settingsJson?: unknown;
  };
  page?: {
    id: string;
    path: string;
    title: string;
  };
  visitor?: PresenceVisitorContext;
  now: Date;
  preview: boolean;
};

export type DataSourceResult = {
  items: Record<string, unknown>[];
  meta: { source: string; total: number };
};

export type { PresenceContentRule, PresenceDataSourceQuery, PresenceVisitorContext };

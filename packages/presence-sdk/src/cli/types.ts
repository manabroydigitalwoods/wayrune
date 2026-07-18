export type PresenceAccount = {
  apiBase: string;
  accessToken: string;
  organizationId: string;
  organizationName: string;
  email: string;
};

export type PresenceGlobalConfig = {
  defaultAccount?: string;
  accounts: Record<string, PresenceAccount>;
};

export type PresenceProjectConfig = {
  account?: string;
  apiBase?: string;
  siteName?: string;
  onConflict?: 'overwrite' | 'suffix';
  confirmReplace?: boolean;
};

export type ValidateIssue = {
  level: 'error' | 'warn';
  message: string;
};

export type ValidateResult = {
  ok: boolean;
  issues: ValidateIssue[];
  manifest?: { key: string; name: string; version: string; parent?: string };
};

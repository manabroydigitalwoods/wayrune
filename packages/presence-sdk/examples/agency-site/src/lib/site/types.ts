export type NavItem = {
  label: string;
  path: string;
};

export type SiteSection = {
  type: string;
  moduleKey?: string;
  propsJson?: Record<string, unknown>;
};

export type SitePage = {
  path: string;
  title: string;
  layoutKey?: string;
  sections?: SiteSection[];
};

export type SiteStructure = {
  navigation: NavItem[];
  globalRegions?: Record<string, unknown>;
  menus?: Record<string, unknown>;
  menuAssignments?: Record<string, string>;
  pages: SitePage[];
};

export type ThemeTokens = {
  primary?: string;
  accent?: string;
  background?: string;
  foreground?: string;
  muted?: string;
  surface?: string;
  radius?: string;
  fontDisplay?: string;
  fontBody?: string;
  [key: string]: unknown;
};

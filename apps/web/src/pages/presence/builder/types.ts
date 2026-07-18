export type Identity = {
  publicCode: number;
  subdomain: string | null;
  customDomain: string | null;
  siteBaseDomain: string;
  publicSiteUrl: string | null;
  slug: string;
};

export type ModuleDef = {
  id: string;
  key: string;
  name: string;
  category: string;
  rendererKey: string;
  status: string;
  isSystem: boolean;
  schemaJson?: Array<Record<string, unknown>> | null;
  defaultPropsJson: Record<string, unknown>;
  previewJson?: Record<string, unknown> | null;
  styleSchemaJson?: Array<Record<string, unknown>> | null;
  defaultStyleJson?: Record<string, unknown> | null;
  templateSource?: string | null;
  moduleSource?: string | null;
  assetsJson?: Record<string, unknown> | null;
  variantsJson?: Array<Record<string, unknown>> | null;
  suggestJson?: Record<string, unknown> | null;
};

export type Site = {
  id: string;
  name: string;
  /** Public header brand — org companyName || org.name (matches live runtime). */
  brandName?: string | null;
  kind: string;
  status: string;
  isPrimary: boolean;
  primaryDomain?: string | null;
  platformSlug?: string | null;
  platformHost?: string | null;
  homePageId?: string | null;
  settingsJson?: Record<string, unknown> | null;
  navigationJson?: Array<Record<string, unknown>> | null;
  menusJson?: Record<string, unknown> | null;
  menuAssignmentsJson?: Record<string, unknown> | null;
  globalRegionsJson?: Record<string, unknown> | null;
  theme?: {
    id: string;
    key: string;
    name: string;
    tokensJson?: Record<string, unknown> | null;
    effectiveTokensJson?: Record<string, unknown> | null;
    packageCss?: string | null;
  } | null;
  template?: { id: string; key: string; name: string } | null;
  homePage?: { id: string; title: string; path: string } | null;
  _count?: { pages: number };
};

export type Section = {
  id?: string;
  clientId: string;
  type: string;
  moduleDefinitionId?: string | null;
  parentId?: string | null;
  slotKey?: string | null;
  propsJson: Record<string, unknown>;
  position: number;
};

export type BuilderPage = {
  id: string;
  siteId: string;
  title: string;
  path: string;
  status: string;
  layoutKey?: string | null;
  layoutMode?: 'flow' | 'freeform' | null;
  seoJson?: Record<string, unknown> | null;
  updatedAt?: string;
  site: Site;
  sections: Section[];
};

export type FreeformFrame = {
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  unit?: 'px' | '%';
  /** Optional tablet override (builder tablet preview + public ≤768px). */
  tablet?: Partial<Pick<FreeformFrame, 'x' | 'y' | 'w' | 'h' | 'z' | 'unit'>>;
  /** Optional mobile override (builder mobile preview + public ≤480px). */
  mobile?: Partial<Pick<FreeformFrame, 'x' | 'y' | 'w' | 'h' | 'z' | 'unit'>>;
  /** If set and no `mobile` override, scale desktop x/y/w/h for ≤480px. */
  mobileScale?: number;
};

/** Virtual clientIds used to select shared chrome regions in the builder. */
export const HEADER_REGION_ID = '__header__';
export const FOOTER_REGION_ID = '__footer__';
export const ANNOUNCEMENT_REGION_ID = '__announcement__';
export const COOKIE_REGION_ID = '__cookie__';
export const STICKY_CTA_REGION_ID = '__sticky_cta__';

export type ChromeRegion =
  | 'header'
  | 'footer'
  | 'announcement'
  | 'cookie'
  | 'sticky_cta';

export type FormDef = {
  id: string;
  key: string;
  name: string;
  ingestMode: string;
  fieldsJson?: Array<Record<string, unknown>> | unknown;
};

/** Canvas preview width. `widescreen` is a wide desktop frame; style/freeform overrides match `desktop`. */
export type DeviceMode = 'desktop' | 'widescreen' | 'tablet' | 'mobile';

export type SchemaField = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  helpText?: string | null;
  options?: Array<{ value: string; label: string }>;
  defaultValue?: unknown;
};

export type ListItemField = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'url';
};

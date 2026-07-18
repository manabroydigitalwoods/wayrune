/**
 * Presence chat widget placement helpers.
 * Position + include/exclude live on PresenceChatWidget; sites only assign widgetId.
 */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const PRESENCE_WIDGET_POSITIONS = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
] as const;

export type PresenceWidgetPosition = (typeof PRESENCE_WIDGET_POSITIONS)[number];

export type PresenceConversationWidgetSettings = {
  /** PresenceChatWidget.id assigned to this site. */
  widgetId?: string | null;
  /**
   * undefined/null = follow assigned widget enabled flag.
   * false = hide widget on this site even if widget enabled.
   */
  enabledOverride?: boolean | null;
  /** @deprecated Prefer widget.position — kept for legacy site JSON. */
  position?: PresenceWidgetPosition;
  /** @deprecated Prefer widget.includePaths */
  includePaths?: string[];
  /** @deprecated Prefer widget.excludePaths */
  excludePaths?: string[];
};

export const DEFAULT_PRESENCE_CONVERSATION_WIDGET: PresenceConversationWidgetSettings = {
  widgetId: null,
  enabledOverride: null,
  position: 'bottom-right',
  includePaths: [],
  excludePaths: [],
};

export type PresenceChatWidgetPlacement = {
  enabled: boolean;
  position?: PresenceWidgetPosition | null;
  includePaths?: string[] | null;
  excludePaths?: string[] | null;
};

function normalizePath(path: string): string {
  const raw = (path || '/').trim() || '/';
  if (raw === '/') return '/';
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, '') || '/';
}

function patternToRegExp(pattern: string): RegExp | null {
  const trimmed = pattern.trim();
  if (!trimmed) return null;
  let source = '';
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (ch === '*' && trimmed[i + 1] === '*') {
      source += '.*';
      i++;
    } else if (ch === '*') {
      source += '[^/]*';
    } else if (/[.+?^${}()|[\]\\]/.test(ch)) {
      source += `\\${ch}`;
    } else {
      source += ch;
    }
  }
  try {
    return new RegExp(`^${source}$`, 'i');
  } catch {
    return null;
  }
}

/** True when `path` matches any of the glob-like patterns. */
export function matchPresencePathPatterns(path: string, patterns: string[] | undefined | null): boolean {
  if (!patterns?.length) return false;
  const normalized = normalizePath(path);
  for (const pattern of patterns) {
    const re = patternToRegExp(normalizePath(pattern));
    if (re && re.test(normalized)) return true;
  }
  return false;
}

/**
 * Include empty = all pages. Exclude wins.
 */
export function isPresenceWidgetPathAllowed(
  path: string,
  settings: { includePaths?: string[] | null; excludePaths?: string[] | null },
): boolean {
  const include = (settings.includePaths || []).map((p) => p.trim()).filter(Boolean);
  const exclude = (settings.excludePaths || []).map((p) => p.trim()).filter(Boolean);
  if (exclude.length && matchPresencePathPatterns(path, exclude)) return false;
  if (!include.length) return true;
  return matchPresencePathPatterns(path, include);
}

export function normalizePresenceWidgetPosition(value: unknown): PresenceWidgetPosition {
  return (PRESENCE_WIDGET_POSITIONS as readonly string[]).includes(String(value || ''))
    ? (value as PresenceWidgetPosition)
    : 'bottom-right';
}

export function normalizePresencePathList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((p): p is string => typeof p === 'string').map((p) => p.trim()).filter(Boolean);
}

export function parsePresenceConversationWidget(settingsJson: unknown): PresenceConversationWidgetSettings {
  const root = asRecord(settingsJson);
  const raw = asRecord(root.conversationWidget);
  const enabledOverride =
    raw.enabledOverride === true ? true : raw.enabledOverride === false ? false : null;
  const widgetId =
    typeof raw.widgetId === 'string' && raw.widgetId.trim() ? raw.widgetId.trim() : null;

  return {
    widgetId,
    enabledOverride,
    position: normalizePresenceWidgetPosition(raw.position),
    includePaths: normalizePresencePathList(raw.includePaths),
    excludePaths: normalizePresencePathList(raw.excludePaths),
  };
}

/** Page-level override (legacy; prefer widget path rules). */
export type PresencePageWidgetOverride = {
  hidden?: boolean;
  position?: PresenceWidgetPosition;
};

export function parsePresencePageWidgetOverride(seoJson: unknown): PresencePageWidgetOverride {
  const raw = asRecord(asRecord(seoJson).conversationWidget);
  const positionRaw = typeof raw.position === 'string' ? raw.position : '';
  const position = (PRESENCE_WIDGET_POSITIONS as readonly string[]).includes(positionRaw)
    ? (positionRaw as PresenceWidgetPosition)
    : undefined;
  return {
    hidden: raw.hidden === true ? true : undefined,
    position,
  };
}

export function resolvePresenceWidgetPlacement(opts: {
  siteSettingsJson: unknown;
  pageSeoJson?: unknown;
  path: string;
  /** Assigned PresenceChatWidget placement (null = none). */
  widget: PresenceChatWidgetPlacement | null;
}): {
  show: boolean;
  position: PresenceWidgetPosition;
  widgetId: string | null;
} {
  const site = parsePresenceConversationWidget(opts.siteSettingsJson);
  const page = parsePresencePageWidgetOverride(opts.pageSeoJson);
  const widget = opts.widget;
  const assigned = Boolean(site.widgetId && widget);
  const widgetOk = assigned && widget!.enabled && site.enabledOverride !== false;
  const effectivePaths = widget
    ? {
        includePaths: widget.includePaths || [],
        excludePaths: widget.excludePaths || [],
      }
    : {
        includePaths: site.includePaths || [],
        excludePaths: site.excludePaths || [],
      };

  const pathOk = isPresenceWidgetPathAllowed(opts.path, effectivePaths);
  const show = Boolean(widgetOk && pathOk && !page.hidden);
  return {
    show,
    position: normalizePresenceWidgetPosition(
      widget?.position || page.position || site.position || 'bottom-right',
    ),
    widgetId: site.widgetId || null,
  };
}

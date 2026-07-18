/**
 * Org-level Inbox → Chat channel defaults + chatflow target rules (HubSpot-like IA).
 */

import { z } from 'zod';
import {
  isPresenceWidgetPathAllowed,
  matchPresencePathPatterns,
  normalizePresencePathList,
  normalizePresenceWidgetPosition,
  type PresenceWidgetPosition,
} from './presence-conversation-widget';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const PRESENCE_CHAT_TARGET_OPS = [
  'begins_with',
  'is',
  'contains',
  'matches_wildcard',
] as const;

export type PresenceChatTargetOp = (typeof PRESENCE_CHAT_TARGET_OPS)[number];

export const PresenceChatTargetRuleSchema = z.object({
  field: z.literal('website_url').default('website_url'),
  op: z.enum(PRESENCE_CHAT_TARGET_OPS),
  value: z.string().min(1).max(2048),
});

export type PresenceChatTargetRule = z.infer<typeof PresenceChatTargetRuleSchema>;

export const PresenceChatTargetRulesSchema = z.object({
  show: z.array(PresenceChatTargetRuleSchema).max(50).default([]),
  hide: z.array(PresenceChatTargetRuleSchema).max(50).default([]),
});

export type PresenceChatTargetRules = z.infer<typeof PresenceChatTargetRulesSchema>;

export const DEFAULT_PRESENCE_CHAT_TARGET_RULES: PresenceChatTargetRules = {
  show: [],
  hide: [],
};

export function parsePresenceChatTargetRules(value: unknown): PresenceChatTargetRules {
  const parsed = PresenceChatTargetRulesSchema.safeParse(value ?? {});
  if (parsed.success) return parsed.data;
  return { ...DEFAULT_PRESENCE_CHAT_TARGET_RULES };
}

/** Compile Target rules into legacy path glob lists for runtime matching. */
export function compileTargetRulesToPathLists(rules: PresenceChatTargetRules): {
  includePaths: string[];
  excludePaths: string[];
} {
  const toPattern = (rule: PresenceChatTargetRule): string | null => {
    const raw = rule.value.trim();
    if (!raw) return null;
    // Prefer path portion when a full URL is pasted.
    let path = raw;
    try {
      if (/^https?:\/\//i.test(raw)) {
        path = new URL(raw).pathname || '/';
      }
    } catch {
      /* keep raw */
    }
    if (!path.startsWith('/')) path = `/${path}`;
    if (rule.op === 'is') return path.replace(/\/+$/, '') || '/';
    if (rule.op === 'begins_with') {
      const base = path.replace(/\/+$/, '') || '/';
      return base === '/' ? '/**' : `${base}/**`;
    }
    if (rule.op === 'contains') {
      const token = path.replace(/^\//, '').replace(/\/+$/, '');
      return token ? `/**${token}**` : null;
    }
    // matches_wildcard — already a glob-like path
    return path;
  };

  return {
    includePaths: rules.show.map(toPattern).filter((p): p is string => Boolean(p)),
    excludePaths: rules.hide.map(toPattern).filter((p): p is string => Boolean(p)),
  };
}

export function matchChatTargetRule(urlOrPath: string, rule: PresenceChatTargetRule): boolean {
  const raw = (urlOrPath || '/').trim() || '/';
  let path = raw;
  let href = raw;
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      path = u.pathname || '/';
      href = u.href;
    }
  } catch {
    /* path only */
  }
  const value = rule.value.trim();
  if (!value) return false;

  if (rule.op === 'is') {
    const want = value.startsWith('/') ? value.replace(/\/+$/, '') || '/' : value;
    const got = path.replace(/\/+$/, '') || '/';
    return got.toLowerCase() === want.toLowerCase() || href.toLowerCase() === value.toLowerCase();
  }
  if (rule.op === 'begins_with') {
    return href.toLowerCase().startsWith(value.toLowerCase()) || path.toLowerCase().startsWith(
      (value.startsWith('/') ? value : `/${value}`).toLowerCase(),
    );
  }
  if (rule.op === 'contains') {
    return href.toLowerCase().includes(value.toLowerCase()) || path.toLowerCase().includes(value.toLowerCase());
  }
  // matches_wildcard against path (and href path patterns)
  let pattern = value;
  try {
    if (/^https?:\/\//i.test(value)) pattern = new URL(value).pathname || '/';
  } catch {
    /* keep */
  }
  return matchPresencePathPatterns(path, [pattern]);
}

export function isChatflowPathAllowed(
  urlOrPath: string,
  rules: PresenceChatTargetRules,
  legacy?: { includePaths?: string[]; excludePaths?: string[] },
): boolean {
  const hide = rules.hide || [];
  const show = rules.show || [];
  if (hide.some((r) => matchChatTargetRule(urlOrPath, r))) return false;
  if (show.length) {
    return show.some((r) => matchChatTargetRule(urlOrPath, r));
  }
  // Fall back to legacy path lists when Target rules empty
  if (legacy) {
    return isPresenceWidgetPathAllowed(urlOrPath, legacy);
  }
  return true;
}

export const InboxChatSettingsSchema = z.object({
  accentColor: z.string().max(32).optional(),
  fontFamily: z.string().max(64).optional(),
  allowAttachments: z.boolean().optional(),
  allowScreenCapture: z.boolean().optional(),
  /** left | right → bottom-left | bottom-right */
  placementSide: z.enum(['left', 'right']).optional(),
  allowDrag: z.boolean().optional(),
  availabilityMode: z.enum(['always', 'operating_hours', 'user_availability']).optional(),
  alwaysOpen: z.boolean().optional(),
  timezone: z.string().max(64).optional(),
  /** Simple daily window; v1 single range. */
  hoursStart: z.string().max(8).optional(),
  hoursEnd: z.string().max(8).optional(),
  availableReplyTime: z.string().max(120).optional(),
  awayMessage: z.string().max(500).optional(),
  afterHoursMessage: z.string().max(500).optional(),
});

export type InboxChatSettings = z.infer<typeof InboxChatSettingsSchema>;

export const DEFAULT_INBOX_CHAT_SETTINGS: Required<InboxChatSettings> = {
  accentColor: '#0f766e',
  fontFamily: 'system-ui',
  allowAttachments: false,
  allowScreenCapture: false,
  placementSide: 'right',
  allowDrag: true,
  availabilityMode: 'always',
  alwaysOpen: true,
  timezone: 'Asia/Kolkata',
  hoursStart: '00:00',
  hoursEnd: '23:59',
  availableReplyTime: 'Typically replies in a few minutes',
  awayMessage: 'We are away right now — leave a message and we will get back to you.',
  afterHoursMessage: 'We are currently outside operating hours. Leave a message and we will reply soon.',
};

export function parseInboxChatSettings(settingsJson: unknown): Required<InboxChatSettings> {
  const root = asRecord(settingsJson);
  const inbox = asRecord(root.inbox);
  const chat = asRecord(inbox.chat);
  const parsed = InboxChatSettingsSchema.safeParse(chat);
  const partial = parsed.success ? parsed.data : {};
  return { ...DEFAULT_INBOX_CHAT_SETTINGS, ...partial };
}

export function placementSideToPosition(side: 'left' | 'right'): PresenceWidgetPosition {
  return side === 'left' ? 'bottom-left' : 'bottom-right';
}

export function positionToPlacementSide(position: PresenceWidgetPosition | string | null | undefined): 'left' | 'right' {
  const p = normalizePresenceWidgetPosition(position);
  return p === 'bottom-left' || p === 'top-left' ? 'left' : 'right';
}

/** True when chat should accept new messages given org hours settings (UTC wall clock simplified). */
export function isInboxChatWithinHours(
  settings: Pick<
    Required<InboxChatSettings>,
    'availabilityMode' | 'alwaysOpen' | 'hoursStart' | 'hoursEnd' | 'timezone'
  >,
  now = new Date(),
): boolean {
  if (settings.availabilityMode === 'always' || settings.alwaysOpen) return true;
  if (settings.availabilityMode === 'user_availability') return true; // stub: treat as open
  // operating_hours — compare HH:mm in org timezone when possible
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: settings.timezone || 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const hh = parts.find((p) => p.type === 'hour')?.value || '00';
    const mm = parts.find((p) => p.type === 'minute')?.value || '00';
    const current = `${hh}:${mm}`;
    const start = settings.hoursStart || '00:00';
    const end = settings.hoursEnd || '23:59';
    if (start <= end) return current >= start && current <= end;
    // overnight window
    return current >= start || current <= end;
  } catch {
    return true;
  }
}

export function pathsFromLegacyOrTarget(opts: {
  targetRulesJson?: unknown;
  includePathsJson?: unknown;
  excludePathsJson?: unknown;
}): { includePaths: string[]; excludePaths: string[] } {
  const rules = parsePresenceChatTargetRules(opts.targetRulesJson);
  if ((rules.show.length || rules.hide.length) && opts.targetRulesJson) {
    return compileTargetRulesToPathLists(rules);
  }
  return {
    includePaths: normalizePresencePathList(opts.includePathsJson),
    excludePaths: normalizePresencePathList(opts.excludePathsJson),
  };
}

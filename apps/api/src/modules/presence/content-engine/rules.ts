import type { PresenceContentRule, PresenceVisitorContext } from '@wayrune/contracts';
import type { ResolveContext } from './types';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseRules(props: Record<string, unknown>): PresenceContentRule[] {
  const raw = props.rules;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is PresenceContentRule =>
      Boolean(r && typeof r === 'object' && typeof (r as PresenceContentRule).kind === 'string'),
  );
}

/** True when schedule allows the section/page to be visible at `now`. */
export function isWithinSchedule(
  schedule: { publishAt?: string | null; unpublishAt?: string | null } | undefined,
  now: Date,
): boolean {
  if (!schedule) return true;
  if (schedule.publishAt) {
    const t = new Date(schedule.publishAt).getTime();
    if (!Number.isNaN(t) && now.getTime() < t) return false;
  }
  if (schedule.unpublishAt) {
    const t = new Date(schedule.unpublishAt).getTime();
    if (!Number.isNaN(t) && now.getTime() >= t) return false;
  }
  return true;
}

function visitorMatches(
  when: PresenceContentRule['when'],
  visitor: PresenceVisitorContext | undefined,
): boolean {
  if (!when) return true;
  if (when.countries?.length) {
    const c = visitor?.country?.toUpperCase();
    if (!c || !when.countries.map((x) => x.toUpperCase()).includes(c)) return false;
  }
  if (when.devices?.length) {
    const d = visitor?.device ?? 'unknown';
    if (d === 'unknown' || !when.devices.includes(d as 'desktop' | 'mobile' | 'tablet')) {
      return false;
    }
  }
  if (when.utmSource?.length) {
    const src = (visitor?.utmSource ?? '').toLowerCase();
    if (!src || !when.utmSource.map((x) => x.toLowerCase()).includes(src)) return false;
  }
  return true;
}

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 100;
}

/**
 * Evaluate schedule / personalize / A/B rules on section props.
 * Returns null when the section should be hidden; otherwise merged props.
 */
export function evaluateRules(
  ctx: ResolveContext,
  props: Record<string, unknown>,
): Record<string, unknown> | null {
  const schedule = asRecord(props.schedule);
  if (
    !ctx.preview &&
    !isWithinSchedule(
      {
        publishAt: typeof schedule.publishAt === 'string' ? schedule.publishAt : null,
        unpublishAt: typeof schedule.unpublishAt === 'string' ? schedule.unpublishAt : null,
      },
      ctx.now,
    )
  ) {
    return null;
  }

  let next = { ...props };
  const rules = parseRules(props);

  for (const rule of rules) {
    if (rule.kind === 'schedule') {
      if (
        !ctx.preview &&
        !isWithinSchedule(
          {
            publishAt: rule.when?.publishAt,
            unpublishAt: rule.when?.unpublishAt,
          },
          ctx.now,
        )
      ) {
        return null;
      }
    }
    if (rule.kind === 'personalize') {
      if (!visitorMatches(rule.when, ctx.visitor)) continue;
      if (rule.propsOverride) {
        next = { ...next, ...asRecord(rule.propsOverride) };
      }
    }
    if (rule.kind === 'ab') {
      const seed = ctx.visitor?.variantSeed ?? `${ctx.site.id}:${props.id ?? 'section'}`;
      const bucket = hashSeed(seed);
      const pct = rule.trafficPercent ?? 50;
      const inVariant = bucket < pct;
      if (inVariant && rule.propsOverride) {
        next = {
          ...next,
          ...asRecord(rule.propsOverride),
          _abVariant: rule.variantKey ?? 'B',
        };
      } else {
        next = { ...next, _abVariant: 'A' };
      }
    }
  }

  // Inline A/B shorthand on props.ab
  const ab = asRecord(props.ab);
  if (ab.enabled === true && ab.variantB) {
    const seed = ctx.visitor?.variantSeed ?? `${ctx.site.id}:ab`;
    const bucket = hashSeed(seed);
    const pct = typeof ab.trafficPercent === 'number' ? ab.trafficPercent : 50;
    if (bucket < pct) {
      next = {
        ...next,
        ...asRecord(ab.variantB),
        _abVariant: String(ab.variantKey ?? 'B'),
      };
    } else {
      next = { ...next, _abVariant: 'A' };
    }
  }

  return next;
}

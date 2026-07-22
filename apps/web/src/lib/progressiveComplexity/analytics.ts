/** Lightweight analytics hook for Progressive Complexity + UX dogfood. */
import type { ExperienceAnalyticsEvent } from './types';

type AnalyticsProps = Record<
  string,
  string | number | boolean | null | undefined
>;

type PostHogLike = {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  identify?: (id: string, properties?: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    __wayrunePostHog?: PostHogLike;
  }
}

function posthogEnabled(): boolean {
  return Boolean(import.meta.env.VITE_POSTHOG_KEY);
}

/**
 * Lazy-load PostHog only when VITE_POSTHOG_KEY is set (named pilot orgs).
 * Session replay masks traveller / payment / PII selectors.
 * Demo-only orgs must not be treated as adoption proof.
 */
let posthogInit: Promise<PostHogLike | null> | null = null;

async function getPostHog(): Promise<PostHogLike | null> {
  if (!posthogEnabled() || typeof window === 'undefined') return null;
  if (window.__wayrunePostHog) return window.__wayrunePostHog;
  if (posthogInit) return posthogInit;

  posthogInit = (async () => {
    try {
      const mod = await import('posthog-js');
      const posthog = mod.default;
      posthog.init(String(import.meta.env.VITE_POSTHOG_KEY), {
        api_host:
          (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ||
          'https://us.i.posthog.com',
        person_profiles: 'identified_only',
        capture_pageview: true,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector:
            '[data-sensitive], [data-pii], input[type="password"], input[name*="passport"], input[name*="phone"], input[name*="email"], input[autocomplete="cc-number"]',
          blockSelector: '[data-ph-block], [data-supplier-commercial]',
        },
      });
      window.__wayrunePostHog = posthog;
      return posthog;
    } catch (err) {
      console.warn('[analytics] PostHog init failed', err);
      return null;
    }
  })();

  return posthogInit;
}

export function trackExperienceEvent(
  event: ExperienceAnalyticsEvent | string,
  properties?: AnalyticsProps,
) {
  if (import.meta.env.DEV) {
    console.debug('[experience]', event, properties);
  }

  void getPostHog().then((ph) => {
    ph?.capture(String(event), {
      ...properties,
      source: 'wayrune_web',
    });
  });
}

/** Call after auth with role / org / experience level for session replay taxonomy. */
export function identifyAnalyticsUser(input: {
  userId: string;
  role?: string;
  orgId?: string;
  journey?: string;
  tripId?: string;
  featureFlag?: string;
  userExperienceLevel?: string;
}) {
  void getPostHog().then((ph) => {
    ph?.identify?.(input.userId, {
      role: input.role,
      org_id: input.orgId,
      journey: input.journey,
      trip_id: input.tripId,
      feature_flag: input.featureFlag,
      user_experience_level: input.userExperienceLevel,
    });
  });
}

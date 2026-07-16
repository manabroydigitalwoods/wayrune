/** Lightweight analytics hook for Progressive Complexity validation. */
import type { ExperienceAnalyticsEvent } from './types';

export function trackExperienceEvent(
  event: ExperienceAnalyticsEvent,
  properties?: Record<string, string | number | boolean | null | undefined>,
) {
  if (import.meta.env.DEV) {
    console.debug('[experience]', event, properties);
  }
  // Future: wire to product analytics provider.
}

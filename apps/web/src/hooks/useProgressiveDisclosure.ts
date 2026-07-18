import { useMemo } from 'react';
import { usePersistentState } from '@wayrune/ui';
import type { DisclosureLevel } from '../lib/progressiveComplexity';

const ADVANCED_PREF_KEY = 'experience.showAdvancedByDefault';

/**
 * Controls whether advanced UI sections start expanded.
 * Never grants permissions — presentation only.
 */
export function useProgressiveDisclosure(level: DisclosureLevel) {
  const [showAdvancedByDefault] = usePersistentState(ADVANCED_PREF_KEY, false);
  const alwaysVisible = level === 'primary' || level === 'secondary';
  const defaultOpen = level === 'advanced' && showAdvancedByDefault;

  return useMemo(
    () => ({
      level,
      defaultOpen: alwaysVisible ? true : defaultOpen,
      showAdvancedByDefault,
      isAdvanced: level === 'advanced',
    }),
    [alwaysVisible, defaultOpen, level, showAdvancedByDefault],
  );
}

export { ADVANCED_PREF_KEY };

/** User preference for Settings and disclosure sections. */
export function useAdvancedToolsPreference() {
  return usePersistentState(ADVANCED_PREF_KEY, false);
}

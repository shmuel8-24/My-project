'use client';

import { useCallback } from 'react';

export type HapticType = 'light' | 'medium' | 'heavy';

const VIBRATION_PATTERNS: Record<HapticType, number[]> = {
  light:  [8],
  medium: [18],
  heavy:  [35],
};

/**
 * Thin wrapper around the Web Vibration API.
 * Silently no-ops on browsers or SSR contexts that don't support it.
 */
export function useHaptics() {
  const triggerHaptic = useCallback((type: HapticType = 'light') => {
    if (typeof navigator === 'undefined') return;
    if (!('vibrate' in navigator))        return;
    navigator.vibrate(VIBRATION_PATTERNS[type]);
  }, []);

  return { triggerHaptic };
}

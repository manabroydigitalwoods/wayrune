import { useEffect, useState } from 'react';
import { api } from '../api';
import type { FitClaimProgressInput } from '../lib/fitDogfoodCue';

type ClaimGatesSlim = {
  fitClaimProtocol?: FitClaimProgressInput | null;
};

/** Lightweight FIT claim protocol for trip workspace dogfood cue. */
export function useFitClaimProtocol(enabled: boolean) {
  const [protocol, setProtocol] = useState<FitClaimProgressInput | null>(null);

  useEffect(() => {
    if (!enabled) {
      setProtocol(null);
      return;
    }
    let cancelled = false;
    void api<ClaimGatesSlim>('/dashboard/claim-gates')
      .then((res) => {
        if (!cancelled) setProtocol(res.fitClaimProtocol ?? null);
      })
      .catch(() => {
        if (!cancelled) setProtocol(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return protocol;
}

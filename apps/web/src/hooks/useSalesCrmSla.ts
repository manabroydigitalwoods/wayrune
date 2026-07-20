import { useEffect, useState } from 'react';
import { api } from '../api';
import type { SalesSlaStats } from '../components/agency/SalesSlaHomeStats';

/** Shared GET /dashboard/sales payload for Leads, Inbox, and home strips. */
export function useSalesCrmSla(enabled: boolean) {
  const [data, setData] = useState<SalesSlaStats | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void api<SalesSlaStats>('/dashboard/sales')
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { data, loading };
}

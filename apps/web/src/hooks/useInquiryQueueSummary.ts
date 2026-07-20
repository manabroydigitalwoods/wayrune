import { useEffect, useState } from 'react';
import { api } from '../api';

export type InquiryQueueSummary = {
  myRequests: number;
  planning: number;
  planningIncomplete: number;
  planningUnassigned: number;
  planningStale: number;
  agingHours: number;
};

export function useInquiryQueueSummary(enabled = true) {
  const [data, setData] = useState<InquiryQueueSummary | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await api<InquiryQueueSummary>('/inquiries/queue-summary');
        if (!cancelled) {
          setData({
            ...res,
            planningStale: res.planningStale ?? 0,
            agingHours: res.agingHours ?? 4,
          });
        }
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { data, loading };
}

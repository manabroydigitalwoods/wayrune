import { useEffect, useState } from 'react';
import { api } from '../api';

export type InquiryQueueSummary = {
  myRequests: number;
  planning: number;
  planningIncomplete: number;
  planningUnassigned: number;
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
        if (!cancelled) setData(res);
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

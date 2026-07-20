/**
 * Client-side party stamp for draft revise (mirrors API stampApplyPaxOntoQuoteItems).
 * Used by Guided FIT revise moves — no new endpoint.
 */

const PAX_LINE_KINDS = new Set(['hotel', 'transfer', 'activity']);

export type InquiryPaxStamp = {
  adults: number;
  children: number;
  childAges?: number[];
};

export type StampableQuoteLine = {
  serviceType?: string | null;
  rateKind?: string | null;
  details?: Record<string, unknown> | null;
};

export function resolveInquiryPaxForStamp(input: {
  adults?: number | null;
  children?: number | null;
}): InquiryPaxStamp | null {
  const adults = Math.max(0, Math.round(Number(input.adults) || 0));
  const children = Math.max(0, Math.round(Number(input.children) || 0));
  if (adults <= 0 && children <= 0) return null;
  return { adults: adults || 1, children };
}

export function stampInquiryPaxOntoQuoteLines<T extends StampableQuoteLine>(
  items: T[],
  pax: InquiryPaxStamp,
): { items: T[]; stampedCount: number } {
  let stampedCount = 0;
  const next = items.map((item) => {
    const kind = item.rateKind || item.serviceType;
    if (!kind || !PAX_LINE_KINDS.has(kind)) return item;
    stampedCount += 1;
    const details: Record<string, unknown> = {
      ...(item.details || {}),
      adults: pax.adults,
      children: pax.children,
    };
    if (pax.children <= 0) {
      delete details.childAges;
      delete details.childrenWithoutBed;
    } else if (pax.childAges?.length) {
      details.childAges = pax.childAges;
    }
    return { ...item, details };
  });
  return { items: next, stampedCount };
}

export type QuoteLocalDraftPayload = {
  tripId: string;
  quotationId: string | null;
  versionId: string | null;
  versionLock: number | null;
  items: unknown[];
  meta: {
    inclusions: string;
    exclusions: string;
    terms: string;
    validUntil: string;
    /** Optional version display name (drafts before this field omit it). */
    label?: string;
  };
  updatedAt: number;
};

function storageKey(tripId: string) {
  return `wayrune:quote-draft:v1:${tripId}`;
}

export function readQuoteLocalDraft(tripId: string): QuoteLocalDraftPayload | null {
  try {
    const raw = localStorage.getItem(storageKey(tripId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuoteLocalDraftPayload;
    if (!parsed || parsed.tripId !== tripId || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeQuoteLocalDraft(draft: QuoteLocalDraftPayload): void {
  try {
    localStorage.setItem(storageKey(draft.tripId), JSON.stringify(draft));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export function clearQuoteLocalDraft(tripId: string): void {
  try {
    localStorage.removeItem(storageKey(tripId));
  } catch {
    /* ignore */
  }
}

/** Meta WhatsApp 24h customer-service window helpers. */

export const WHATSAPP_CUSTOMER_SESSION_MS = 24 * 60 * 60 * 1000;

export type WhatsappSessionInteractionRow = {
  createdAt: Date;
  rawPayloadJson: unknown;
};

export type WhatsappCustomerSession = {
  open: boolean;
  lastInboundAt: Date | null;
  expiresAt: Date | null;
  remainingMs: number;
};

export function phonesLikelyMatch(a: string, b: string): boolean {
  const x = a.replace(/\D/g, '');
  const y = b.replace(/\D/g, '');
  if (!x || !y) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}

/** True when the payload is a customer message (opens / refreshes the 24h window). */
export function isWhatsappCustomerInbound(
  rawPayloadJson: unknown,
  digits: string,
): boolean {
  const raw =
    rawPayloadJson &&
    typeof rawPayloadJson === 'object' &&
    !Array.isArray(rawPayloadJson)
      ? (rawPayloadJson as Record<string, unknown>)
      : {};
  if (raw.direction === 'outbound') return false;
  if (raw.direction === 'inbound') return true;
  const from = typeof raw.from === 'string' ? raw.from.replace(/\D/g, '') : '';
  return Boolean(from && phonesLikelyMatch(from, digits));
}

/**
 * Evaluate the 24h customer session from recent WhatsApp interaction rows.
 * Pass rows already scoped to ~24h (or wider); expiry is computed from the
 * latest inbound.
 */
export function evaluateWhatsappCustomerSession(
  rows: WhatsappSessionInteractionRow[],
  digits: string,
  now: Date = new Date(),
): WhatsappCustomerSession {
  let lastInboundAt: Date | null = null;
  for (const row of rows) {
    if (!isWhatsappCustomerInbound(row.rawPayloadJson, digits)) continue;
    if (!lastInboundAt || row.createdAt.getTime() > lastInboundAt.getTime()) {
      lastInboundAt = row.createdAt;
    }
  }
  if (!lastInboundAt) {
    return {
      open: false,
      lastInboundAt: null,
      expiresAt: null,
      remainingMs: 0,
    };
  }
  const expiresAt = new Date(
    lastInboundAt.getTime() + WHATSAPP_CUSTOMER_SESSION_MS,
  );
  const remainingMs = Math.max(0, expiresAt.getTime() - now.getTime());
  return {
    open: remainingMs > 0,
    lastInboundAt,
    expiresAt,
    remainingMs,
  };
}

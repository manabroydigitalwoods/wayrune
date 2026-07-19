/** Inbox WhatsApp 24h customer-session cue helpers. */

export type WhatsappSessionCue = {
  tone: 'ok' | 'closed';
  label: string;
};

/** Compact remaining-time label for the Inbox composer. */
export function formatWhatsappSessionRemaining(remainingMs: number): string {
  const ms = Math.max(0, Math.round(remainingMs));
  const h = Math.floor(ms / (60 * 60 * 1000));
  const m = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (h >= 1) return `${h}h ${m}m left`;
  if (m >= 1) return `${m}m left`;
  if (ms > 0) return 'under 1m left';
  return 'ended';
}

export function formatWhatsappSessionCue(input: {
  open: boolean;
  remainingMs: number;
  demo?: boolean;
}): WhatsappSessionCue {
  if (input.demo) {
    return {
      tone: 'ok',
      label: 'Demo · free-text replies allowed (Cloud session not enforced)',
    };
  }
  if (!input.open || input.remainingMs <= 0) {
    return {
      tone: 'closed',
      label: 'Session closed · send a Meta template or wait for the customer to message',
    };
  }
  return {
    tone: 'ok',
    label: `Session open · ${formatWhatsappSessionRemaining(input.remainingMs)}`,
  };
}

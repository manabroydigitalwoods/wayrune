import { api } from '../api';

/** Create/ensure payment link and return absolute pay URL. */
export async function copyTripPaymentLink(
  tripId: string,
  paymentId: string,
  opts?: { regenerate?: boolean },
): Promise<{ url: string; amountDue: number; currency: string; reused?: boolean }> {
  const res = await api<{
    path: string;
    amountDue: number;
    currency: string;
    reused?: boolean;
  }>(`/trips/${tripId}/payments/${paymentId}/payment-link`, {
    method: 'POST',
    body: JSON.stringify({ regenerate: Boolean(opts?.regenerate) }),
  });
  const url = `${window.location.origin}${res.path}`;
  await navigator.clipboard.writeText(url);
  return {
    url,
    amountDue: res.amountDue,
    currency: res.currency,
    reused: res.reused,
  };
}

export type SendPaymentLinkWhatsappResult = {
  sent?: boolean;
  cloudConfigured?: boolean;
  fallbackWaMeUrl?: string;
  demo?: boolean;
  message?: string;
};

/** Send payment-link WhatsApp (Cloud or wa.me fallback). */
export async function sendTripPaymentLinkWhatsapp(
  tripId: string,
  paymentId: string,
): Promise<SendPaymentLinkWhatsappResult> {
  return api<SendPaymentLinkWhatsappResult>(
    `/trips/${tripId}/payments/${paymentId}/send-payment-link-whatsapp`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

/** Staff confirm after manual wa.me chase. */
export async function markTripPaymentLinkSent(
  tripId: string,
  paymentId: string,
): Promise<void> {
  await api(`/trips/${tripId}/payments/${paymentId}/mark-payment-link-sent`, {
    method: 'POST',
    body: JSON.stringify({ channel: 'whatsapp' }),
  });
}

export function toastForPaymentLinkWhatsapp(
  res: SendPaymentLinkWhatsappResult,
):
  | { ok: true; message: string; openUrl?: string; needsMarkSent?: boolean }
  | { ok: false; message: string } {
  if (res.sent) {
    return {
      ok: true,
      message: res.demo
        ? 'Payment link marked sent (WhatsApp demo mode)'
        : 'Payment link sent on WhatsApp',
    };
  }
  if (res.fallbackWaMeUrl) {
    return {
      ok: true,
      needsMarkSent: true,
      message:
        res.message ||
        'Opened WhatsApp — mark as sent after you send the payment link',
      openUrl: res.fallbackWaMeUrl,
    };
  }
  return { ok: false, message: 'Could not send payment link on WhatsApp' };
}

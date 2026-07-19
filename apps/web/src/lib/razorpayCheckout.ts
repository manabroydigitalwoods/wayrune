/** Browser helper for Razorpay Checkout.js (public trip payment links). */

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
const SCRIPT_ATTR = 'data-razorpay-checkout';

export class RazorpayCheckoutCancelled extends Error {
  constructor(message = 'Checkout closed') {
    super(message);
    this.name = 'RazorpayCheckoutCancelled';
  }
}

export function isRazorpayCheckoutCancelled(err: unknown): boolean {
  return err instanceof RazorpayCheckoutCancelled;
}

export type RazorpayCheckoutResult = {
  razorpayPaymentId: string;
  razorpayOrderId: string;
  razorpaySignature: string;
};

export type OpenRazorpayCheckoutInput = {
  keyId: string;
  orderId: string;
  /** Amount in major currency units (e.g. INR rupees), matching pay-intent. */
  amount: number;
  currency: string;
  name?: string;
  description?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
};

type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = {
  open: () => void;
};

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

type RazorpayWindow = {
  Razorpay?: RazorpayConstructor;
};

let scriptPromise: Promise<void> | null = null;

function razorpayWindow(): RazorpayWindow | null {
  if (typeof globalThis === 'undefined') return null;
  return globalThis as unknown as RazorpayWindow;
}

function doc(): Document | null {
  if (typeof document === 'undefined') return null;
  return document;
}

/** Idempotent script loader for Checkout.js. */
export function loadRazorpayCheckoutScript(): Promise<void> {
  const win = razorpayWindow();
  const d = doc();
  if (!win || !d) {
    return Promise.reject(new Error('Razorpay Checkout requires a browser'));
  }
  if (win.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = d.querySelector(`script[${SCRIPT_ATTR}]`);
    if (existing) {
      if (win.Razorpay) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => {
          scriptPromise = null;
          reject(new Error('Could not load Razorpay Checkout'));
        },
        { once: true },
      );
      return;
    }

    const script = d.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.setAttribute(SCRIPT_ATTR, '1');
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load Razorpay Checkout'));
    };
    (d.body || d.head).appendChild(script);
  });

  return scriptPromise;
}

/** Reset loader state (tests only). */
export function resetRazorpayCheckoutScriptForTests(): void {
  scriptPromise = null;
}

/**
 * Opens Razorpay Checkout and resolves with payment ids + signature for pay-confirm.
 * Rejects with RazorpayCheckoutCancelled when the guest dismisses the modal.
 */
export async function openRazorpayCheckout(
  input: OpenRazorpayCheckoutInput,
): Promise<RazorpayCheckoutResult> {
  await loadRazorpayCheckoutScript();
  const win = razorpayWindow();
  const Razorpay = win?.Razorpay;
  if (!Razorpay) {
    throw new Error('Razorpay Checkout is unavailable');
  }

  const amountPaise = Math.round(Number(input.amount) * 100);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    throw new Error('Invalid payment amount');
  }

  return new Promise<RazorpayCheckoutResult>((resolve, reject) => {
    let settled = false;
    const instance = new Razorpay({
      key: input.keyId,
      amount: amountPaise,
      currency: (input.currency || 'INR').toUpperCase(),
      name: input.name?.trim() || 'Payment',
      description: input.description?.trim() || undefined,
      order_id: input.orderId,
      prefill: input.prefill,
      handler(response: RazorpayHandlerResponse) {
        settled = true;
        resolve({
          razorpayPaymentId: response.razorpay_payment_id,
          razorpayOrderId: response.razorpay_order_id,
          razorpaySignature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss() {
          if (!settled) reject(new RazorpayCheckoutCancelled());
        },
      },
    });
    instance.open();
  });
}

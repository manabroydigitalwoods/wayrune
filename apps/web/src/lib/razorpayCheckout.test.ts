import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isRazorpayCheckoutCancelled,
  loadRazorpayCheckoutScript,
  openRazorpayCheckout,
  RazorpayCheckoutCancelled,
  resetRazorpayCheckoutScriptForTests,
} from './razorpayCheckout';

type FakeWindow = {
  Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
};

describe('razorpayCheckout', () => {
  afterEach(() => {
    resetRazorpayCheckoutScriptForTests();
    vi.unstubAllGlobals();
  });

  it('detects cancelled checkout', () => {
    expect(isRazorpayCheckoutCancelled(new RazorpayCheckoutCancelled())).toBe(true);
    expect(isRazorpayCheckoutCancelled(new Error('fail'))).toBe(false);
  });

  it('loads Checkout.js once and reuses the promise', async () => {
    const appendChild = vi.fn((node: HTMLScriptElement) => {
      queueMicrotask(() => {
        (globalThis as FakeWindow).Razorpay = class {
          open() {}
        };
        node.onload?.(new Event('load') as unknown as Event);
      });
      return node;
    });
    const createElement = vi.fn(() => {
      const el = {
        src: '',
        async: false,
        onload: null as ((ev: Event) => void) | null,
        onerror: null as ((ev: Event) => void) | null,
        setAttribute: vi.fn(),
      };
      return el as unknown as HTMLScriptElement;
    });

    vi.stubGlobal('document', {
      querySelector: () => null,
      createElement,
      body: { appendChild },
      head: { appendChild },
    });
    vi.stubGlobal('globalThis', Object.assign(globalThis, { Razorpay: undefined }));

    const a = loadRazorpayCheckoutScript();
    const b = loadRazorpayCheckoutScript();
    await Promise.all([a, b]);
    expect(createElement).toHaveBeenCalledTimes(1);
    expect(appendChild).toHaveBeenCalledTimes(1);
  });

  it('opens Checkout and resolves handler response', async () => {
    type Opts = {
      handler: (r: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) => void;
      modal: { ondismiss: () => void };
    };
    let captured: Opts | null = null;
    class FakeRazorpay {
      constructor(opts: Opts) {
        captured = opts;
      }
      open() {
        captured?.handler({
          razorpay_payment_id: 'pay_1',
          razorpay_order_id: 'order_1',
          razorpay_signature: 'sig_1',
        });
      }
    }

    vi.stubGlobal('document', {
      querySelector: () => ({ addEventListener: vi.fn() }),
      createElement: vi.fn(),
      body: { appendChild: vi.fn() },
      head: { appendChild: vi.fn() },
    });
    (globalThis as FakeWindow).Razorpay = FakeRazorpay as unknown as FakeWindow['Razorpay'];

    const result = await openRazorpayCheckout({
      keyId: 'rzp_test',
      orderId: 'order_1',
      amount: 1500.5,
      currency: 'inr',
      name: 'Demo Travel',
      description: 'Balance · TRP-SEED-02',
    });

    expect(result).toEqual({
      razorpayPaymentId: 'pay_1',
      razorpayOrderId: 'order_1',
      razorpaySignature: 'sig_1',
    });
    expect(captured).toMatchObject({
      key: 'rzp_test',
      amount: 150050,
      currency: 'INR',
      order_id: 'order_1',
    });
  });

  it('rejects when guest dismisses the modal', async () => {
    type Opts = {
      handler: () => void;
      modal: { ondismiss: () => void };
    };
    class FakeRazorpay {
      constructor(private opts: Opts) {}
      open() {
        this.opts.modal.ondismiss();
      }
    }

    vi.stubGlobal('document', {
      querySelector: () => ({ addEventListener: vi.fn() }),
      createElement: vi.fn(),
      body: { appendChild: vi.fn() },
      head: { appendChild: vi.fn() },
    });
    (globalThis as FakeWindow).Razorpay = FakeRazorpay as unknown as FakeWindow['Razorpay'];

    await expect(
      openRazorpayCheckout({
        keyId: 'rzp_test',
        orderId: 'order_1',
        amount: 100,
        currency: 'INR',
      }),
    ).rejects.toBeInstanceOf(RazorpayCheckoutCancelled);
  });
});

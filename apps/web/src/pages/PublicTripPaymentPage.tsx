import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, CreditCard } from 'lucide-react';
import {
  Button,
  PublicPageSkeleton,
  formatCurrency,
  formatDate,
  toastError,
} from '@wayrune/ui';
import { api } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  isRazorpayCheckoutCancelled,
  openRazorpayCheckout,
} from '../lib/razorpayCheckout';

type PublicPayment = {
  token: string;
  label: string;
  status: string;
  amount: number;
  amountPaid: number;
  amountDue: number;
  currency: string;
  dueAt: string | null;
  expiresAt: string | null;
  paid: boolean;
  cancelled?: boolean;
  expired: boolean;
  trip: { tripNumber: string; title: string };
  organization: {
    name: string;
    logoUrl: string | null;
    supportEmail: string | null;
    supportPhone: string | null;
  };
  tax?: {
    taxLabel: string;
    gstin: string | null;
    placeOfSupply: string | null;
    destinationPlaceOfSupply: string | null;
    instalmentTaxShare: number;
    instalmentSellExTax: number;
    splitLines: string[];
    splitCue: string | null;
  } | null;
};

type PayIntent = {
  mode: 'mock' | 'razorpay' | string;
  amount: number;
  currency: string;
  paymentId?: string;
  keyId?: string;
  razorpayOrderId?: string;
  name?: string;
  description?: string;
  message?: string;
};

export function PublicTripPaymentPage() {
  const { token = '' } = useParams<{ token: string }>();
  useDocumentTitle('Pay instalment');
  const [data, setData] = useState<PublicPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<PublicPayment>(`/public/trip-payments/${encodeURIComponent(token)}`, {
      skipAuthRefresh: true,
    })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Payment link not found');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function payNow() {
    if (!token || !data || data.paid || data.expired || data.cancelled) return;
    setPaying(true);
    try {
      const intent = await api<PayIntent>(
        `/public/trip-payments/${encodeURIComponent(token)}/pay-intent`,
        { method: 'POST', skipAuthRefresh: true, body: JSON.stringify({}) },
      );

      if (intent.mode === 'mock') {
        const updated = await api<PublicPayment>(
          `/public/trip-payments/${encodeURIComponent(token)}/pay-confirm`,
          {
            method: 'POST',
            skipAuthRefresh: true,
            body: JSON.stringify({ mock: true }),
          },
        );
        setData(updated);
        return;
      }

      if (
        intent.mode !== 'razorpay' ||
        !intent.keyId ||
        !intent.razorpayOrderId
      ) {
        toastError(intent.message || 'Payment checkout is unavailable');
        return;
      }

      const checkout = await openRazorpayCheckout({
        keyId: intent.keyId,
        orderId: intent.razorpayOrderId,
        amount: intent.amount,
        currency: intent.currency || data.currency,
        name: intent.name || data.organization.name,
        description:
          intent.description || `${data.label} · ${data.trip.tripNumber}`,
      });

      const updated = await api<PublicPayment>(
        `/public/trip-payments/${encodeURIComponent(token)}/pay-confirm`,
        {
          method: 'POST',
          skipAuthRefresh: true,
          body: JSON.stringify({
            mock: false,
            razorpayPaymentId: checkout.razorpayPaymentId,
            razorpayOrderId: checkout.razorpayOrderId,
            razorpaySignature: checkout.razorpaySignature,
          }),
        },
      );
      setData(updated);
    } catch (e) {
      if (isRazorpayCheckoutCancelled(e)) return;
      toastError(e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return <PublicPageSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-slate-900">Link unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">
            {error || 'This payment link was not found.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_#e8f2ef_0%,_#f8fafc_55%)] px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          {data.organization.logoUrl ? (
            <img
              src={data.organization.logoUrl}
              alt=""
              className="mx-auto mb-3 h-10 w-auto object-contain"
            />
          ) : null}
          <div className="text-sm font-medium tracking-wide text-slate-500">
            {data.organization.name}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{data.label}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {data.trip.tripNumber} · {data.trip.title}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur">
          {data.paid ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="size-12 text-emerald-600" />
              <div className="text-lg font-semibold text-slate-900">Payment received</div>
              <p className="text-sm text-slate-600">
                Thank you. {formatCurrency(data.amountPaid || data.amount, data.currency)} has
                been recorded.
              </p>
            </div>
          ) : data.cancelled ? (
            <div className="py-4 text-center">
              <div className="text-lg font-semibold text-slate-900">Instalment cancelled</div>
              <p className="mt-2 text-sm text-slate-600">
                This payment request is no longer active. Contact your travel advisor if you
                still need to pay.
              </p>
            </div>
          ) : data.expired ? (
            <div className="py-4 text-center">
              <div className="text-lg font-semibold text-slate-900">Link expired</div>
              <p className="mt-2 text-sm text-slate-600">
                Ask your travel advisor for a fresh payment link.
              </p>
            </div>
          ) : (
            <>
              <div className="text-center">
                <div className="text-xs uppercase tracking-wide text-slate-500">Amount due</div>
                <div className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
                  {formatCurrency(data.amountDue, data.currency)}
                </div>
                {data.dueAt ? (
                  <div className="mt-1 text-xs text-slate-500">
                    Due {formatDate(data.dueAt)}
                  </div>
                ) : null}
                {data.tax ? (
                  <div className="mt-4 space-y-0.5 border-t border-slate-100 pt-3 text-left text-[11px] text-slate-500">
                    <div className="flex justify-between gap-2 tabular-nums">
                      <span>Before tax</span>
                      <span>
                        {formatCurrency(data.tax.instalmentSellExTax, data.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 tabular-nums">
                      <span>{data.tax.taxLabel || 'Tax'}</span>
                      <span>
                        {formatCurrency(data.tax.instalmentTaxShare, data.currency)}
                      </span>
                    </div>
                    {data.tax.splitLines.map((line) => (
                      <div
                        key={line}
                        className="flex justify-between gap-2 tabular-nums"
                      >
                        <span>{line.split(' ')[0]}</span>
                        <span>{line.replace(/^\S+\s+/, '')}</span>
                      </div>
                    ))}
                    {data.tax.gstin ? <p>GSTIN: {data.tax.gstin}</p> : null}
                    {data.tax.placeOfSupply ? (
                      <p>Place of supply: {data.tax.placeOfSupply}</p>
                    ) : null}
                    {data.tax.destinationPlaceOfSupply ? (
                      <p>Destination POS: {data.tax.destinationPlaceOfSupply}</p>
                    ) : null}
                    {data.tax.splitCue ? <p>{data.tax.splitCue}</p> : (
                      <p>Tax share from accepted quote — display only, not a GST invoice</p>
                    )}
                  </div>
                ) : null}
              </div>
              <Button
                className="mt-6 w-full"
                size="lg"
                disabled={paying}
                onClick={() => void payNow()}
              >
                <CreditCard className="size-4" />
                {paying ? 'Processing…' : 'Pay now'}
              </Button>
              <p className="mt-3 text-center text-xs text-slate-500">
                Secure checkout for this instalment
              </p>
            </>
          )}
        </div>

        {(data.organization.supportEmail || data.organization.supportPhone) && (
          <p className="mt-6 text-center text-xs text-slate-500">
            Need help?
            {data.organization.supportEmail
              ? ` ${data.organization.supportEmail}`
              : ''}
            {data.organization.supportPhone
              ? ` · ${data.organization.supportPhone}`
              : ''}
          </p>
        )}
      </div>
    </div>
  );
}

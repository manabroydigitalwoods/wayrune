import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Plane } from 'lucide-react';
import {
  Button,
  PublicPageSkeleton,
  SoftIcon,
  formatCurrency,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  ItineraryPreviewView,
  type CustomerQuotePayload,
  type ItineraryPreviewPayload,
} from '../components/trips/ItineraryPreviewView';
import { FamilySharingPanel } from '../components/trips/FamilySharingPanel';

export function PublicItineraryPage() {
  const { token } = useParams();
  const [data, setData] = useState<ItineraryPreviewPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [acceptPin, setAcceptPin] = useState('');
  const [acceptedMessage, setAcceptedMessage] = useState('');

  useDocumentTitle(data ? `${data.trip.title} · Itinerary` : 'Shared itinerary');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api<ItineraryPreviewPayload>(
          `/public/itinerary/${encodeURIComponent(token)}`,
          {
            skipAuthRefresh: true,
          },
        );
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'This share link is unavailable');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function acceptQuote() {
    if (!token) return;
    setAccepting(true);
    try {
      let pin = acceptPin.trim();
      if (!pin) {
        try {
          const raw = localStorage.getItem(`proposal-family:${token}`);
          if (raw) {
            const parsed = JSON.parse(raw) as { pin?: string };
            if (parsed.pin) pin = parsed.pin;
          }
        } catch {
          /* ignore */
        }
      }
      const res = await api<{
        alreadyAccepted?: boolean;
        message?: string;
        quotation?: CustomerQuotePayload;
        canAcceptQuote?: boolean;
      }>(`/public/itinerary/${encodeURIComponent(token)}/accept-quote`, {
        method: 'POST',
        skipAuthRefresh: true,
        body: JSON.stringify(pin ? { pin } : {}),
      });
      setAcceptedMessage(
        res.message ||
          (res.alreadyAccepted
            ? 'This proposal was already accepted.'
            : 'Thank you — your proposal is accepted.'),
      );
      setData((prev) =>
        prev
          ? {
              ...prev,
              quotation: res.quotation ?? prev.quotation,
              canAcceptQuote: false,
            }
          : prev,
      );
      toastSuccess(res.alreadyAccepted ? 'Already accepted' : 'Proposal accepted');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not accept proposal');
    } finally {
      setAccepting(false);
    }
  }

  const canAccept = Boolean(data?.canAcceptQuote && data.quotation);
  const quote = data?.quotation;
  const alreadyAccepted = quote?.status === 'accepted';

  if (loading) {
    return <PublicPageSkeleton />;
  }

  return (
    <div className="light relative min-h-screen overflow-hidden text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[hsl(150_28%_94%)]" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(980px 640px at 12% -8%, hsl(152 55% 78% / 0.95) 0%, transparent 58%),
            radial-gradient(820px 520px at 92% 4%, hsl(198 62% 82% / 0.85) 0%, transparent 52%),
            radial-gradient(700px 480px at 70% 100%, hsl(168 45% 82% / 0.7) 0%, transparent 55%),
            radial-gradient(560px 360px at 0% 70%, hsl(140 40% 86% / 0.65) 0%, transparent 50%)
          `,
        }}
      />
      <div className="relative mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8 flex justify-center">
          <SoftIcon icon={Plane} />
        </div>
        {error ? (
          <div className="mx-auto max-w-md rounded-2xl border border-white/70 p-8 text-center glass-strong">
            <h1 className="font-display text-xl font-semibold">Link unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </div>
        ) : data ? (
          <div className="proposal-atmosphere space-y-6">
            <div className="rounded-2xl border border-white/70 p-5 text-foreground glass-strong sm:p-8">
              <ItineraryPreviewView data={data} />
            </div>

            {canAccept || alreadyAccepted || acceptedMessage ? (
              <div className="rounded-2xl border border-white/70 p-5 glass-strong sm:p-6">
                {alreadyAccepted || acceptedMessage ? (
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                    <div>
                      <p className="font-medium">Proposal accepted</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {acceptedMessage ||
                          'Thank you — we have recorded your acceptance and will follow up shortly.'}
                      </p>
                      {quote ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {quote.quoteNumber}
                          {quote.sellTotal != null
                            ? ` · ${formatCurrency(quote.sellTotal, quote.currency)}`
                            : ''}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">Ready to proceed?</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Accept this proposal to confirm with {data.agency.name}.
                          {quote
                            ? ` Total ${formatCurrency(quote.sellTotal, quote.currency)}.`
                            : ''}
                        </p>
                      </div>
                      <Button
                        type="button"
                        className="shrink-0"
                        disabled={accepting}
                        onClick={() => void acceptQuote()}
                      >
                        {accepting ? 'Accepting…' : 'Accept proposal'}
                      </Button>
                    </div>
                    <div className="max-w-xs">
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Family PIN (required when the agency set one)
                      </label>
                      <input
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={acceptPin}
                        onChange={(e) => setAcceptPin(e.target.value)}
                        placeholder="6-digit PIN"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {token ? <FamilySharingPanel mode="public" token={token} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

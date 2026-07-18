import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, RecordDialog, formatCurrency } from '@wayrune/ui';
import { api } from '../../api';
import {
  buildQuoteImportCandidates,
  serviceTypeLabel,
  type QuoteImportCandidate,
  type QuoteImportRatePreview,
} from '../../lib/quoteImportFromItinerary';
import { toPlaceRef } from '../../lib/placeRefs';

type DayInput = {
  dayNumber: number;
  date?: string | null;
  destination?: unknown;
  items?: Array<{
    id: string;
    title?: string;
    type?: string;
    customerVisible?: boolean;
    location?: unknown;
    details?: Record<string, unknown>;
  }>;
};

type RateResolveRow = {
  itemId: string;
  matched: boolean;
  rateKind: 'hotel' | 'transfer' | null;
  rateId: string | null;
  unitCost: number;
  unitSell: number;
  quantity: number;
  taxPercent: number;
  pricingUnit: string;
  rateMeta?: Record<string, unknown> | null;
};

function CandidateRow({
  row,
  onToggle,
}: {
  row: QuoteImportCandidate;
  onToggle: (id: string, selected: boolean) => void;
}) {
  const preview = row.ratePreview;
  return (
    <li>
      <button
        type="button"
        className={`flex w-full cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
          row.selected
            ? 'border-primary/40 bg-primary/5'
            : 'border-border/60 hover:bg-muted/40'
        }`}
        aria-pressed={row.selected}
        onClick={() => onToggle(row.id, !row.selected)}
      >
        <span
          className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border text-[10px] ${
            row.selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-muted-foreground/40 bg-background'
          }`}
          aria-hidden
        >
          {row.selected ? '✓' : ''}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {serviceTypeLabel(row.serviceType)}
            </span>
            <span className="text-xs text-muted-foreground">Day {row.dayNumber}</span>
            {row.disposition === 'included_with_hotel' ? (
              <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                Included with hotel
              </span>
            ) : null}
            {row.disposition === 'no_price_required' ? (
              <span className="text-[10px] font-medium text-muted-foreground">
                No separate price
              </span>
            ) : null}
            {row.disposition === 'import_as_service' &&
            row.serviceType === 'activity' &&
            !row.selected ? (
              <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                Potential activity
              </span>
            ) : null}
            {preview?.status === 'loading' ? (
              <span className="text-[10px] text-muted-foreground">Matching rate…</span>
            ) : null}
            {preview?.status === 'matched' ? (
              <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                Rate matched
              </span>
            ) : null}
            {preview?.status === 'unmatched' ? (
              <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                No rate match
              </span>
            ) : null}
            {preview?.status === 'error' ? (
              <span className="text-[10px] font-medium text-destructive">Rate lookup failed</span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-sm font-medium">{row.title}</p>
          <p className="text-xs text-muted-foreground">{row.reason}</p>
          {preview?.status === 'matched' &&
          preview.unitCost != null &&
          preview.unitSell != null ? (
            <p className="mt-1 text-xs tabular-nums text-foreground">
              Buy {formatCurrency(preview.unitCost)}
              {preview.quantity && preview.quantity > 1
                ? ` × ${preview.quantity}`
                : ''}{' '}
              → Sell {formatCurrency(preview.unitSell)}
              {preview.rateMeta && typeof preview.rateMeta.roomType === 'string' ? (
                <span className="text-muted-foreground">
                  {' '}
                  · {preview.rateMeta.roomType}
                </span>
              ) : null}
            </p>
          ) : null}
          {preview?.status === 'unmatched' ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {preview.message ||
                'No active matching rate for these dates — enter prices after import.'}
            </p>
          ) : null}
        </div>
      </button>
    </li>
  );
}

function ImportSection({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!count) return null;
  return (
    <section className="rounded-lg border border-border/50">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronDown
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">— {count}</span>
      </button>
      {open ? <ul className="space-y-2 border-t border-border/40 px-2 py-2">{children}</ul> : null}
    </section>
  );
}

export function QuoteImportReviewDialog({
  open,
  onOpenChange,
  days,
  tripStartDate,
  existingLineIds,
  partyAdults,
  partyChildren,
  partyInfants,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  days: DayInput[];
  tripStartDate?: string | null;
  existingLineIds: Set<string>;
  partyAdults?: number;
  partyChildren?: number;
  partyInfants?: number;
  onConfirm: (selected: QuoteImportCandidate[]) => void | Promise<void>;
}) {
  const initial = useMemo(
    () =>
      buildQuoteImportCandidates({
        days,
        tripStartDate,
        existingLineIds,
        placeIdFrom: (loc) => toPlaceRef(loc)?.placeId || undefined,
      }),
    [days, tripStartDate, existingLineIds],
  );

  const [rows, setRows] = useState<QuoteImportCandidate[]>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [matchingRates, setMatchingRates] = useState(false);

  useEffect(() => {
    if (open) setRows(initial);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const resolvable = initial.filter((r) => r.resolveItem);
    if (!resolvable.length) return;

    let cancelled = false;
    setMatchingRates(true);
    setRows((prev) =>
      prev.map((r) =>
        r.resolveItem
          ? { ...r, ratePreview: { status: 'loading' } satisfies QuoteImportRatePreview }
          : r,
      ),
    );

    void (async () => {
      try {
        const res = await api<{
          items: RateResolveRow[];
          matchedCount: number;
          unmatchedCount: number;
        }>('/rates/resolve', {
          method: 'POST',
          body: JSON.stringify({
            startDate: tripStartDate || undefined,
            adults: partyAdults || undefined,
            children: partyChildren || undefined,
            infants: partyInfants || undefined,
            items: resolvable.map((r) => r.resolveItem!),
          }),
        });
        if (cancelled) return;
        const map = new Map(res.items.map((i) => [i.itemId, i]));
        setRows((prev) =>
          prev.map((r) => {
            if (!r.resolveItem) return r;
            const hit = map.get(r.lineId);
            if (!hit) {
              return {
                ...r,
                ratePreview: {
                  status: 'unmatched',
                  message: 'No active matching rate found for these dates.',
                },
              };
            }
            if (!hit.matched) {
              return {
                ...r,
                ratePreview: {
                  status: 'unmatched',
                  rateKind: hit.rateKind,
                  message: 'No active matching rate found for these dates.',
                },
              };
            }
            return {
              ...r,
              ratePreview: {
                status: 'matched',
                unitCost: hit.unitCost,
                unitSell: hit.unitSell,
                quantity: hit.quantity,
                taxPercent: hit.taxPercent,
                pricingUnit: hit.pricingUnit,
                rateId: hit.rateId,
                rateKind: hit.rateKind,
                rateMeta: hit.rateMeta ?? null,
              },
            };
          }),
        );
      } catch {
        if (cancelled) return;
        setRows((prev) =>
          prev.map((r) =>
            r.resolveItem
              ? {
                  ...r,
                  ratePreview: {
                    status: 'error',
                    message: 'Could not look up rates — you can still import and price manually.',
                  },
                }
              : r,
          ),
        );
      } finally {
        if (!cancelled) setMatchingRates(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, initial, tripStartDate, partyAdults, partyChildren, partyInfants]);

  const selectedCount = rows.filter((r) => r.selected).length;
  const commercial = rows.filter((r) => r.disposition === 'import_as_service');
  const included = rows.filter((r) => r.disposition === 'included_with_hotel');
  const noPrice = rows.filter((r) => r.disposition === 'no_price_required');
  const matchedPreviewCount = rows.filter((r) => r.ratePreview?.status === 'matched').length;
  const unmatchedPreviewCount = rows.filter((r) => r.ratePreview?.status === 'unmatched').length;

  function toggle(id: string, selected: boolean) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, selected } : r)));
  }

  function selectRecommended() {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        selected: r.disposition === 'import_as_service' && r.serviceType !== 'activity',
      })),
    );
  }

  async function submit() {
    const picked = rows.filter((r) => r.selected);
    if (!picked.length) return;
    setSubmitting(true);
    try {
      await onConfirm(picked);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import itinerary services"
      description="Choose commercial services to price. Rate matching runs before import so you can see buy/sell previews."
      size="lg"
      submitDisabled={!selectedCount || submitting || matchingRates}
      submitLabel={
        submitting
          ? 'Importing…'
          : matchingRates
            ? 'Matching rates…'
            : selectedCount === 0
              ? 'Select at least one service'
              : `Import ${selectedCount} commercial service${selectedCount === 1 ? '' : 's'}`
      }
      onSubmit={() => void submit()}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{commercial.length} commercial</span>
        <span>·</span>
        <span>{included.length} included with hotel</span>
        <span>·</span>
        <span>{noPrice.length} no separate price</span>
        {matchingRates ? (
          <>
            <span>·</span>
            <span>Matching rates…</span>
          </>
        ) : matchedPreviewCount + unmatchedPreviewCount > 0 ? (
          <>
            <span>·</span>
            <span className="text-emerald-700 dark:text-emerald-400">
              {matchedPreviewCount} matched
            </span>
            {unmatchedPreviewCount ? (
              <span className="text-amber-700 dark:text-amber-400">
                · {unmatchedPreviewCount} need rates
              </span>
            ) : null}
          </>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-7 cursor-pointer"
          onClick={selectRecommended}
        >
          Select recommended services
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No new itinerary items to import. Add hotels, transfers or activities on the Itinerary tab
          first.
        </p>
      ) : (
        <div className="max-h-[min(28rem,55vh)] space-y-3 overflow-y-auto pr-1">
          <ImportSection title="Commercial services" count={commercial.length} defaultOpen>
            {commercial.map((row) => (
              <CandidateRow key={row.id} row={row} onToggle={toggle} />
            ))}
          </ImportSection>
          <ImportSection
            title="Likely included with hotel"
            count={included.length}
            defaultOpen={false}
          >
            {included.map((row) => (
              <CandidateRow key={row.id} row={row} onToggle={toggle} />
            ))}
          </ImportSection>
          <ImportSection
            title="No separate price required"
            count={noPrice.length}
            defaultOpen={false}
          >
            {noPrice.map((row) => (
              <CandidateRow key={row.id} row={row} onToggle={toggle} />
            ))}
          </ImportSection>
        </div>
      )}
    </RecordDialog>
  );
}

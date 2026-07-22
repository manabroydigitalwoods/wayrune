import { CheckCircle2, Circle } from 'lucide-react';
import { humanizeFieldKeys } from '@wayrune/ui';
import type { InquiryProposalReadiness } from '@wayrune/contracts';
import { DETAIL_PANEL_SHELL } from '../detail';

type Props = {
  readiness: InquiryProposalReadiness;
  /** Legacy commercial missing fields (auto-qualify). */
  commercialMissing?: string[];
};

export function ProposalReadinessPanel({ readiness, commercialMissing = [] }: Props) {
  const { draftable, itinerarySeedable, itineraryGaps, quotationReadiness } = readiness;
  const needsConfirm =
    quotationReadiness.missingPreferences.length +
    quotationReadiness.pricingSensitive.length;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={DETAIL_PANEL_SHELL}>
        <h3 className="text-[length:var(--control-text-sm)] font-semibold">Proposal readiness</h3>
        <ul className="mt-2 space-y-1.5">
          {draftable ? (
            <li className="flex items-start gap-2 text-[length:var(--control-text-sm)] text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Ready to build a proposal
                {!itinerarySeedable ? (
                  <span className="mt-1 block text-muted-foreground">
                    Dates are still needed to generate the day-by-day itinerary
                    {itineraryGaps.length
                      ? ` (${humanizeFieldKeys(itineraryGaps)})`
                      : ''}
                    .
                  </span>
                ) : null}
              </span>
            </li>
          ) : (
            readiness.draftableGaps.map((g) => (
              <li
                key={g}
                className="flex items-center gap-2 text-[length:var(--control-text-sm)]"
              >
                <Circle className="size-3.5 shrink-0 text-amber-600" />
                {humanizeFieldKeys([g])}
              </li>
            ))
          )}
        </ul>
        {commercialMissing.length > 0 ? (
          <p className="mt-3 border-t border-border/50 pt-2.5 text-[length:var(--control-text-sm)] text-muted-foreground">
            For qualification: {humanizeFieldKeys(commercialMissing)}
          </p>
        ) : null}
      </div>
      <div className={DETAIL_PANEL_SHELL}>
        <h3 className="text-[length:var(--control-text-sm)] font-semibold">Quotation readiness</h3>
        <ul className="mt-2 space-y-1.5 text-[length:var(--control-text-sm)]">
          <li className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5 shrink-0" />
            Can start pricing
            {needsConfirm > 0 ? (
              <span className="text-muted-foreground">
                · {needsConfirm} detail{needsConfirm === 1 ? '' : 's'} may need review
              </span>
            ) : null}
          </li>
        </ul>
        {quotationReadiness.pricingSensitive.length > 0 ? (
          <div className="mt-3 border-t border-border/50 pt-2.5">
            <p className="text-[length:var(--control-text-sm)] font-medium text-muted-foreground">
              Required before sending
            </p>
            <p className="mt-1 text-[length:var(--control-text-sm)] text-muted-foreground">
              {humanizeFieldKeys(quotationReadiness.pricingSensitive)}
            </p>
          </div>
        ) : null}
        {quotationReadiness.missingPreferences.length > 0 ? (
          <div className="mt-2">
            <p className="text-[length:var(--control-text-sm)] font-medium text-muted-foreground">
              Optional preferences
            </p>
            <p className="mt-1 text-[length:var(--control-text-sm)] text-muted-foreground">
              {humanizeFieldKeys(quotationReadiness.missingPreferences)}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

import { CheckCircle2, Circle } from 'lucide-react';
import { humanizeFieldKeys } from '@wayrune/ui';
import { DETAIL_PANEL_SHELL } from '../detail';

type RequirementSummaryProps = {
  captured: string[];
  missing: string[];
  /** Display-only gaps that are not part of API `missingFieldsJson`. */
  optionalGaps?: string[];
};

export function RequirementSummaryCards({
  captured,
  missing,
  optionalGaps = [],
}: RequirementSummaryProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={DETAIL_PANEL_SHELL}>
        <h3 className="text-[length:var(--control-text-sm)] font-semibold">Captured</h3>
        <ul className="mt-2 space-y-1.5">
          {captured.length ? (
            captured.map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 text-[length:var(--control-text-sm)]"
              >
                <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
                {item}
              </li>
            ))
          ) : (
            <li className="text-[length:var(--control-text-sm)] text-muted-foreground">
              Details will appear as you fill the form.
            </li>
          )}
        </ul>
      </div>
      <div className={DETAIL_PANEL_SHELL}>
        <h3 className="text-[length:var(--control-text-sm)] font-semibold">Requirements status</h3>
        <ul className="mt-2 space-y-1.5">
          {missing.length ? (
            missing.map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 text-[length:var(--control-text-sm)]"
              >
                <Circle className="size-3.5 shrink-0 text-amber-600" />
                {humanizeFieldKeys([item])}
              </li>
            ))
          ) : (
            <li className="flex items-center gap-2 text-[length:var(--control-text-sm)] text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5 shrink-0" />
              Minimum information captured
            </li>
          )}
        </ul>
        {optionalGaps.length > 0 ? (
          <div className="mt-3 border-t border-border/50 pt-2.5">
            <p className="text-[length:var(--control-text-sm)] font-medium text-muted-foreground">
              Optional details not added
            </p>
            <p className="mt-1 text-[length:var(--control-text-sm)] text-muted-foreground">
              {optionalGaps.join(' · ')}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

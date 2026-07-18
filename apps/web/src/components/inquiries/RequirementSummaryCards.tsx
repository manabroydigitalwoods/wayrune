import { CheckCircle2, Circle } from 'lucide-react';
import { humanizeFieldKeys } from '@wayrune/ui';

type RequirementSummaryProps = {
  captured: string[];
  missing: string[];
};

export function RequirementSummaryCards({ captured, missing }: RequirementSummaryProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-border/60 p-4">
        <h3 className="text-sm font-semibold">Captured</h3>
        <ul className="mt-3 space-y-2">
          {captured.length ? (
            captured.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                {item}
              </li>
            ))
          ) : (
            <li className="text-sm text-muted-foreground">Details will appear as you fill the form.</li>
          )}
        </ul>
      </div>
      <div className="rounded-xl border border-border/60 p-4">
        <h3 className="text-sm font-semibold">Still needed</h3>
        <ul className="mt-3 space-y-2">
          {missing.length ? (
            missing.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm">
                <Circle className="size-4 shrink-0 text-amber-600" />
                {humanizeFieldKeys([item])}
              </li>
            ))
          ) : (
            <li className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="size-4 shrink-0" />
              All core requirements captured
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

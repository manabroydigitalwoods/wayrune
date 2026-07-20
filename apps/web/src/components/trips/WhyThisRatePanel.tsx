import { partitionMatchAcceptedForDisplay } from '@wayrune/contracts';
import { DisclosureSection } from '../agency/DisclosureSection';

export type WhyThisRateRejected = {
  rateId?: string;
  label: string;
  reason: string;
};

type Props = {
  /** Successful match vs unmatched / blocked notes. */
  mode?: 'selected' | 'notes';
  accepted: string[];
  rejected?: WhyThisRateRejected[];
  className?: string;
};

/** Always-visible Why this rate / Match notes strip (hotel · transfer · activity). */
export function WhyThisRatePanel({
  mode = 'selected',
  accepted,
  rejected = [],
  className,
}: Props) {
  if (!accepted.length && !rejected.length) return null;
  const title = mode === 'notes' ? 'Match notes' : 'Why this rate';
  const bullet = mode === 'notes' ? '•' : '✓';
  const { primary, secondary } = partitionMatchAcceptedForDisplay(accepted);
  const rejectedTitle =
    mode === 'notes'
      ? `${rejected.length} rate${rejected.length === 1 ? '' : 's'} considered`
      : `${rejected.length} other rate${rejected.length === 1 ? '' : 's'} considered`;
  const moreTitle =
    secondary.length === 1
      ? '1 more match note'
      : `${secondary.length} more match notes`;

  return (
    <div
      className={
        className ??
        'rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 text-xs'
      }
    >
      {primary.length || secondary.length ? (
        <>
          <p className="font-medium text-foreground">{title}</p>
          {primary.length ? (
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {primary.map((reason) => (
                <li key={reason}>
                  {bullet} {reason}
                </li>
              ))}
            </ul>
          ) : null}
          {secondary.length ? (
            <DisclosureSection
              title={moreTitle}
              level="none"
              defaultOpen={false}
              className="mt-2 border-0 bg-transparent"
            >
              <ul className="space-y-0.5 text-muted-foreground">
                {secondary.map((reason) => (
                  <li key={reason}>
                    {bullet} {reason}
                  </li>
                ))}
              </ul>
            </DisclosureSection>
          ) : null}
        </>
      ) : null}
      {rejected.length ? (
        <DisclosureSection
          title={rejectedTitle}
          level="none"
          defaultOpen={false}
          className={
            primary.length || secondary.length
              ? 'mt-2 border-0 bg-transparent'
              : 'border-0 bg-transparent'
          }
        >
          <ul className="space-y-1 text-muted-foreground">
            {rejected.map((row, i) => (
              <li key={row.rateId || `${row.label}-${i}`}>
                <span className="font-medium text-foreground">{row.label}</span>
                {' — '}
                {row.reason}
              </li>
            ))}
          </ul>
        </DisclosureSection>
      ) : null}
    </div>
  );
}

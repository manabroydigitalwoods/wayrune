import { Button, Textarea, SimpleFormField as FormField, cn } from '@wayrune/ui';
import {
  COMMON_EXCLUSION_CHIPS,
  COMMON_INCLUSION_CHIPS,
  COMMON_TERMS_CHIPS,
  mergeProposalNoteLines,
  proposalNoteHasLine,
  suggestProposalNotesFromServices,
  toggleProposalNoteLine,
  type QuoteNoteServiceLine,
} from '../../lib/quoteProposalNotes';

function NoteChipRow({
  chips,
  value,
  disabled,
  onToggle,
  emphasize,
}: {
  chips: readonly string[];
  value: string;
  disabled?: boolean;
  onToggle: (line: string) => void;
  emphasize?: Set<string>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group">
      {chips.map((chip) => {
        const selected = proposalNoteHasLine(value, chip);
        const suggested = emphasize?.has(chip);
        return (
          <button
            key={chip}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onToggle(chip)}
            className={cn(
              'cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : suggested
                  ? 'border-primary/50 bg-primary/10 text-foreground hover:border-primary'
                  : 'border-border/70 bg-muted/40 text-foreground hover:border-primary/40 hover:bg-muted/70',
            )}
          >
            {chip}
          </button>
        );
      })}
    </div>
  );
}

export function ProposalNotesEditor({
  inclusions,
  exclusions,
  terms,
  serviceLines,
  readOnly,
  onChange,
}: {
  inclusions: string;
  exclusions: string;
  terms: string;
  serviceLines: QuoteNoteServiceLine[];
  readOnly?: boolean;
  onChange: (patch: {
    inclusions?: string;
    exclusions?: string;
    terms?: string;
  }) => void;
}) {
  const suggested = suggestProposalNotesFromServices(serviceLines);
  const emphasizeInclusions = new Set(suggested.inclusions);
  const emphasizeExclusions = new Set(suggested.exclusions);
  const emphasizeTerms = new Set(suggested.terms);

  const inclusionChips = [
    ...COMMON_INCLUSION_CHIPS,
    ...suggested.inclusions.filter(
      (s) => !COMMON_INCLUSION_CHIPS.some((c) => c.toLowerCase() === s.toLowerCase()),
    ),
  ];
  const exclusionChips = [
    ...COMMON_EXCLUSION_CHIPS,
    ...suggested.exclusions.filter(
      (s) => !COMMON_EXCLUSION_CHIPS.some((c) => c.toLowerCase() === s.toLowerCase()),
    ),
  ];

  function applySuggestions() {
    onChange({
      inclusions: mergeProposalNoteLines(inclusions, suggested.inclusions),
      exclusions: mergeProposalNoteLines(exclusions, suggested.exclusions),
      terms: mergeProposalNoteLines(terms, suggested.terms),
    });
  }

  const canSuggest = serviceLines.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 cursor-pointer"
          disabled={readOnly || !canSuggest}
          title={
            canSuggest
              ? 'Fill notes from quotation services'
              : 'Add services to the quotation first'
          }
          onClick={applySuggestions}
        >
          Suggest from services
        </Button>
        <p className="text-xs text-muted-foreground">
          Tap chips to add or remove. Edit the text anytime.
        </p>
      </div>

      <FormField label="Inclusions">
        <div className="space-y-2">
          <NoteChipRow
            chips={inclusionChips}
            value={inclusions}
            disabled={readOnly}
            emphasize={emphasizeInclusions}
            onToggle={(line) =>
              onChange({ inclusions: toggleProposalNoteLine(inclusions, line) })
            }
          />
          <Textarea
            value={inclusions}
            disabled={readOnly}
            rows={4}
            className="min-h-[6rem] resize-y"
            onChange={(e) => onChange({ inclusions: e.target.value })}
            placeholder={'Accommodation\nBreakfast\nAirport transfers'}
          />
        </div>
      </FormField>

      <FormField label="Exclusions">
        <div className="space-y-2">
          <NoteChipRow
            chips={exclusionChips}
            value={exclusions}
            disabled={readOnly}
            emphasize={emphasizeExclusions}
            onToggle={(line) =>
              onChange({ exclusions: toggleProposalNoteLine(exclusions, line) })
            }
          />
          <Textarea
            value={exclusions}
            disabled={readOnly}
            rows={3}
            className="min-h-[5rem] resize-y"
            onChange={(e) => onChange({ exclusions: e.target.value })}
            placeholder={'Flights\nVisas\nPersonal expenses'}
          />
        </div>
      </FormField>

      <FormField
        label="Terms"
        description="Validity is controlled by Valid until above and stays in sync."
      >
        <div className="space-y-2">
          <NoteChipRow
            chips={COMMON_TERMS_CHIPS}
            value={terms}
            disabled={readOnly}
            emphasize={emphasizeTerms}
            onToggle={(line) => onChange({ terms: toggleProposalNoteLine(terms, line) })}
          />
          <Textarea
            value={terms}
            disabled={readOnly}
            rows={3}
            className="min-h-[5rem] resize-y"
            onChange={(e) => onChange({ terms: e.target.value })}
            placeholder={'Pay 50% to confirm\nCancellation as per supplier policy'}
          />
        </div>
      </FormField>
    </div>
  );
}

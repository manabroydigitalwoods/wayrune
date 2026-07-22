import { useEffect, useState } from 'react';
import { Button } from '@wayrune/ui';
import type { PlaceRef } from '../../lib/placeRefs';
import { classifyDestinationSuggestion } from '../../lib/resolveDestinationSuggestion';
import {
  normalizeDestinationSuggestionKey,
  type EnquiryDestinationSuggestion,
} from '../../lib/destinationEnquirySuggestions';

type RowState =
  | { status: 'loading' }
  | {
      status: 'exact';
      match: { placeId: string; name: string; kind?: string; description?: string };
    }
  | { status: 'ambiguous' }
  | { status: 'unresolved' }
  | { status: 'already_selected' };

/**
 * Enquiry destination suggestions — employee must explicitly Add.
 * Never auto-inserts PlaceRefs on mount.
 */
export function EnquiryDestinationSuggestions({
  suggestions,
  selected,
  domesticOrIntl,
  onAdd,
  onSearchHint,
}: {
  suggestions: EnquiryDestinationSuggestion[];
  selected: PlaceRef[];
  domesticOrIntl?: string;
  onAdd: (ref: PlaceRef) => void;
  /** Focus / cue the place search when unresolved or ambiguous. */
  onSearchHint?: (visitorName: string) => void;
}) {
  const [rows, setRows] = useState<Record<string, RowState>>({});

  useEffect(() => {
    let cancelled = false;
    const keys = suggestions.map((s) => normalizeDestinationSuggestionKey(s.name));
    setRows((prev) => {
      const next: Record<string, RowState> = {};
      for (const key of keys) {
        next[key] = prev[key]?.status === 'loading' ? prev[key]! : { status: 'loading' };
      }
      return next;
    });

    void (async () => {
      for (const suggestion of suggestions) {
        const key = normalizeDestinationSuggestionKey(suggestion.name);
        const alreadyByName = selected.some(
          (v) => normalizeDestinationSuggestionKey(v.name || '') === key,
        );
        try {
          const classified = await classifyDestinationSuggestion(suggestion.name, {
            domesticOrIntl,
          });
          if (cancelled) return;
          if (
            classified.status === 'exact' &&
            classified.match &&
            selected.some(
              (v) =>
                (v.placeId && v.placeId === classified.match!.placeId) ||
                normalizeDestinationSuggestionKey(v.name || '') === key,
            )
          ) {
            setRows((r) => ({ ...r, [key]: { status: 'already_selected' } }));
            continue;
          }
          if (alreadyByName) {
            setRows((r) => ({ ...r, [key]: { status: 'already_selected' } }));
            continue;
          }
          if (classified.status === 'exact' && classified.match) {
            setRows((r) => ({
              ...r,
              [key]: { status: 'exact', match: classified.match! },
            }));
          } else if (classified.status === 'ambiguous') {
            setRows((r) => ({ ...r, [key]: { status: 'ambiguous' } }));
          } else {
            setRows((r) => ({ ...r, [key]: { status: 'unresolved' } }));
          }
        } catch {
          if (!cancelled) {
            setRows((r) => ({ ...r, [key]: { status: 'unresolved' } }));
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    suggestions.map((s) => s.name).join('\u0001'),
    selected.map((v) => `${v.placeId || ''}:${v.name}`).join('\u0001'),
    domesticOrIntl,
  ]);

  if (!suggestions.length) return null;

  return (
    <div className="mb-2 space-y-2" data-testid="enquiry-destination-suggestions">
      <span className="text-[11px] text-muted-foreground">Suggested from enquiry</span>
      <ul className="space-y-2">
        {suggestions.map((suggestion) => {
          const key = normalizeDestinationSuggestionKey(suggestion.name);
          const row = rows[key] ?? { status: 'loading' as const };
          return (
            <li
              key={key}
              className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2"
              data-testid={`enquiry-dest-suggestion-${key}`}
              data-status={row.status}
            >
              {row.status === 'loading' ? (
                <p className="text-sm text-muted-foreground">Checking “{suggestion.name}”…</p>
              ) : null}
              {row.status === 'exact' ? (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{row.match.name}</p>
                    {row.match.description ? (
                      <p className="text-[11px] text-muted-foreground">{row.match.description}</p>
                    ) : row.match.kind ? (
                      <p className="text-[11px] text-muted-foreground capitalize">{row.match.kind}</p>
                    ) : null}
                    {normalizeDestinationSuggestionKey(suggestion.name) !==
                    normalizeDestinationSuggestionKey(row.match.name) ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Visitor entered: “{suggestion.name}”
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="xs"
                    data-testid={`enquiry-dest-add-${key}`}
                    onClick={() =>
                      onAdd({
                        placeId: row.match.placeId,
                        name: row.match.name,
                        kind: row.match.kind,
                      })
                    }
                  >
                    Add
                  </Button>
                </div>
              ) : null}
              {row.status === 'ambiguous' ? (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">
                      Visitor entered “{suggestion.name}”
                    </p>
                    <p className="text-[11px] text-muted-foreground">Multiple matches found</p>
                  </div>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    data-testid={`enquiry-dest-choose-${key}`}
                    onClick={() => onSearchHint?.(suggestion.name)}
                  >
                    Choose destination
                  </Button>
                </div>
              ) : null}
              {row.status === 'unresolved' ? (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">
                      Visitor entered “{suggestion.name}”
                    </p>
                    <p className="text-[11px] text-muted-foreground">No exact match found</p>
                  </div>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    data-testid={`enquiry-dest-search-${key}`}
                    onClick={() => onSearchHint?.(suggestion.name)}
                  >
                    Search Places
                  </Button>
                </div>
              ) : null}
              {row.status === 'already_selected' ? (
                <div>
                  <p className="text-sm font-medium text-foreground">{suggestion.name}</p>
                  <p className="text-[11px] text-muted-foreground">Already added</p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

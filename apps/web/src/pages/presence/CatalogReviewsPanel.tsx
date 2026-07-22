import { useEffect, useMemo, useState } from 'react';
import { Pencil, Star, Trash2 } from 'lucide-react';
import { Button, Label, Skeleton, Textarea, cn, toastError, toastSuccess } from '@wayrune/ui';
import { api } from '../../api';
import type { CatalogReview } from './catalogDetail';
import { CatalogRatingBadge, CatalogReviewsList } from './CatalogDetailParts';

export type CatalogReviewTargetType = 'theme' | 'module';

export type LiveCatalogRating = { average: number; count: number };

type ApiReview = {
  id: string;
  rating: number;
  body: string | null;
  author: string;
  organizationName?: string;
  dateLabel?: string;
  isMine?: boolean;
};

type CatalogReviewsResponse = {
  reviews: ApiReview[];
  mine: ApiReview | null;
  rating: LiveCatalogRating;
};

function toCatalogReview(row: ApiReview): CatalogReview {
  return {
    id: row.id,
    author: row.author,
    role: row.organizationName,
    rating: row.rating,
    body: row.body?.trim() || '',
    dateLabel: row.dateLabel,
  };
}

function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(0);
  const shown = hovered || value;
  return (
    <div
      className="flex items-center gap-0.5"
      role="radiogroup"
      aria-label="Rating"
      onMouseLeave={() => setHovered(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= shown;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            disabled={disabled}
            className={cn(
              'rounded p-0.5 text-amber-500 transition-colors',
              'hover:bg-muted/50 disabled:opacity-50',
              !active && 'text-muted-foreground/30',
            )}
            onMouseEnter={() => setHovered(n)}
            onClick={() => onChange(n)}
          >
            <Star className={cn('size-5', active && 'fill-current')} />
          </button>
        );
      })}
      <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{value}/5</span>
    </div>
  );
}

export function CatalogReviewsPanel({
  targetType,
  targetId,
  canWrite,
  initialRating,
  onRatingChange,
}: {
  targetType: CatalogReviewTargetType;
  targetId: string;
  canWrite?: boolean;
  initialRating?: LiveCatalogRating | null;
  onRatingChange?: (rating: LiveCatalogRating) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allReviews, setAllReviews] = useState<ApiReview[]>([]);
  const [rating, setRating] = useState<LiveCatalogRating>(
    initialRating ?? { average: 0, count: 0 },
  );
  const [mine, setMine] = useState<ApiReview | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftRating, setDraftRating] = useState(5);
  const [draftBody, setDraftBody] = useState('');

  function applyResponse(res: CatalogReviewsResponse, openEditorIfEmpty = false) {
    setAllReviews(res.reviews);
    setRating(res.rating);
    onRatingChange?.(res.rating);
    setMine(res.mine);
    if (res.mine) {
      setDraftRating(res.mine.rating);
      setDraftBody(res.mine.body ?? '');
      setEditing(false);
    } else {
      setDraftRating(5);
      setDraftBody('');
      setEditing(openEditorIfEmpty && Boolean(canWrite));
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEditing(false);
    void api<CatalogReviewsResponse>(
      `/presence/catalog-reviews?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`,
    )
      .then((res) => {
        if (cancelled) return;
        applyResponse(res, true);
      })
      .catch((err) => {
        if (!cancelled) toastError(err instanceof Error ? err.message : 'Failed to load reviews');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when target changes
  }, [targetType, targetId]);

  const others = useMemo(
    () =>
      allReviews
        .filter((row) => !row.isMine && row.id !== mine?.id)
        .map(toCatalogReview),
    [allReviews, mine?.id],
  );

  const dirty = useMemo(() => {
    if (!mine) return false;
    return draftRating !== mine.rating || draftBody.trim() !== (mine.body ?? '').trim();
  }, [mine, draftRating, draftBody]);

  // First-time publish: always allowed. Edit: require a change.
  const canSubmit = mine ? dirty : true;

  const showForm = Boolean(canWrite) && (editing || !mine);

  function startEdit() {
    if (!mine) return;
    setDraftRating(mine.rating);
    setDraftBody(mine.body ?? '');
    setEditing(true);
  }

  function cancelEdit() {
    if (mine) {
      setDraftRating(mine.rating);
      setDraftBody(mine.body ?? '');
      setEditing(false);
    } else {
      setDraftRating(5);
      setDraftBody('');
    }
  }

  async function submitReview() {
    if (!canWrite) return;
    setSaving(true);
    try {
      await api('/presence/catalog-reviews', {
        method: 'PUT',
        body: JSON.stringify({
          targetType,
          targetId,
          rating: draftRating,
          body: draftBody.trim() || null,
        }),
      });
      const res = await api<CatalogReviewsResponse>(
        `/presence/catalog-reviews?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`,
      );
      const wasUpdate = Boolean(mine);
      applyResponse(res);
      toastSuccess(wasUpdate ? 'Review updated' : 'Review published');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save review');
    } finally {
      setSaving(false);
    }
  }

  async function removeReview() {
    if (!canWrite || !mine) return;
    setSaving(true);
    try {
      await api(`/presence/catalog-reviews/${mine.id}`, { method: 'DELETE' });
      const res = await api<CatalogReviewsResponse>(
        `/presence/catalog-reviews?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`,
      );
      applyResponse(res, true);
      toastSuccess('Review removed');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to remove review');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {rating.count > 0
            ? `${rating.count} review${rating.count === 1 ? '' : 's'}`
            : 'No reviews yet'}
        </div>
        {rating.count > 0 ? <CatalogRatingBadge rating={rating} size="sm" /> : null}
      </div>

      {loading ? (
        <div className="space-y-2" role="status" aria-busy="true">
          <span className="sr-only">Loading</span>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : (
        <>
          {canWrite && mine && !editing ? (
            <div className="rounded-md border bg-muted/20 px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Your review
                  </div>
                  <div className="mt-1.5">
                    <CatalogRatingBadge
                      rating={{ average: mine.rating, count: 0 }}
                      size="sm"
                      showCount={false}
                    />
                  </div>
                </div>
                {mine.dateLabel ? (
                  <span className="shrink-0 text-[10px] text-muted-foreground">{mine.dateLabel}</span>
                ) : null}
              </div>
              {mine.body?.trim() ? (
                <p className="mt-2 text-[13px] leading-relaxed text-foreground/90">{mine.body.trim()}</p>
              ) : (
                <p className="mt-2 text-[13px] italic text-muted-foreground">No written comment</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={saving}
                  onClick={startEdit}
                >
                  <Pencil className="mr-1.5 size-3.5" />
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={saving}
                  onClick={() => void removeReview()}
                >
                  <Trash2 className="mr-1.5 size-3.5" />
                  Remove
                </Button>
              </div>
            </div>
          ) : null}

          {showForm ? (
            <div className="space-y-3 rounded-md border px-3 py-3">
              <div className="text-sm font-medium">{mine ? 'Edit your review' : 'Write a review'}</div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Your rating</Label>
                <StarPicker
                  value={draftRating}
                  onChange={setDraftRating}
                  disabled={saving || loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor={`catalog-review-body-${targetId}`}
                  className="text-[11px] text-muted-foreground"
                >
                  Comment <span className="font-normal">(optional)</span>
                </Label>
                <Textarea
                  id={`catalog-review-body-${targetId}`}
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  disabled={saving || loading}
                  rows={3}
                  maxLength={2000}
                  placeholder="What worked well for your agency?"
                  className="min-h-[72px] resize-y text-sm"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <Button
                  type="button"
                  size="sm"
                  disabled={saving || loading || !canSubmit}
                  onClick={() => void submitReview()}
                >
                  {saving ? 'Saving…' : mine ? 'Save changes' : 'Publish review'}
                </Button>
                {mine && editing ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={saving}
                    onClick={cancelEdit}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {!canWrite ? (
            <p className="text-xs text-muted-foreground">You need write access to leave a review.</p>
          ) : null}

          {others.length > 0 ? (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                From other operators
              </div>
              <CatalogReviewsList reviews={others} live />
            </div>
          ) : mine && !editing ? (
            <p className="text-xs text-muted-foreground">
              You’re the first to review this. Others will appear here.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

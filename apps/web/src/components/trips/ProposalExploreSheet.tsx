import { useEffect, useState } from 'react';
import {
  SoftIcon,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  cn,
} from '@wayrune/ui';
import {
  BedDouble,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MapPin,
  Quote,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { placeName } from '../../lib/placeRefs';

export type ExploreItem = {
  type: string;
  title: string;
  description?: string | null;
  notes?: string | null;
  location?: string | null | { name?: string };
  details?: Record<string, unknown>;
};

function resolveGallery(details: Record<string, unknown> | undefined): string[] {
  if (!details) return [];
  const urls: string[] = [];
  const push = (raw: unknown) => {
    if (typeof raw !== 'string') return;
    const s = raw.trim();
    if (s && !urls.includes(s)) urls.push(s);
  };
  push(details.imageUrl);
  if (Array.isArray(details.imageUrls)) {
    for (const u of details.imageUrls) push(u);
  }
  return urls;
}

function starsLabel(n: unknown): string | null {
  const stars = Number(n);
  if (!Number.isFinite(stars) || stars < 1) return null;
  return '★'.repeat(Math.min(5, Math.round(stars)));
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean);
}

function mapsHref(details: Record<string, unknown> | undefined, locationLabel: string | null) {
  const explicit =
    typeof details?.googleMapsUrl === 'string' && details.googleMapsUrl.trim()
      ? details.googleMapsUrl.trim()
      : null;
  if (explicit) return explicit;
  if (locationLabel) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationLabel)}`;
  }
  return null;
}

export function ProposalExploreSheet({
  item,
  open,
  onOpenChange,
}: {
  item: ExploreItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [galleryIndex, setGalleryIndex] = useState(0);
  const details = item?.details || {};
  const gallery = resolveGallery(details);

  useEffect(() => {
    setGalleryIndex(0);
  }, [item?.title, open]);

  if (!item) return null;

  const isHotel = item.type === 'hotel';
  const Icon: LucideIcon = isHotel ? BedDouble : Sun;
  const locationLabel = placeName(item.location);
  const mapUrl = mapsHref(details, locationLabel);
  const amenities = stringList(details.amenities);
  const stars = starsLabel(details.stars);
  const googleRating = Number(details.googleRating);
  const googleReviewCount = Number(details.googleReviewCount);
  const distanceHint =
    typeof details.distanceHint === 'string' && details.distanceHint.trim()
      ? details.distanceHint.trim()
      : null;
  const reviewSnippet =
    typeof details.reviewSnippet === 'string' && details.reviewSnippet.trim()
      ? details.reviewSnippet.trim()
      : null;
  const bestVisitTime =
    typeof details.bestVisitTime === 'string' && details.bestVisitTime.trim()
      ? details.bestVisitTime.trim()
      : null;
  const blurb = item.description?.trim() || item.notes?.trim() || null;
  const activePhoto = gallery[galleryIndex] || null;
  const mapQuery =
    locationLabel ||
    (typeof details.googleMapsUrl === 'string'
      ? details.googleMapsUrl.match(/[?&]query=([^&]+)/)?.[1]
      : null);
  const mapEmbedQuery = mapQuery
    ? decodeURIComponent(String(mapQuery).replace(/\+/g, ' '))
    : item.title;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="light bg-card text-foreground sm:max-w-md">
        <SheetHeader>
          <div className="flex items-start gap-3 pr-6">
            <SoftIcon icon={Icon} className="size-9 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {isHotel ? 'Hotel' : 'Experience'}
              </p>
              <SheetTitle className="text-left">{item.title}</SheetTitle>
              {locationLabel ? (
                <SheetDescription className="flex items-center gap-1 text-left">
                  <MapPin className="size-3.5 shrink-0" />
                  {locationLabel}
                </SheetDescription>
              ) : (
                <SheetDescription className="sr-only">Explore this stop</SheetDescription>
              )}
            </div>
          </div>
        </SheetHeader>
        <SheetBody className="space-y-4">
          {activePhoto ? (
            <div className="space-y-2">
              <div
                className="relative h-48 overflow-hidden rounded-xl bg-cover bg-center sm:h-56"
                style={{ backgroundImage: `url(${activePhoto})` }}
                role="img"
                aria-label={`${item.title} photo ${galleryIndex + 1}`}
              >
                {gallery.length > 1 ? (
                  <>
                    <button
                      type="button"
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white hover:bg-black/60"
                      aria-label="Previous photo"
                      onClick={() =>
                        setGalleryIndex((i) => (i - 1 + gallery.length) % gallery.length)
                      }
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white hover:bg-black/60"
                      aria-label="Next photo"
                      onClick={() => setGalleryIndex((i) => (i + 1) % gallery.length)}
                    >
                      <ChevronRight className="size-4" />
                    </button>
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] tabular-nums text-white">
                      {galleryIndex + 1} / {gallery.length}
                    </span>
                  </>
                ) : null}
              </div>
              {gallery.length > 1 ? (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {gallery.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setGalleryIndex(i)}
                      className={cn(
                        'h-12 w-16 shrink-0 rounded-md bg-cover bg-center ring-offset-background',
                        i === galleryIndex ? 'ring-2 ring-primary' : 'opacity-70',
                      )}
                      style={{ backgroundImage: `url(${url})` }}
                      aria-label={`Photo ${i + 1}`}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {stars ? <span className="text-amber-500 text-sm">{stars}</span> : null}
            {Number.isFinite(googleRating) && googleRating > 0 ? (
              <div className="rounded-xl border px-3 py-2 glass-row">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Google
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">
                  {'★'.repeat(Math.min(5, Math.round(googleRating)))}
                  <span className="ml-1.5">{googleRating.toFixed(1)}</span>
                  {Number.isFinite(googleReviewCount) && googleReviewCount > 0 ? (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      · {googleReviewCount.toLocaleString()} reviews
                    </span>
                  ) : null}
                </p>
              </div>
            ) : null}
            {distanceHint ? (
              <span className="text-xs text-muted-foreground">{distanceHint}</span>
            ) : null}
          </div>

          {blurb ? (
            <p className="text-sm leading-relaxed text-foreground/90">{blurb}</p>
          ) : null}

          {bestVisitTime ? (
            <div className="rounded-xl border px-3 py-2.5 text-sm glass-row">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Best time
              </p>
              <p className="mt-0.5 font-medium">{bestVisitTime}</p>
            </div>
          ) : null}

          {isHotel ? (
            <div className="space-y-1 text-sm text-muted-foreground">
              {[
                details.nights ? `${details.nights} night(s)` : null,
                details.roomType ? String(details.roomType) : null,
                details.checkIn ? `Check-in ${details.checkIn}` : null,
                details.checkOut ? `Check-out ${details.checkOut}` : null,
              ]
                .filter(Boolean)
                .map((line) => (
                  <p key={String(line)}>{line}</p>
                ))}
            </div>
          ) : null}

          {amenities.length ? (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Amenities
              </p>
              <div className="flex flex-wrap gap-1.5">
                {amenities.map((a) => (
                  <span
                    key={a}
                    className="rounded-full border px-2.5 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {reviewSnippet ? (
            <blockquote className="rounded-xl border px-3 py-3 text-sm italic text-foreground/85 glass">
              <Quote className="mb-1 size-3.5 text-primary" />
              {reviewSnippet}
            </blockquote>
          ) : null}

          {mapUrl ? (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-xl border">
                <iframe
                  title={`Map — ${item.title}`}
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(mapEmbedQuery)}&z=14&output=embed`}
                  className="h-44 w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <a
                href={mapUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-700"
              >
                <ExternalLink className="size-3.5" />
                Open in Google Maps
              </a>
            </div>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/** Whether an item is worth opening in the explore sheet. */
export function canExploreItem(item: ExploreItem): boolean {
  if (item.type !== 'hotel' && item.type !== 'sightseeing' && item.type !== 'activity')
    return false;
  const details = item.details || {};
  return Boolean(
    resolveGallery(details).length ||
      item.description?.trim() ||
      details.reviewSnippet ||
      details.googleMapsUrl ||
      details.bestVisitTime ||
      (Array.isArray(details.amenities) && details.amenities.length) ||
      details.googleRating ||
      details.stars,
  );
}

import { ExternalLink, MapPin, Star } from 'lucide-react';
import { cn } from '@wayrune/ui';
import { isStaySupplierType, supplierProfileSectionTitle } from '../../lib/supplierTypes';

function splitCsv(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function Chip({ children }: { children: string }) {
  return (
    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}

function PreviewImage({
  src,
  alt,
  className,
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  if (!src?.trim()) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted text-xs text-muted-foreground',
          className,
        )}
      >
        No photo
      </div>
    );
  }
  return (
    <img
      src={src.trim()}
      alt={alt}
      className={cn('object-cover', className)}
      loading="lazy"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

/**
 * Live marketing-style preview of supplier profileJson while editing.
 */
export function SupplierProfilePreview({
  supplierName,
  supplierType,
  form,
  roomPreviewNames,
}: {
  supplierName?: string;
  supplierType: string;
  form: Record<string, string>;
  roomPreviewNames?: string[];
}) {
  const title = supplierName?.trim() || supplierProfileSectionTitle(supplierType);

  if (isStaySupplierType(supplierType)) {
    const gallery = splitLines(form.imageUrls || '');
    const amenities = splitCsv(form.amenities || '');
    const rooms =
      roomPreviewNames?.length
        ? roomPreviewNames
        : splitCsv(form.roomHints || '');
    const stars = Number(form.stars);
    return (
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="relative aspect-[21/9] max-h-52 w-full bg-muted">
          <PreviewImage
            src={form.imageUrl}
            alt={title}
            className="size-full"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10">
            <p className="text-lg font-semibold text-white drop-shadow">{title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/90">
              {Number.isFinite(stars) && stars > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-black/35 px-1.5 py-0.5">
                  {Array.from({ length: Math.min(5, Math.round(stars)) }).map((_, i) => (
                    <Star key={i} className="size-3 fill-amber-300 text-amber-300" />
                  ))}
                  <span className="font-medium">{Math.round(stars)}★ hotel</span>
                </span>
              ) : null}
              {form.googleRating ? (
                <span className="rounded-md bg-black/35 px-1.5 py-0.5">
                  Google {form.googleRating}
                  {form.googleReviewCount ? ` · ${form.googleReviewCount} reviews` : ''}
                </span>
              ) : null}
              {form.distanceHint ? <span>· {form.distanceHint}</span> : null}
            </div>
          </div>
        </div>
        <div className="space-y-3 p-4">
          {gallery.length ? (
            <div className="flex gap-2 overflow-x-auto">
              {gallery.slice(0, 6).map((url) => (
                <PreviewImage
                  key={url}
                  src={url}
                  alt=""
                  className="size-16 shrink-0 rounded-md"
                />
              ))}
            </div>
          ) : null}
          {form.description?.trim() ? (
            <p className="text-sm text-muted-foreground">{form.description.trim()}</p>
          ) : null}
          {amenities.length ? (
            <div className="flex flex-wrap gap-1.5">
              {amenities.map((a) => (
                <Chip key={a}>{a}</Chip>
              ))}
            </div>
          ) : null}
          {rooms.length ? (
            <p className="text-sm text-muted-foreground">
              Rooms: {rooms.join(' · ')}
              {form.capacityHint ? ` · ${form.capacityHint}` : ''}
            </p>
          ) : form.capacityHint ? (
            <p className="text-sm text-muted-foreground">{form.capacityHint}</p>
          ) : null}
          {(form.checkIn || form.checkOut) && (
            <p className="text-xs text-muted-foreground">
              Check-in {form.checkIn || '—'} · Check-out {form.checkOut || '—'}
            </p>
          )}
          {form.reviewSnippet ? (
            <p className="text-sm italic text-muted-foreground">
              “{form.reviewSnippet}”
            </p>
          ) : null}
          {form.googleMapsUrl?.trim() ? (
            <a
              href={form.googleMapsUrl.trim()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <MapPin className="size-3.5" />
              Open in Maps
              <ExternalLink className="size-3 opacity-70" />
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  if (supplierType === 'driver') {
    const languages = splitCsv(form.languages || '');
    const areas = splitCsv(form.serviceAreas || '');
    return (
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-base font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">Driver profile</p>
          </div>
          {form.verificationStatus ? (
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {form.verificationStatus}
            </span>
          ) : null}
        </div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {form.licenceNumber ? (
            <div>
              <dt className="text-xs text-muted-foreground">Licence</dt>
              <dd className="font-medium tabular-nums">
                {form.licenceNumber}
                {form.licenceExpiry ? ` · exp ${form.licenceExpiry}` : ''}
              </dd>
            </div>
          ) : null}
          {form.emergencyContact ? (
            <div>
              <dt className="text-xs text-muted-foreground">Emergency</dt>
              <dd className="font-medium">{form.emergencyContact}</dd>
            </div>
          ) : null}
        </dl>
        {languages.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {languages.map((l) => (
              <Chip key={l}>{l}</Chip>
            ))}
          </div>
        ) : null}
        {areas.length ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Areas: {areas.join(' · ')}
          </p>
        ) : null}
      </div>
    );
  }

  if (supplierType === 'restaurant') {
    const photos = splitLines(form.photos || '');
    const periods = splitCsv(form.mealPeriods || '');
    return (
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        {photos[0] ? (
          <PreviewImage src={photos[0]} alt={title} className="aspect-[21/9] max-h-40 w-full" />
        ) : null}
        <div className="space-y-2 p-4">
          <p className="text-base font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">
            {[form.cuisine, form.vegNonVeg?.replace(/_/g, ' '), form.menuType?.replace(/_/g, ' ')]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {periods.length ? (
            <div className="flex flex-wrap gap-1.5">
              {periods.map((p) => (
                <Chip key={p}>{p}</Chip>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {[form.openingHours, form.seatingCapacity ? `${form.seatingCapacity} seats` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>
    );
  }

  if (supplierType === 'car_rental') {
    const types = splitCsv(form.vehicleTypes || '');
    return (
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-base font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{form.fleetHint || 'Fleet profile'}</p>
        {types.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {types.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </div>
        ) : null}
        {form.routesServed ? (
          <p className="mt-2 text-sm text-muted-foreground">Routes: {form.routesServed}</p>
        ) : null}
      </div>
    );
  }

  if (supplierType === 'activity') {
    const activities = splitCsv(form.activitiesOffered || '');
    return (
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-base font-semibold">{title}</p>
        {activities.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {activities.map((a) => (
              <Chip key={a}>{a}</Chip>
            ))}
          </div>
        ) : null}
        <p className="mt-2 text-sm text-muted-foreground">
          {[form.durationHint, form.privateOrSic, form.capacity ? `Cap ${form.capacity}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    );
  }

  if (supplierType === 'guide') {
    const languages = splitCsv(form.languages || '');
    const destinations = splitCsv(form.destinations || '');
    const specialties = splitCsv(form.specialties || '');
    return (
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-base font-semibold">{title}</p>
          {form.verificationStatus ? (
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {form.verificationStatus}
            </span>
          ) : null}
        </div>
        {languages.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {languages.map((l) => (
              <Chip key={l}>{l}</Chip>
            ))}
          </div>
        ) : null}
        {destinations.length ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Destinations: {destinations.join(' · ')}
          </p>
        ) : null}
        {specialties.length ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Specialties: {specialties.join(' · ')}
          </p>
        ) : null}
      </div>
    );
  }

  if (supplierType === 'dmc') {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-base font-semibold">{title}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {[form.destinationsServed, form.serviceCategories].filter(Boolean).join(' · ')}
        </p>
        {form.markets ? (
          <p className="mt-1 text-sm text-muted-foreground">Markets: {form.markets}</p>
        ) : null}
        {form.bookingSlaHint ? (
          <p className="mt-1 text-xs text-muted-foreground">SLA: {form.bookingSlaHint}</p>
        ) : null}
      </div>
    );
  }

  // Generic / other
  const hasAny =
    form.serviceCategory || form.description || form.serviceArea || form.imageUrl;
  if (!hasAny) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        Preview appears as you fill the profile fields.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <p className="text-base font-semibold">{title}</p>
      {form.serviceCategory ? (
        <p className="mt-1 text-sm text-muted-foreground">{form.serviceCategory}</p>
      ) : null}
      {form.description ? (
        <p className="mt-2 text-sm text-muted-foreground">{form.description}</p>
      ) : null}
      {form.serviceArea ? (
        <p className="mt-1 text-xs text-muted-foreground">Area: {form.serviceArea}</p>
      ) : null}
    </div>
  );
}

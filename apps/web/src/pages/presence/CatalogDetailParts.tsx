import type { ReactNode } from 'react';
import { Star } from 'lucide-react';
import { cn, Tabs, TabsContent, TabsList, TabsTrigger } from '@wayrune/ui';
import type { CatalogDetail, CatalogReview, CatalogScreen } from './catalogDetail';
import { starLabels } from './catalogDetail';

export function CatalogRatingBadge({
  rating,
  size = 'md',
  showCount = true,
}: {
  rating: CatalogDetail['rating'];
  size?: 'sm' | 'md';
  showCount?: boolean;
}) {
  const stars = starLabels(rating.average);
  const icon = size === 'sm' ? 'size-3' : 'size-3.5';
  return (
    <div className={cn('inline-flex items-center gap-1', size === 'sm' ? 'text-xs' : 'text-sm')}>
      <div className="flex items-center gap-px text-amber-500">
        {Array.from({ length: stars.full }).map((_, i) => (
          <Star key={`f${i}`} className={cn(icon, 'fill-current')} />
        ))}
        {stars.half ? <Star className={cn(icon, 'fill-current opacity-50')} /> : null}
        {Array.from({ length: stars.empty }).map((_, i) => (
          <Star key={`e${i}`} className={cn(icon, 'text-muted-foreground/35')} />
        ))}
      </div>
      <span className="font-medium tabular-nums text-foreground">{rating.average.toFixed(1)}</span>
      {showCount && rating.count > 0 ? (
        <span className="text-muted-foreground">({rating.count})</span>
      ) : null}
    </div>
  );
}

export function CatalogChipList({ items, mono }: { items: string[]; mono?: boolean }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item}
          className={cn(
            'rounded bg-muted/80 px-1.5 py-0.5 text-[10px] leading-tight text-foreground',
            mono && 'font-mono',
          )}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export function CatalogBulletList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1 text-[13px] text-foreground/90">
      {items.map((item) => (
        <li key={item} className="flex gap-2 leading-snug">
          <span className="mt-[7px] size-1 shrink-0 rounded-full bg-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function CatalogSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function CatalogMetaGrid({
  rows,
}: {
  rows: Array<{ label: string; value: string } | null | false | undefined>;
}) {
  const list = rows.filter(Boolean) as Array<{ label: string; value: string }>;
  if (!list.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-md border bg-muted/20 px-3 py-2.5">
      {list.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="text-[10px] text-muted-foreground">{row.label}</dt>
          <dd className="truncate text-xs font-medium" title={row.value}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function DeviceFrame({
  device,
  children,
  className,
}: {
  device: CatalogScreen['device'];
  children: ReactNode;
  className?: string;
}) {
  const shell =
    device === 'mobile'
      ? 'mx-auto w-[38%] max-w-[120px] rounded-[1rem] border border-border/80 bg-background p-1'
      : device === 'tablet'
        ? 'mx-auto w-[58%] max-w-[180px] rounded-lg border border-border/70 bg-background p-1'
        : 'w-full rounded-md border border-border/60 bg-background p-0.5';
  const aspect =
    device === 'mobile' ? 'aspect-[9/16]' : device === 'tablet' ? 'aspect-[3/4]' : 'aspect-[16/9]';
  return (
    <div className={cn(shell, className)}>
      <div className={cn('overflow-hidden rounded-md bg-muted', aspect)}>{children}</div>
    </div>
  );
}

export function CatalogScreensStrip({
  screens,
  activeId,
  onSelect,
  renderPreview,
}: {
  screens: CatalogScreen[];
  activeId: string;
  onSelect: (id: string) => void;
  renderPreview: (screen: CatalogScreen) => ReactNode;
}) {
  const active = screens.find((s) => s.id === activeId) || screens[0];
  if (!active) return null;
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1">
        {screens.map((screen) => (
          <button
            key={screen.id}
            type="button"
            onClick={() => onSelect(screen.id)}
            className={cn(
              'rounded-md px-2 py-1 text-[11px] transition',
              screen.id === active.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {screen.label}
          </button>
        ))}
      </div>
      <DeviceFrame device={active.device}>{renderPreview(active)}</DeviceFrame>
      {active.caption ? (
        <p className="text-center text-[11px] text-muted-foreground">{active.caption}</p>
      ) : null}
    </div>
  );
}

export function CatalogReviewsList({
  reviews,
  live = false,
}: {
  reviews: CatalogReview[];
  /** When true, omit the placeholder/catalog disclaimer. */
  live?: boolean;
}) {
  if (!reviews.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {live
          ? 'No reviews yet. Share how this theme or component worked for your agency.'
          : 'No reviews yet.'}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {reviews.map((review) => (
        <div key={review.id} className="rounded-md border px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium leading-tight">{review.author}</div>
              {review.role ? (
                <div className="text-[11px] text-muted-foreground">{review.role}</div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <CatalogRatingBadge
                rating={{ average: review.rating, count: 0 }}
                size="sm"
                showCount={false}
              />
              {review.dateLabel ? (
                <span className="text-[10px] text-muted-foreground">{review.dateLabel}</span>
              ) : null}
            </div>
          </div>
          <p
            className={cn(
              'mt-1.5 text-[13px] leading-relaxed',
              review.body.trim() ? 'text-muted-foreground' : 'italic text-muted-foreground/80',
            )}
          >
            {review.body.trim() ? review.body : 'No written comment'}
          </p>
        </div>
      ))}
      {!live ? (
        <p className="text-[10px] text-muted-foreground">
          Sample catalog feedback. Live operator reviews replace this when available.
        </p>
      ) : null}
    </div>
  );
}

/** Compact inline stats — one row, no heavy cards. */
export function CatalogStatRow({
  items,
}: {
  items: Array<{ label: string; value: string } | null | false | undefined>;
}) {
  const list = items.filter(Boolean) as Array<{ label: string; value: string }>;
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
      {list.map((item, i) => (
        <span key={item.label} className="inline-flex items-baseline gap-1">
          {i > 0 ? <span className="select-none text-border/80" aria-hidden>·</span> : null}
          <span className="text-muted-foreground">{item.label}</span>
          <span className="font-semibold text-foreground">{item.value}</span>
        </span>
      ))}
    </div>
  );
}

/** Full-width segmented tabs — balanced, compact, no orphan empty space. */
export function CatalogDetailTabs({
  tabs,
  defaultValue = 'overview',
}: {
  defaultValue?: string;
  tabs: Array<{ value: string; label: string; content: ReactNode }>;
}) {
  return (
    <Tabs defaultValue={defaultValue} className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-5 pt-1 pb-2">
        <TabsList
          className={cn(
            'grid h-9 w-full gap-0.5 rounded-lg border border-border/60 bg-muted/50 p-0.5 shadow-none',
            tabs.length === 3 && 'grid-cols-3',
            tabs.length === 4 && 'grid-cols-4',
            tabs.length === 5 && 'grid-cols-5',
            tabs.length !== 3 && tabs.length !== 4 && tabs.length !== 5 && 'flex',
          )}
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={cn(
                'h-full min-w-0 flex-1 rounded-md px-1.5 text-[11px] font-medium shadow-none',
                'text-muted-foreground',
                'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
                'data-[state=active]:ring-1 data-[state=active]:ring-border/80',
              )}
            >
              <span className="truncate">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((tab) => (
        <TabsContent
          key={tab.value}
          value={tab.value}
          className="mt-0 min-h-0 flex-1 overflow-y-auto px-5 py-3 data-[state=inactive]:hidden"
        >
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

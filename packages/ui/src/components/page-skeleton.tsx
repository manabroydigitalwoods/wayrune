import { cn } from '../lib/utils';
import { Skeleton } from './ui/skeleton';
import { PageStack, SectionStack } from './layout-stack';
import { PageBootMark } from './page-boot-mark';

function SrLoading() {
  return <span className="sr-only">Loading</span>;
}

function PageHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex shrink-0 items-start gap-3', className)}>
      <Skeleton className="size-8 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-5 w-48 max-w-[60%]" />
        <Skeleton className="h-3.5 w-72 max-w-[80%]" />
      </div>
      <Skeleton className="hidden h-8 w-24 sm:block" />
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 p-[var(--pad-card)] glass">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="size-8 shrink-0 rounded-lg" />
      </div>
    </div>
  );
}

function TableBlockSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/60 glass">
      <div className="border-b border-border/60 bg-muted/40 px-2.5 py-2">
        <div className="flex gap-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="ml-auto h-3 w-24" />
        </div>
      </div>
      <div className="space-y-0 divide-y divide-border/50">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-2.5 py-2.5">
            <Skeleton className="h-3.5 w-[30%]" />
            <Skeleton className="h-3.5 w-[20%]" />
            <Skeleton className="h-3.5 w-[15%]" />
            <Skeleton className="ml-auto h-3.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Full-viewport centered mark — auth / pre-shell / reload continuity. */
export function AuthGateSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        'flex min-h-svh items-center justify-center bg-[hsl(var(--atmosphere-base))]',
        className,
      )}
    >
      <SrLoading />
      <PageBootMark />
    </div>
  );
}

/** Centered brand mark — public itinerary / pay / companion / invites. */
export function PublicPageSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        'flex min-h-svh items-center justify-center bg-[hsl(var(--atmosphere-base))]',
        className,
      )}
    >
      <SrLoading />
      <PageBootMark />
    </div>
  );
}

export type PageSkeletonVariant =
  | 'detail'
  | 'dashboard'
  | 'settings'
  | 'split'
  | 'cards'
  | 'workspace'
  | 'form';

/** In-shell page body skeleton — mirrors PageHeader + content shape. */
export function PageSkeleton({
  variant = 'detail',
  className,
}: {
  variant?: PageSkeletonVariant;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn('min-h-0 skeleton-shimmer', className)}
    >
      <SrLoading />
      <PageStack>
        <PageHeaderSkeleton />
        {variant === 'dashboard' ? (
          <SectionStack>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <StatCardSkeleton key={i} />
              ))}
            </div>
            <Skeleton className="h-40 w-full rounded-xl" />
          </SectionStack>
        ) : null}
        {variant === 'detail' ? (
          <SectionStack>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border/60 p-[var(--pad-card)] glass"
                >
                  <Skeleton className="mb-2 h-3 w-16" />
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </div>
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </SectionStack>
        ) : null}
        {variant === 'workspace' ? (
          <SectionStack>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-20 rounded-md" />
              ))}
            </div>
            <Skeleton className="h-[min(28rem,55vh)] w-full rounded-xl" />
          </SectionStack>
        ) : null}
        {variant === 'settings' || variant === 'form' ? (
          <div
            className={cn(
              variant === 'settings' &&
                'grid gap-[var(--gap-section)] lg:grid-cols-[220px_minmax(0,1fr)]',
            )}
          >
            {variant === 'settings' ? (
              <div className="hidden space-y-2 rounded-2xl border p-2 glass-panel lg:block">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="h-9 w-full rounded-xl" />
                ))}
              </div>
            ) : null}
            <div className="max-w-4xl space-y-4 rounded-xl border border-border/60 p-[var(--pad-card)] glass">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {variant === 'split' ? (
          <div className="flex min-h-0 flex-1 gap-0 overflow-hidden rounded-xl border border-border/60">
            <div className="w-full space-y-0 divide-y divide-border/50 border-r border-border/60 sm:w-[min(22rem,40%)]">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <Skeleton className="size-9 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-[70%]" />
                    <Skeleton className="h-3 w-[50%]" />
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden min-w-0 flex-1 flex-col gap-3 p-4 sm:flex">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-32" />
              <div className="mt-2 space-y-3">
                <Skeleton className="h-16 w-3/4 rounded-lg" />
                <Skeleton className="ml-auto h-16 w-2/3 rounded-lg" />
                <Skeleton className="h-16 w-3/4 rounded-lg" />
              </div>
            </div>
          </div>
        ) : null}
        {variant === 'cards' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="space-y-3 rounded-xl border border-border/60 p-[var(--pad-card)] glass"
              >
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        ) : null}
      </PageStack>
    </div>
  );
}

/** List pages: header + filter bar + table block. */
export function ListPageSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        'relative flex min-h-0 flex-col gap-[var(--gap-page)] skeleton-shimmer',
        'h-[calc(100dvh-var(--pad-main-top)-var(--pad-main-bottom))] md:h-[calc(100dvh-var(--pad-main-top-md)-var(--pad-main-bottom-md))]',
        className,
      )}
    >
      <SrLoading />
      <PageHeaderSkeleton />
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 min-w-[10rem] flex-1 basis-[12rem]" />
        <Skeleton className="h-8 w-[11.5rem]" />
        <Skeleton className="h-8 w-24" />
      </div>
      <TableBlockSkeleton />
    </div>
  );
}

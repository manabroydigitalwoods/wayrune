import { useState } from 'react';
import { Copy, Download, ExternalLink, GitBranch, MoreHorizontal, Store, Trash2 } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@wayrune/ui';
import { ThemeDetailDialog } from './ThemeDetailDialog';
import { ApplyThemeDialog, type ApplyThemeSiteOption } from './ApplyThemeDialog';
import { resolveCatalogThumbnailUrl } from './catalogThumbnail';
import { asSuggestMeta, suggestChipList } from './catalogMeta';
import { CatalogRatingBadge } from './CatalogDetailParts';

export type ThemeCardModel = {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  tokensJson: Record<string, unknown>;
  effectiveTokensJson?: Record<string, unknown> | null;
  parentThemeId?: string | null;
  parentKey?: string | null;
  parentName?: string | null;
  packageFormat?: string | null;
  schemaJson?: Record<string, unknown> | null;
  previewUrl?: string | null;
  previewAssetsJson?: Record<string, unknown> | null;
  suggestJson?: Record<string, unknown> | null;
  hasFullSite?: boolean;
  defaultSitePageCount?: number;
  ratingAverage?: number;
  ratingCount?: number;
};

/** Package manifest description, or seeded preview description / label. */
export function themeDescription(theme: ThemeCardModel): string | null {
  const schema = theme.schemaJson || {};
  if (typeof schema.description === 'string' && schema.description.trim()) {
    return schema.description.trim();
  }
  const assets = theme.previewAssetsJson || {};
  if (typeof assets.description === 'string' && assets.description.trim()) {
    return assets.description.trim();
  }
  if (typeof assets.label === 'string' && assets.label.trim()) {
    const bestFor = Array.isArray(assets.bestFor)
      ? assets.bestFor.filter((v): v is string => typeof v === 'string').join(', ')
      : '';
    return bestFor ? `${assets.label.trim()} — best for ${bestFor.replace(/_/g, ' ')}` : assets.label.trim();
  }
  return null;
}

function themeSwatch(theme: ThemeCardModel) {
  const tokens = theme.effectiveTokensJson || theme.tokensJson || {};
  return {
    primary: String(tokens.primary || '#0f766e'),
    accent: String(tokens.accent || tokens.primary || '#0ea5a4'),
    background: String(tokens.background || '#f8fafc'),
    foreground: String(tokens.foreground || '#0f172a'),
    muted: String(tokens.muted || '#64748b'),
  };
}

function themeThumbnail(theme: ThemeCardModel) {
  const assets = theme.previewAssetsJson || {};
  const documentId =
    typeof assets.thumbnailDocumentId === 'string' ? assets.thumbnailDocumentId : null;
  return resolveCatalogThumbnailUrl(
    typeof assets.thumbnail === 'string' ? assets.thumbnail : null,
    documentId ? `/api/v1/files/${documentId}/content` : null,
    theme.previewUrl,
    typeof assets.thumbnailPublic === 'string' ? assets.thumbnailPublic : null,
  );
}

export function ThemePreviewSurface({ theme, className }: { theme: ThemeCardModel; className?: string }) {
  const swatch = themeSwatch(theme);
  const thumb = themeThumbnail(theme);
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${swatch.background} 0%, ${swatch.primary}38 50%, ${swatch.accent}28 100%)`,
        }}
      />
      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="relative z-[1] h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <>
          <div className="absolute inset-x-3 top-2.5 z-[1] flex items-center gap-1.5">
            <div className="h-1.5 w-12 rounded-sm" style={{ background: swatch.foreground, opacity: 0.75 }} />
            <div className="ml-auto flex gap-1">
              <div className="h-1.5 w-5 rounded-sm" style={{ background: swatch.muted, opacity: 0.45 }} />
              <div className="h-1.5 w-5 rounded-sm" style={{ background: swatch.muted, opacity: 0.45 }} />
            </div>
          </div>
          <div className="absolute bottom-2.5 left-3 right-3 z-[1] flex items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="h-2 w-3/4 rounded-sm" style={{ background: swatch.foreground, opacity: 0.85 }} />
              <div className="h-1.5 w-1/2 rounded-sm" style={{ background: swatch.muted, opacity: 0.55 }} />
            </div>
            <div className="h-5 w-12 shrink-0 rounded" style={{ background: swatch.primary }} />
          </div>
        </>
      )}
    </div>
  );
}

function ColorDots({ theme }: { theme: ThemeCardModel }) {
  const swatch = themeSwatch(theme);
  return (
    <div className="flex shrink-0 items-center gap-1" aria-hidden>
      {[swatch.primary, swatch.accent, swatch.background, swatch.foreground].map((color, i) => (
        <span
          key={`${color}-${i}`}
          className="size-2.5 rounded-full border border-border/60"
          style={{ background: color }}
        />
      ))}
    </div>
  );
}

export function ThemeCard({
  theme,
  active,
  usedOnLabels,
  applySites,
  preferredSiteId,
  applying,
  canWrite,
  previewUrl,
  onApply,
  onCreateWebsite,
  onClone,
  onCreateChild,
  onExport,
  onListMarketplace,
  onDelete,
  selectable,
  selected,
  onSelect,
  compact = true,
}: {
  theme: ThemeCardModel;
  /** True when this theme is active on at least one listed site */
  active?: boolean;
  /** Website names already using this theme */
  usedOnLabels?: string[];
  /** Sites available in the Apply popup */
  applySites?: ApplyThemeSiteOption[];
  preferredSiteId?: string | null;
  applying?: boolean;
  canWrite?: boolean;
  previewUrl?: string | null;
  onApply?: (siteId: string) => void | Promise<void>;
  /** When there are no sites yet — primary card action creates a website with this theme */
  onCreateWebsite?: () => void;
  onClone?: () => void;
  onCreateChild?: () => void;
  onExport?: () => void;
  onListMarketplace?: () => void;
  onDelete?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  /** Denser catalog card (default). */
  compact?: boolean;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const isChild = Boolean(theme.parentThemeId || theme.parentKey);
  const isPackage = theme.packageFormat === 'v1';
  const canDelete = Boolean(onDelete) && !theme.isSystem;
  const hasMore = Boolean(onCreateChild || onClone || onExport || onListMarketplace || canDelete);
  const description = themeDescription(theme);
  const suggestChips = suggestChipList(asSuggestMeta(theme.suggestJson));
  const canApply = Boolean(canWrite && onApply && (applySites?.length ?? 0) > 0);
  const canCreate = Boolean(canWrite && onCreateWebsite && !canApply);

  const openDetails = () => {
    if (selectable) {
      onSelect?.();
      return;
    }
    setDetailOpen(true);
  };

  const openApply = () => {
    if (!canApply) return;
    setApplyOpen(true);
  };

  const confirmApply = async (siteId: string) => {
    await onApply?.(siteId);
    setApplyOpen(false);
    setDetailOpen(false);
  };

  const metaParts = [
    theme.isSystem ? 'System' : isChild ? 'Child' : 'Custom',
    theme.hasFullSite
      ? theme.defaultSitePageCount
        ? `Full site · ${theme.defaultSitePageCount} pages`
        : 'Full site'
      : null,
    isPackage ? 'ZIP' : null,
  ].filter(Boolean) as string[];
  const metaLine = metaParts.join(' · ');
  const usedLine =
    usedOnLabels && usedOnLabels.length > 0
      ? usedOnLabels.length === 1
        ? `Used on ${usedOnLabels[0]}`
        : `Used on ${usedOnLabels.length} websites`
      : null;

  return (
    <>
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-lg border bg-card transition',
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-border/80',
        'cursor-pointer hover:border-primary/40',
      )}
      onClick={openDetails}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDetails();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="relative shrink-0">
        <ThemePreviewSurface
          theme={theme}
          className={
            selectable
              ? 'aspect-[16/9] w-full'
              : compact
                ? 'aspect-[2/1] w-full'
                : 'aspect-[4/3] w-full'
          }
        />
        <div className="absolute left-2.5 top-2.5 flex max-w-[calc(100%-1.25rem)] flex-wrap gap-1">
          {active || usedLine ? (
            <span className="rounded-md bg-teal-700/95 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white shadow-sm">
              {usedOnLabels && usedOnLabels.length > 1 ? `${usedOnLabels.length} sites` : 'Active'}
            </span>
          ) : null}
          {isChild ? (
            <span className="rounded-md bg-background/95 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground shadow-sm">
              Child
            </span>
          ) : null}
          {isPackage ? (
            <span className="rounded-md bg-background/95 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground shadow-sm">
              Package
            </span>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          selectable ? 'gap-1.5 p-3' : compact ? 'gap-2.5 p-3' : 'gap-3 p-4',
        )}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div
                className={cn('truncate font-semibold tracking-tight', compact || selectable ? 'text-sm' : 'text-base')}
                title={theme.name}
              >
                {theme.name}
              </div>
              <div
                className="truncate text-[11px] text-muted-foreground"
                title={`${metaLine} · ${theme.key}`}
              >
                {metaLine}
              </div>
            </div>
            <ColorDots theme={theme} />
          </div>

          {typeof theme.ratingCount === 'number' && theme.ratingCount > 0 ? (
            <CatalogRatingBadge
              rating={{ average: theme.ratingAverage ?? 0, count: theme.ratingCount }}
              size="sm"
            />
          ) : null}

          <p
            className={cn(
              'text-[11px] leading-snug text-muted-foreground',
              selectable ? 'line-clamp-2' : 'line-clamp-2 min-h-[2.5rem]',
            )}
            title={description || undefined}
          >
            {description || 'No description yet.'}
          </p>

          <div
            className={cn(
              'flex flex-wrap content-start gap-1',
              selectable ? '' : 'min-h-[22px]',
            )}
          >
            {suggestChips.slice(0, selectable ? 2 : 3).map((chip) => (
              <span
                key={chip}
                className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
              >
                {chip}
              </span>
            ))}
          </div>

          {!selectable ? (
            <p
              className="min-h-[1rem] truncate text-[10px] text-muted-foreground"
              title={usedLine || undefined}
            >
              {usedLine || '\u00a0'}
            </p>
          ) : null}
        </div>

        {!selectable ? (
          <div className="mt-auto flex shrink-0 items-center gap-1.5 border-t border-border/50 pt-2.5">
            <Button
              type="button"
              size="sm"
              className="h-8 min-w-0 flex-1 text-xs"
              disabled={canApply ? applying : !canCreate}
              title={
                canApply
                  ? 'Choose a website and apply this theme'
                  : canCreate
                    ? 'Create a website with this theme'
                    : 'Create a website to apply themes'
              }
              onClick={(e) => {
                e.stopPropagation();
                if (canApply) openApply();
                else onCreateWebsite?.();
              }}
            >
              {applying
                ? 'Applying…'
                : canApply
                  ? 'Apply to site…'
                  : canCreate
                    ? 'Create website'
                    : 'Apply to site…'}
            </Button>
            {previewUrl ? (
              <Button type="button" variant="outline" size="sm" className="size-8 shrink-0 p-0" asChild>
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Preview"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="size-3.5" />
                  <span className="sr-only">Preview</span>
                </a>
              </Button>
            ) : null}
            {hasMore ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="size-8 shrink-0 p-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="size-3.5" />
                    <span className="sr-only">More actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  {onCreateChild && !isChild ? (
                    <DropdownMenuItem disabled={!canWrite} onSelect={() => onCreateChild()}>
                      <GitBranch className="mr-2 size-3.5" />
                      Create child theme
                    </DropdownMenuItem>
                  ) : null}
                  {onClone ? (
                    <DropdownMenuItem disabled={!canWrite} onSelect={() => onClone()}>
                      <Copy className="mr-2 size-3.5" />
                      Duplicate
                    </DropdownMenuItem>
                  ) : null}
                  {onExport ? (
                    <DropdownMenuItem onSelect={() => onExport()}>
                      <Download className="mr-2 size-3.5" />
                      Export ZIP
                    </DropdownMenuItem>
                  ) : null}
                  {onListMarketplace ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem disabled={!canWrite} onSelect={() => onListMarketplace()}>
                        <Store className="mr-2 size-3.5" />
                        List on marketplace
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  {canDelete ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={!canWrite}
                        className="text-destructive focus:text-destructive"
                        onSelect={() => onDelete?.()}
                      >
                        <Trash2 className="mr-2 size-3.5" />
                        Delete theme
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
    {!selectable ? (
      <>
        <ThemeDetailDialog
          theme={theme}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          active={active || Boolean(usedOnLabels?.length)}
          usedOnLabels={usedOnLabels}
          canWrite={canWrite}
          previewUrl={previewUrl}
          onApply={
            canApply
              ? openApply
              : canCreate
                ? () => {
                    setDetailOpen(false);
                    onCreateWebsite?.();
                  }
                : undefined
          }
          applyLabel={canCreate ? 'Create website' : 'Apply to website…'}
        />
        <ApplyThemeDialog
          open={applyOpen}
          onOpenChange={setApplyOpen}
          themeId={theme.id}
          themeName={theme.name}
          sites={applySites || []}
          preferredSiteId={preferredSiteId}
          applying={applying}
          onConfirm={confirmApply}
        />
      </>
    ) : null}
    </>
  );
}

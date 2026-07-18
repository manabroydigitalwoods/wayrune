import { useState } from 'react';
import { MoreHorizontal, Puzzle, Store, Trash2 } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@wayrune/ui';
import { ComponentDetailDialog } from './ComponentDetailDialog';
import { resolveCatalogThumbnailUrl } from './catalogThumbnail';
import {
  asModuleVariations,
  asSuggestMeta,
  categoryLabel,
  suggestChipList,
  type PresenceModuleVariation,
  type PresenceSuggestMeta,
} from './catalogMeta';
import { CatalogRatingBadge } from './CatalogDetailParts';

export type ComponentCardModel = {
  id: string;
  key: string;
  name: string;
  category: string;
  rendererKey: string;
  isSystem: boolean;
  status?: string;
  previewJson?: Record<string, unknown> | null;
  assetsJson?: Record<string, unknown> | null;
  schemaJson?: Array<Record<string, unknown>> | null;
  defaultPropsJson?: Record<string, unknown> | null;
  variantsJson?: PresenceModuleVariation[] | Array<Record<string, unknown>> | null;
  suggestJson?: PresenceSuggestMeta | Record<string, unknown> | null;
  ratingAverage?: number;
  ratingCount?: number;
};

const CATEGORY_HUES: Record<string, { from: string; to: string; accent: string }> = {
  content: { from: '#0f172a', to: '#0f766e', accent: '#14b8a6' },
  hero: { from: '#0c4a6e', to: '#0369a1', accent: '#38bdf8' },
  layout: { from: '#1e1b4b', to: '#4f46e5', accent: '#818cf8' },
  media: { from: '#431407', to: '#c2410c', accent: '#fb923c' },
  navigation: { from: '#14532d', to: '#166534', accent: '#4ade80' },
  travel: { from: '#083344', to: '#0e7490', accent: '#22d3ee' },
  social_proof: { from: '#3b0764', to: '#7e22ce', accent: '#d8b4fe' },
  conversion: { from: '#7c2d12', to: '#c2410c', accent: '#fdba74' },
  form: { from: '#14532d', to: '#15803d', accent: '#4ade80' },
  custom: { from: '#27272a', to: '#52525b', accent: '#a1a1aa' },
};

function categoryPalette(category: string) {
  return CATEGORY_HUES[category] || CATEGORY_HUES.content;
}

function previewThumb(mod: ComponentCardModel): string | null {
  const assets = mod.assetsJson || {};
  const preview = mod.previewJson || {};
  const defaults = mod.defaultPropsJson || {};
  const documentId =
    typeof assets.thumbnailDocumentId === 'string' ? assets.thumbnailDocumentId : null;
  return resolveCatalogThumbnailUrl(
    typeof assets.thumbnail === 'string' ? assets.thumbnail : null,
    typeof preview.thumbnail === 'string' ? preview.thumbnail : null,
    typeof preview.image === 'string' ? preview.image : null,
    typeof defaults.imageUrl === 'string' ? defaults.imageUrl : null,
    documentId ? `/api/v1/files/${documentId}/content` : null,
    typeof assets.thumbnailPublic === 'string' ? assets.thumbnailPublic : null,
  );
}

/** Package description, or seeded preview summary. */
export function componentDescription(mod: ComponentCardModel): string | null {
  const assets = mod.assetsJson || {};
  if (typeof assets.description === 'string' && assets.description.trim()) {
    return assets.description.trim();
  }
  const preview = mod.previewJson || {};
  if (typeof preview.summary === 'string' && preview.summary.trim()) {
    return preview.summary.trim();
  }
  if (typeof preview.description === 'string' && preview.description.trim()) {
    return preview.description.trim();
  }
  return null;
}

export function ComponentPreviewSurface({
  component,
  className,
}: {
  component: ComponentCardModel;
  className?: string;
}) {
  const palette = categoryPalette(component.category);
  const thumb = previewThumb(component);
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${palette.from} 0%, ${palette.to} 100%)`,
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
            <div className="h-1.5 w-10 rounded-sm bg-white/70" />
            <div className="ml-auto h-1.5 w-6 rounded-sm bg-white/35" />
          </div>
          <div className="absolute inset-x-3 bottom-3 z-[1] space-y-1.5">
            <div className="h-2 w-2/3 rounded-sm bg-white/85" />
            <div className="h-1.5 w-1/2 rounded-sm bg-white/45" />
            <div className="mt-1 h-5 w-16 rounded" style={{ background: palette.accent }} />
          </div>
          <Puzzle className="absolute right-3 top-1/2 z-[1] size-8 -translate-y-1/2 text-white/15" />
        </>
      )}
    </div>
  );
}

export function ComponentCard({
  component,
  canWrite,
  onListMarketplace,
  onDelete,
}: {
  component: ComponentCardModel;
  canWrite?: boolean;
  onListMarketplace?: () => void;
  onDelete?: () => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const isPackage = component.rendererKey === 'package';
  const description = componentDescription(component);
  const canDelete = Boolean(onDelete) && !component.isSystem;
  const hasMenu = Boolean(onListMarketplace || canDelete);
  const variants = asModuleVariations(component.variantsJson);
  const suggestChips = suggestChipList(asSuggestMeta(component.suggestJson));
  return (
    <>
    <div
      className="cursor-pointer overflow-hidden rounded-lg border border-border/80 bg-card transition hover:border-primary/40"
      onClick={() => setDetailOpen(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setDetailOpen(true);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="relative">
        <ComponentPreviewSurface component={component} className="aspect-[2/1] w-full" />
        <div className="absolute inset-x-2 top-2 flex flex-wrap gap-1">
          {component.isSystem ? (
            <span className="rounded bg-background/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground shadow-sm">
              System
            </span>
          ) : (
            <span className="rounded bg-teal-700 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
              Custom
            </span>
          )}
          {isPackage ? (
            <span className="rounded bg-background/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground shadow-sm">
              Package
            </span>
          ) : null}
          {variants.length > 1 ? (
            <span className="rounded bg-background/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground shadow-sm">
              {variants.length} variations
            </span>
          ) : null}
        </div>
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight">{component.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {categoryLabel(component.category)}
              {variants.length > 1 ? ` · ${variants.length} looks` : ''}
            </div>
            <div className="mt-1">
              {typeof component.ratingCount === 'number' && component.ratingCount > 0 ? (
                <CatalogRatingBadge
                  rating={{
                    average: component.ratingAverage ?? 0,
                    count: component.ratingCount,
                  }}
                  size="sm"
                />
              ) : null}
            </div>
            {description ? (
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                {description}
              </p>
            ) : null}
            {suggestChips.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {suggestChips.slice(0, 3).map((chip) => (
                  <span
                    key={chip}
                    className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {hasMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-3.5" />
                  <span className="sr-only">More actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {onListMarketplace ? (
                  <DropdownMenuItem disabled={!canWrite} onSelect={() => onListMarketplace()}>
                    <Store className="mr-2 size-3.5" />
                    List on marketplace
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem disabled className="text-muted-foreground">
                  Key: {component.key}
                </DropdownMenuItem>
                {canDelete ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!canWrite}
                      className="text-destructive focus:text-destructive"
                      onSelect={() => onDelete?.()}
                    >
                      <Trash2 className="mr-2 size-3.5" />
                      Delete component
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {component.isSystem ? 'Built-in library' : 'Uploaded package'} · {component.key}
        </div>
      </div>
    </div>
    <ComponentDetailDialog
      component={component}
      open={detailOpen}
      onOpenChange={setDetailOpen}
      canWrite={canWrite}
    />
    </>
  );
}

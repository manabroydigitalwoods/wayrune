import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@wayrune/ui';
import { ThemePreviewSurface, themeDescription, type ThemeCardModel } from './ThemeCard';
import { asSuggestMeta, suggestChipList } from './catalogMeta';
import { buildThemeCatalogDetail } from './catalogDetail';
import {
  CatalogBulletList,
  CatalogChipList,
  CatalogDetailTabs,
  CatalogMetaGrid,
  CatalogRatingBadge,
  CatalogScreensStrip,
  CatalogSection,
  CatalogStatRow,
} from './CatalogDetailParts';
import { CatalogReviewsPanel, type LiveCatalogRating } from './CatalogReviewsPanel';

function TokenSwatch({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span
        className="size-4 shrink-0 rounded border border-border/60"
        style={{ background: color }}
        title={color}
      />
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className="truncate font-mono text-[10px]">{color}</div>
      </div>
    </div>
  );
}

export function ThemeDetailDialog({
  theme,
  open,
  onOpenChange,
  active,
  usedOnLabels,
  canWrite,
  previewUrl,
  onApply,
  applyLabel = 'Apply to website…',
}: {
  theme: ThemeCardModel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active?: boolean;
  usedOnLabels?: string[];
  canWrite?: boolean;
  previewUrl?: string | null;
  onApply?: () => void;
  applyLabel?: string;
}) {
  const [screenId, setScreenId] = useState('home');
  const [liveRating, setLiveRating] = useState<LiveCatalogRating | null>(null);
  if (!theme) return null;

  const tokens = (theme.effectiveTokensJson || theme.tokensJson || {}) as Record<string, unknown>;
  const isChild = Boolean(theme.parentThemeId || theme.parentKey);
  const isPackage = theme.packageFormat === 'v1';
  const description = themeDescription(theme);
  const suggest = asSuggestMeta(theme.suggestJson);
  const suggestChips = suggestChipList(suggest);
  const detail = buildThemeCatalogDetail({
    key: theme.key,
    name: theme.name,
    description,
    previewAssetsJson: theme.previewAssetsJson,
    schemaJson: theme.schemaJson,
    suggestJson: theme.suggestJson,
    hasFullSite: theme.hasFullSite,
    defaultSitePageCount: theme.defaultSitePageCount,
  });
  const rating: LiveCatalogRating =
    liveRating ??
    (typeof theme.ratingCount === 'number' && theme.ratingCount > 0
      ? { average: theme.ratingAverage ?? 0, count: theme.ratingCount }
      : { average: 0, count: 0 });

  const tokenKeys = [
    'primary',
    'accent',
    'background',
    'foreground',
    'muted',
    'surface',
    'fontDisplay',
    'fontBody',
  ] as const;

  const kindLabel = theme.isSystem ? 'System' : isChild ? 'Child' : 'Custom';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setScreenId(detail.screens[0]?.id || 'home');
          setLiveRating(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex h-[min(88vh,640px)] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-1 px-5 py-3.5 pr-12">
          <DialogTitle className="text-base">{theme.name}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span>
              {kindLabel} theme
              {isPackage ? ' · ZIP' : ''}
              {active
                ? usedOnLabels?.length
                  ? ` · On ${usedOnLabels.length} site${usedOnLabels.length === 1 ? '' : 's'}`
                  : ' · In use'
                : ''}
            </span>
            {rating.count > 0 ? <CatalogRatingBadge rating={rating} size="sm" /> : null}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <CatalogDetailTabs
            tabs={[
              {
                value: 'overview',
                label: 'Overview',
                content: (
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <ThemePreviewSurface
                        theme={theme}
                        className="aspect-[4/3] w-[42%] shrink-0 rounded-md border"
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <CatalogStatRow
                          items={[
                            rating.count > 0
                              ? { label: 'Rating', value: rating.average.toFixed(1) }
                              : null,
                            active
                              ? {
                                  label: 'Status',
                                  value: usedOnLabels?.length
                                    ? `${usedOnLabels.length} site${usedOnLabels.length === 1 ? '' : 's'}`
                                    : 'In use',
                                }
                              : { label: 'Status', value: 'Available' },
                            theme.hasFullSite
                              ? {
                                  label: 'Starter',
                                  value: theme.defaultSitePageCount
                                    ? `${theme.defaultSitePageCount}p`
                                    : 'Full',
                                }
                              : null,
                            isPackage
                              ? { label: 'Format', value: 'ZIP' }
                              : { label: 'Format', value: 'Tokens' },
                          ]}
                        />
                        <p className="text-[13px] leading-relaxed text-foreground/90">
                          {detail.longDescription}
                        </p>
                      </div>
                    </div>

                    {detail.highlights.length ? (
                      <CatalogSection title="Why pick this">
                        <CatalogBulletList items={detail.highlights} />
                      </CatalogSection>
                    ) : null}

                    {(detail.includes.length > 0 || detail.idealFor.length > 0) && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {detail.includes.length ? (
                          <CatalogSection title="What you get">
                            <CatalogChipList items={detail.includes} />
                          </CatalogSection>
                        ) : null}
                        {detail.idealFor.length ? (
                          <CatalogSection title="Best for">
                            <CatalogChipList items={detail.idealFor} />
                          </CatalogSection>
                        ) : null}
                      </div>
                    )}

                    {detail.notIdealFor.length ? (
                      <CatalogSection title="Less ideal for">
                        <CatalogChipList items={detail.notIdealFor} />
                      </CatalogSection>
                    ) : null}

                    {usedOnLabels && usedOnLabels.length > 0 ? (
                      <CatalogSection title="Used on">
                        <CatalogChipList items={usedOnLabels} />
                      </CatalogSection>
                    ) : null}

                    {suggestChips.length ? (
                      <CatalogSection title="Tags">
                        <CatalogChipList items={suggestChips} />
                      </CatalogSection>
                    ) : null}

                    <CatalogMetaGrid
                      rows={[
                        { label: 'Key', value: theme.key },
                        {
                          label: 'Owner',
                          value: theme.isSystem ? 'System' : 'Workspace',
                        },
                        { label: 'Format', value: theme.packageFormat || 'legacy_json' },
                        theme.parentKey || theme.parentName
                          ? {
                              label: 'Parent',
                              value: theme.parentName
                                ? `${theme.parentName}`
                                : String(theme.parentKey),
                            }
                          : null,
                      ]}
                    />
                  </div>
                ),
              },
              {
                value: 'screens',
                label: 'Screens',
                content: (
                  <CatalogScreensStrip
                    screens={detail.screens}
                    activeId={screenId}
                    onSelect={setScreenId}
                    renderPreview={(screen) =>
                      screen.imageUrl ? (
                        <img src={screen.imageUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <ThemePreviewSurface theme={theme} className="size-full" />
                      )
                    }
                  />
                ),
              },
              {
                value: 'design',
                label: 'Design',
                content: (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {tokenKeys.map((key) => {
                      const value = tokens[key];
                      if (typeof value !== 'string' || !value) return null;
                      const isColor =
                        value.startsWith('#') ||
                        value.startsWith('rgb') ||
                        value.startsWith('hsl');
                      if (isColor) {
                        return <TokenSwatch key={key} label={key} color={value} />;
                      }
                      return (
                        <div key={key} className="col-span-2 text-xs sm:col-span-3">
                          <div className="text-[10px] text-muted-foreground">{key}</div>
                          <div className="truncate font-mono text-[11px]">{value}</div>
                        </div>
                      );
                    })}
                  </div>
                ),
              },
              {
                value: 'reviews',
                label: 'Reviews',
                content: (
                  <CatalogReviewsPanel
                    targetType="theme"
                    targetId={theme.id}
                    canWrite={canWrite}
                    initialRating={
                      typeof theme.ratingCount === 'number' && theme.ratingCount > 0
                        ? { average: theme.ratingAverage ?? 0, count: theme.ratingCount }
                        : null
                    }
                    onRatingChange={setLiveRating}
                  />
                ),
              },
            ]}
          />
        </DialogBody>

        <DialogFooter className="shrink-0 px-5 py-3">
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {previewUrl ? (
            <Button type="button" size="sm" variant="outline" asChild>
              <a href={previewUrl} target="_blank" rel="noreferrer">
                Preview site
              </a>
            </Button>
          ) : null}
          {onApply ? (
            <Button
              type="button"
              size="sm"
              disabled={!canWrite}
              onClick={() => {
                onApply();
              }}
            >
              {applyLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

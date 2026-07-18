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
import {
  ComponentPreviewSurface,
  componentDescription,
  type ComponentCardModel,
} from './ComponentCard';
import {
  asModuleVariations,
  asSuggestMeta,
  categoryLabel,
  suggestChipList,
} from './catalogMeta';
import { buildComponentCatalogDetail } from './catalogDetail';
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

export function ComponentDetailDialog({
  component,
  open,
  onOpenChange,
  canWrite,
}: {
  component: ComponentCardModel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canWrite?: boolean;
}) {
  const [screenId, setScreenId] = useState('default');
  const [liveRating, setLiveRating] = useState<LiveCatalogRating | null>(null);
  if (!component) return null;

  const isPackage = component.rendererKey === 'package';
  const assets = component.assetsJson || {};
  const description = componentDescription(component);
  const schema = Array.isArray(component.schemaJson) ? component.schemaJson : [];
  const defaultProps = component.defaultPropsJson || {};
  const variants = asModuleVariations(component.variantsJson);
  const suggest = asSuggestMeta(component.suggestJson);
  const suggestChips = suggestChipList(suggest);
  const detail = buildComponentCatalogDetail({
    key: component.key,
    name: component.name,
    category: component.category,
    description,
    previewJson: component.previewJson,
    assetsJson: component.assetsJson,
    schemaJson: component.schemaJson,
    suggestJson: component.suggestJson,
    variantCount: variants.length,
  });
  const rating: LiveCatalogRating =
    liveRating ??
    (typeof component.ratingCount === 'number' && component.ratingCount > 0
      ? { average: component.ratingAverage ?? 0, count: component.ratingCount }
      : { average: 0, count: 0 });

  const version =
    typeof assets.version === 'string'
      ? assets.version
      : typeof assets.packageFormat === 'string'
        ? String(assets.packageFormat)
        : null;
  const entry =
    assets.entry && typeof assets.entry === 'object'
      ? (assets.entry as Record<string, unknown>)
      : null;
  const schemaFields = schema
    .map((f) => {
      const key = typeof f.key === 'string' ? f.key : null;
      if (!key) return null;
      const label = typeof f.label === 'string' ? f.label : key;
      const type = typeof f.type === 'string' ? f.type : 'text';
      return { key, label, type, required: Boolean(f.required) };
    })
    .filter(Boolean) as Array<{ key: string; label: string; type: string; required: boolean }>;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setScreenId(detail.screens[0]?.id || 'default');
          setLiveRating(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex h-[min(88vh,640px)] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-1 px-5 py-3.5 pr-12">
          <DialogTitle className="text-base">{component.name}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span>
              {component.isSystem ? 'System' : 'Custom'}
              {isPackage ? ' · ZIP' : ''}
              {' · '}
              {categoryLabel(component.category)}
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
                      <ComponentPreviewSurface
                        component={component}
                        className="aspect-[4/3] w-[42%] shrink-0 rounded-md border"
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <CatalogStatRow
                          items={[
                            rating.count > 0
                              ? { label: 'Rating', value: rating.average.toFixed(1) }
                              : null,
                            { label: 'Level', value: detail.complexity },
                            detail.fieldCount
                              ? { label: 'Fields', value: String(detail.fieldCount) }
                              : null,
                            detail.variantCount > 1
                              ? { label: 'Variants', value: String(detail.variantCount) }
                              : null,
                          ]}
                        />
                        <p className="text-[13px] leading-relaxed text-foreground/90">
                          {detail.longDescription}
                        </p>
                      </div>
                    </div>

                    {detail.highlights.length ? (
                      <CatalogSection title="Why use it">
                        <CatalogBulletList items={detail.highlights} />
                      </CatalogSection>
                    ) : null}

                    {(detail.includes.length > 0 || detail.idealFor.length > 0) && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {detail.includes.length ? (
                          <CatalogSection title="Includes">
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

                    {variants.length ? (
                      <CatalogSection title="Variants">
                        <div className="space-y-1">
                          {variants.map((v) => (
                            <div
                              key={v.key}
                              className="flex items-baseline justify-between gap-2 rounded-md border px-2.5 py-1.5"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-medium">
                                  {v.name}
                                  {v.isDefault ? (
                                    <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                                      default
                                    </span>
                                  ) : null}
                                </div>
                                {v.description ? (
                                  <p className="text-[11px] text-muted-foreground">{v.description}</p>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CatalogSection>
                    ) : null}

                    {suggestChips.length ? (
                      <CatalogSection title="Tags">
                        <CatalogChipList items={suggestChips} />
                      </CatalogSection>
                    ) : null}

                    <CatalogMetaGrid
                      rows={[
                        { label: 'Key', value: component.key },
                        { label: 'Renderer', value: component.rendererKey },
                        {
                          label: 'Owner',
                          value: component.isSystem ? 'System' : 'Workspace',
                        },
                        component.status ? { label: 'Status', value: component.status } : null,
                        version ? { label: 'Package', value: version } : null,
                        typeof entry?.html === 'string'
                          ? { label: 'HTML', value: entry.html }
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
                        <ComponentPreviewSurface component={component} className="size-full" />
                      )
                    }
                  />
                ),
              },
              {
                value: 'fields',
                label: 'Fields',
                content: (
                  <div className="space-y-3">
                    {schemaFields.length ? (
                      <div className="overflow-hidden rounded-md border">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="px-2.5 py-1.5 font-medium">Label</th>
                              <th className="px-2.5 py-1.5 font-medium">Key</th>
                              <th className="px-2.5 py-1.5 font-medium">Type</th>
                            </tr>
                          </thead>
                          <tbody>
                            {schemaFields.map((field) => (
                              <tr key={field.key} className="border-t">
                                <td className="px-2.5 py-1.5">
                                  {field.label}
                                  {field.required ? (
                                    <span className="ml-0.5 text-destructive">*</span>
                                  ) : null}
                                </td>
                                <td className="px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">
                                  {field.key}
                                </td>
                                <td className="px-2.5 py-1.5 text-muted-foreground">{field.type}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No schema fields defined.</p>
                    )}
                    {Object.keys(defaultProps).length ? (
                      <CatalogSection title="Default props">
                        <CatalogChipList items={Object.keys(defaultProps).slice(0, 20)} mono />
                      </CatalogSection>
                    ) : null}
                  </div>
                ),
              },
              {
                value: 'reviews',
                label: 'Reviews',
                content: (
                  <CatalogReviewsPanel
                    targetType="module"
                    targetId={component.id}
                    canWrite={canWrite}
                    initialRating={
                      typeof component.ratingCount === 'number' && component.ratingCount > 0
                        ? {
                            average: component.ratingAverage ?? 0,
                            count: component.ratingCount,
                          }
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
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { Plus, Trash2 } from 'lucide-react';
import { resolveRenderableModuleType } from '@wayrune/contracts';
import { Button, Combobox, Input, Label, Switch, Textarea, cn } from '@wayrune/ui';
import { emptyListItem, listItemFieldsFor } from './helpers';
import { MediaPickerField } from './MediaPicker';
import { looksLikeLinkFieldKey, looksLikeMediaUrlFieldKey, PageLinkField } from './PageLinkField';
import type { FormDef, Identity, ListItemField, SchemaField } from './types';

function isCompactTextField(field: ListItemField) {
  return field.type !== 'textarea' && field.type !== 'url';
}

export function ModuleFieldEditors({
  fields,
  propsJson,
  rendererKey,
  forms,
  onChange,
  dense,
  mediaContext,
}: {
  fields: SchemaField[];
  propsJson: Record<string, unknown>;
  rendererKey: string;
  forms: FormDef[];
  onChange: (key: string, value: unknown) => void;
  dense?: boolean;
  mediaContext?: {
    siteId: string;
    identity: Identity | null;
    site?: {
      primaryDomain?: string | null;
      isPrimary?: boolean;
      platformSlug?: string | null;
      platformHost?: string | null;
    } | null;
  } | null;
}) {
  const resolvedRendererKey = resolveRenderableModuleType(rendererKey);

  return (
    <div className={dense ? 'space-y-2.5' : 'space-y-4'}>
      {fields.map((field) => {
        const value = propsJson[field.key];
        const type = field.type;
        const labelClass = dense ? 'text-[11px] text-muted-foreground' : undefined;
        const inputClass = dense ? 'mt-0.5 h-8' : undefined;

        if (type === 'list') {
          const itemFields = listItemFieldsFor(resolvedRendererKey, field.key);
          const items = Array.isArray(value)
            ? value.map((item) =>
                item && typeof item === 'object' && !Array.isArray(item)
                  ? (item as Record<string, unknown>)
                  : typeof item === 'string'
                    ? { url: item, alt: '' }
                    : emptyListItem(itemFields),
              )
            : [];
          const shortFields = itemFields.filter(isCompactTextField);
          const useCompactGrid =
            dense && shortFields.length >= 2 && shortFields.length === itemFields.length;

          return (
            <div key={field.key} className={dense ? 'space-y-1.5' : 'space-y-2'}>
              <div className="flex items-center justify-between gap-2">
                <Label className={cn(labelClass, dense && 'font-medium text-foreground')}>
                  {field.label}
                  {field.required ? ' *' : ''}
                  {items.length ? (
                    <span className="ml-1 font-normal text-muted-foreground">({items.length})</span>
                  ) : null}
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => onChange(field.key, [...items, emptyListItem(itemFields)])}
                >
                  <Plus className="mr-1 size-3" />
                  Add
                </Button>
              </div>
              {field.helpText ? (
                <p className="text-[11px] leading-snug text-muted-foreground">{field.helpText}</p>
              ) : null}
              <div className={dense ? 'space-y-1.5' : 'space-y-3'}>
                {items.map((item, index) => (
                  <div
                    key={`${field.key}-${index}`}
                    className={cn(
                      'rounded-md border border-border/70 bg-muted/20',
                      dense ? 'p-1.5' : 'space-y-2 p-3',
                    )}
                  >
                    {useCompactGrid ? (
                      <div className="flex items-start gap-1.5">
                        <span
                          className="mt-1.5 flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground"
                          aria-hidden
                        >
                          {index + 1}
                        </span>
                        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
                          {itemFields.map((itemField) => (
                            <div key={itemField.key} className="min-w-0">
                              <Label className="sr-only">{itemField.label}</Label>
                              <Input
                                className="h-8"
                                placeholder={itemField.label}
                                type="text"
                                value={String(item[itemField.key] ?? '')}
                                onChange={(e) => {
                                  const next = items.map((row, i) =>
                                    i === index ? { ...row, [itemField.key]: e.target.value } : row,
                                  );
                                  onChange(field.key, next);
                                }}
                              />
                            </div>
                          ))}
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            onChange(
                              field.key,
                              items.filter((_, i) => i !== index),
                            )
                          }
                          aria-label={`Remove item ${index + 1}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className={cn('flex items-center justify-between', dense && 'mb-1')}>
                          <div className="text-[11px] font-medium text-muted-foreground">
                            #{index + 1}
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-6"
                            onClick={() =>
                              onChange(
                                field.key,
                                items.filter((_, i) => i !== index),
                              )
                            }
                            aria-label={`Remove item ${index + 1}`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                        <div className={cn(dense ? 'space-y-1.5' : 'space-y-2')}>
                          {itemFields.map((itemField) => (
                            <div key={itemField.key}>
                              {itemField.type === 'url' &&
                              mediaContext &&
                              looksLikeMediaUrlFieldKey(itemField.key) ? (
                                <MediaPickerField
                                  label={itemField.label}
                                  value={String(item[itemField.key] ?? '')}
                                  dense={dense}
                                  siteId={mediaContext.siteId}
                                  identity={mediaContext.identity}
                                  site={mediaContext.site}
                                  onChange={(url) => {
                                    const next = items.map((row, i) =>
                                      i === index ? { ...row, [itemField.key]: url } : row,
                                    );
                                    onChange(field.key, next);
                                  }}
                                />
                              ) : itemField.type === 'url' &&
                                mediaContext &&
                                looksLikeLinkFieldKey(itemField.key) ? (
                                <PageLinkField
                                  label={itemField.label}
                                  dense={dense}
                                  siteId={mediaContext.siteId}
                                  value={String(item[itemField.key] ?? '')}
                                  onChange={(url) => {
                                    const next = items.map((row, i) =>
                                      i === index ? { ...row, [itemField.key]: url } : row,
                                    );
                                    onChange(field.key, next);
                                  }}
                                />
                              ) : itemField.type === 'textarea' ? (
                                <>
                                  <Label className="text-[11px] text-muted-foreground">
                                    {itemField.label}
                                  </Label>
                                  <Textarea
                                    className="mt-0.5"
                                    rows={dense ? 2 : 3}
                                    value={String(item[itemField.key] ?? '')}
                                    onChange={(e) => {
                                      const next = items.map((row, i) =>
                                        i === index
                                          ? { ...row, [itemField.key]: e.target.value }
                                          : row,
                                      );
                                      onChange(field.key, next);
                                    }}
                                  />
                                </>
                              ) : (
                                <>
                                  <Label className="text-[11px] text-muted-foreground">
                                    {itemField.label}
                                  </Label>
                                  <Input
                                    className={inputClass}
                                    type={itemField.type === 'url' ? 'url' : 'text'}
                                    value={String(item[itemField.key] ?? '')}
                                    onChange={(e) => {
                                      const next = items.map((row, i) =>
                                        i === index
                                          ? { ...row, [itemField.key]: e.target.value }
                                          : row,
                                      );
                                      onChange(field.key, next);
                                    }}
                                  />
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {!items.length ? (
                  <p className="text-[11px] text-muted-foreground">
                    No items yet. Add one to get started.
                  </p>
                ) : null}
              </div>
            </div>
          );
        }

        if (type === 'boolean') {
          return (
            <div
              key={field.key}
              className={cn(
                'flex items-center justify-between gap-3 rounded-md border',
                dense ? 'px-2 py-1' : 'px-3 py-2',
              )}
            >
              <div>
                <Label className={labelClass}>{field.label}</Label>
                {field.helpText ? (
                  <p className="text-[11px] text-muted-foreground">{field.helpText}</p>
                ) : null}
              </div>
              <Switch
                checked={value === true}
                onCheckedChange={(checked) => onChange(field.key, checked)}
              />
            </div>
          );
        }

        if (type === 'select') {
          const options =
            field.options?.length
              ? field.options
              : field.key === 'formKey'
                ? forms.map((form) => ({ value: form.key, label: form.name }))
                : [];
          return (
            <div key={field.key}>
              <Label className={labelClass}>
                {field.label}
                {field.required ? ' *' : ''}
              </Label>
              <Combobox
                size={dense ? 'sm' : 'default'}
                className={dense ? 'mt-0.5' : 'mt-1.5'}
                value={typeof value === 'string' ? value : ''}
                onChange={(next) => onChange(field.key, next)}
                options={[
                  { value: '', label: 'Select…' },
                  ...options.map((opt) => ({ value: opt.value, label: opt.label })),
                ]}
              />
              {field.helpText ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">{field.helpText}</p>
              ) : null}
            </div>
          );
        }

        if (type === 'textarea') {
          return (
            <div key={field.key}>
              <Label className={labelClass}>
                {field.label}
                {field.required ? ' *' : ''}
              </Label>
              <Textarea
                className="mt-0.5"
                rows={dense ? 2 : 4}
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => onChange(field.key, e.target.value)}
              />
              {field.helpText ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">{field.helpText}</p>
              ) : null}
            </div>
          );
        }

        if (type === 'color') {
          const color = typeof value === 'string' && value ? value : '#0f766e';
          return (
            <div key={field.key}>
              <Label className={labelClass}>
                {field.label}
                {field.required ? ' *' : ''}
              </Label>
              <div className={cn('flex items-center gap-2', dense ? 'mt-0.5' : 'mt-1.5')}>
                <input
                  type="color"
                  className={cn(
                    'cursor-pointer rounded border bg-background p-1',
                    dense ? 'h-8 w-10' : 'h-9 w-12',
                  )}
                  value={color}
                  onChange={(e) => onChange(field.key, e.target.value)}
                />
                <Input
                  className={inputClass}
                  value={color}
                  onChange={(e) => onChange(field.key, e.target.value)}
                />
              </div>
            </div>
          );
        }

        if (type === 'url' && mediaContext && looksLikeMediaUrlFieldKey(field.key)) {
          return (
            <MediaPickerField
              key={field.key}
              label={`${field.label}${field.required ? ' *' : ''}`}
              value={typeof value === 'string' ? value : ''}
              dense={dense}
              siteId={mediaContext.siteId}
              identity={mediaContext.identity}
              site={mediaContext.site}
              onChange={(url) => onChange(field.key, url)}
            />
          );
        }

        if (
          (type === 'url' || type === 'text') &&
          mediaContext &&
          looksLikeLinkFieldKey(field.key)
        ) {
          return (
            <PageLinkField
              key={field.key}
              label={`${field.label}${field.required ? ' *' : ''}`}
              value={typeof value === 'string' ? value : ''}
              dense={dense}
              siteId={mediaContext.siteId}
              onChange={(url) => onChange(field.key, url)}
            />
          );
        }

        return (
          <div key={field.key}>
            <Label className={labelClass}>
              {field.label}
              {field.required ? ' *' : ''}
            </Label>
            <Input
              className={inputClass}
              type={type === 'number' ? 'number' : type === 'url' ? 'url' : 'text'}
              value={
                typeof value === 'string' || typeof value === 'number' ? String(value) : ''
              }
              onChange={(e) =>
                onChange(
                  field.key,
                  type === 'number'
                    ? e.target.value === ''
                      ? ''
                      : Number(e.target.value)
                    : e.target.value,
                )
              }
            />
            {field.helpText ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{field.helpText}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

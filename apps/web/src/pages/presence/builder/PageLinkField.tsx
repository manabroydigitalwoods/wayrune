import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Combobox, Input, Label } from '@wayrune/ui';
import { api } from '../../../api';

export type SitePageOption = {
  id: string;
  title: string;
  path: string;
  siteId?: string;
  site?: { id: string } | null;
};

function normalizePath(path: string) {
  const trimmed = path.trim() || '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function isExternalUrl(value: string) {
  return /^https?:\/\//i.test(value.trim()) || value.trim().startsWith('mailto:');
}

/** Link/path field: pick a site page, or enter a custom path/URL. */
export function PageLinkField({
  label,
  value,
  onChange,
  siteId,
  disabled = false,
  dense = false,
  placeholder = '/about',
  allowExternal = true,
  onPagePicked,
}: {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  siteId: string;
  disabled?: boolean;
  dense?: boolean;
  placeholder?: string;
  allowExternal?: boolean;
  /** Called when user picks an existing page (useful to fill a label). */
  onPagePicked?: (page: { title: string; path: string }) => void;
}) {
  const [pages, setPages] = useState<SitePageOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [forceCustom, setForceCustom] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api<SitePageOption[]>('/presence/pages')
      .then((rows) => {
        if (cancelled) return;
        const filtered = (rows || []).filter((row) => {
          const rowSiteId = row.siteId || row.site?.id;
          return rowSiteId === siteId;
        });
        setPages(
          filtered
            .map((row) => ({
              ...row,
              path: normalizePath(row.path || '/'),
            }))
            .sort((a, b) => a.title.localeCompare(b.title)),
        );
      })
      .catch(() => {
        if (!cancelled) setPages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const matched = useMemo(
    () => pages.find((page) => normalizePath(page.path) === normalizePath(value || '/')),
    [pages, value],
  );

  const isCustom =
    forceCustom ||
    (!matched && Boolean(value.trim())) ||
    isExternalUrl(value);

  const selectValue = matched?.id || (isCustom ? '__custom__' : '');

  // Reset forceCustom when value matches a page again.
  useEffect(() => {
    if (matched) setForceCustom(false);
  }, [matched]);

  return (
    <div className="space-y-1.5">
      {label ? <Label className="text-xs">{label}</Label> : null}
      <Combobox
        size={dense ? 'sm' : 'default'}
        className="w-full"
        disabled={disabled || loading}
        value={selectValue}
        onChange={(next) => {
          if (!next) {
            setForceCustom(false);
            onChange('');
            return;
          }
          if (next === '__custom__') {
            setForceCustom(true);
            if (matched || !value.trim()) {
              onChange(placeholder.startsWith('/') || isExternalUrl(placeholder) ? placeholder : '/');
            }
            return;
          }
          setForceCustom(false);
          const page = pages.find((row) => row.id === next);
          if (page) {
            const path = normalizePath(page.path);
            onChange(path);
            onPagePicked?.({ title: page.title, path });
          }
        }}
        options={[
          { value: '', label: loading ? 'Loading pages…' : 'Select a page…' },
          ...pages.map((page) => ({
            value: page.id,
            label: page.title,
            description: page.path,
          })),
          ...(allowExternal ? [{ value: '__custom__', label: 'Custom path / URL…' }] : []),
        ]}
      />
      {isCustom ? (
        <Input
          className={dense ? 'h-8' : 'h-9'}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            setForceCustom(true);
            onChange(e.target.value);
          }}
        />
      ) : matched ? (
        <p className="text-[11px] text-muted-foreground">
          Opens <span className="font-mono text-foreground/80">{matched.path}</span>
        </p>
      ) : !pages.length && !loading ? (
        <p className="text-[10px] text-muted-foreground">
          No pages on this site yet — choose Custom path / URL.
        </p>
      ) : null}
    </div>
  );
}

/** @deprecated Prefer MenuBuilder — flat Primary entries only. */
export function NavigationEditor({
  entries,
  readOnly,
  siteId,
  onChange,
}: {
  entries: Array<Record<string, unknown>>;
  readOnly: boolean;
  siteId: string;
  onChange: (entries: Array<Record<string, unknown>>) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Navigation links (Primary)</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7"
          disabled={readOnly}
          onClick={() => onChange([...entries, { label: 'New link', path: '/' }])}
        >
          <Plus className="mr-1 size-3.5" />
          Add
        </Button>
      </div>
      <div className="space-y-2">
        {entries.map((entry, index) => (
          <div key={index} className="space-y-1.5 rounded-md border p-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-muted-foreground">Link {index + 1}</div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-6"
                disabled={readOnly}
                onClick={() => onChange(entries.filter((_, i) => i !== index))}
                aria-label={`Remove link ${index + 1}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <Input
              className="h-8"
              placeholder="Label"
              value={String(entry.label ?? '')}
              disabled={readOnly}
              onChange={(e) =>
                onChange(entries.map((row, i) => (i === index ? { ...row, label: e.target.value } : row)))
              }
            />
            <PageLinkField
              dense
              siteId={siteId}
              disabled={readOnly}
              value={String(entry.path ?? '')}
              placeholder="/"
              onPagePicked={(page) => {
                const label = String(entry.label ?? '');
                if (!label || label === 'New link') {
                  onChange(
                    entries.map((row, i) => (i === index ? { ...row, label: page.title, path: page.path } : row)),
                  );
                }
              }}
              onChange={(path) => {
                onChange(entries.map((row, i) => (i === index ? { ...row, path } : row)));
              }}
            />
          </div>
        ))}
        {!entries.length ? (
          <p className="text-xs text-muted-foreground">
            No links yet. Prefer Site chrome → Menus for nested Primary/Footer menus.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function looksLikeLinkFieldKey(key: string) {
  return /(href|link|path|url|cta)$/i.test(key) && !/(image|src|photo|media|logo|og)/i.test(key);
}

export function looksLikeMediaUrlFieldKey(key: string) {
  return /(image|src|photo|media|logo|ogImage|thumbnail)/i.test(key);
}

import { useState, type ReactNode } from 'react';
import { Plus, Star, X } from 'lucide-react';
import { Button, Input, SimpleFormField as FormField, cn } from '@wayrune/ui';

export function ProfileFormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-b border-border/50 pb-4 last:border-b-0 last:pb-0">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function StarRatingInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const n = Number(value);
  const current = Number.isFinite(n) && n > 0 ? Math.min(5, Math.round(n)) : 0;
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Hotel category stars">
      {[1, 2, 3, 4, 5].map((star) => {
        const on = star <= current;
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            aria-label={`${star}-star hotel`}
            className={cn(
              'rounded-md p-1 transition-colors',
              on ? 'text-amber-500' : 'text-muted-foreground/40 hover:text-amber-400',
              disabled && 'opacity-50',
            )}
            onClick={() => onChange(current === star ? '' : String(star))}
          >
            <Star className={cn('size-5', on && 'fill-current')} />
          </button>
        );
      })}
      {current ? (
        <span className="ml-1 text-xs text-muted-foreground tabular-nums">
          {current}★ hotel
        </span>
      ) : null}
      {current ? (
        <button
          type="button"
          className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
          disabled={disabled}
          onClick={() => onChange('')}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

export function MultiChipField({
  label,
  value,
  onChange,
  presets,
  placeholder = 'Add custom…',
  disabled,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  presets: string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const selected = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  function write(next: string[]) {
    onChange(next.join(', '));
  }

  function toggle(item: string) {
    if (disabled) return;
    if (selected.some((s) => s.toLowerCase() === item.toLowerCase())) {
      write(selected.filter((s) => s.toLowerCase() !== item.toLowerCase()));
    } else {
      write([...selected, item]);
    }
  }

  function addCustom() {
    const t = draft.trim();
    if (!t) return;
    if (!selected.some((s) => s.toLowerCase() === t.toLowerCase())) {
      write([...selected, t]);
    }
    setDraft('');
  }

  const extras = selected.filter(
    (s) => !presets.some((p) => p.toLowerCase() === s.toLowerCase()),
  );

  return (
    <FormField label={label}>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const on = selected.some((s) => s.toLowerCase() === p.toLowerCase());
          return (
            <button
              key={p}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => toggle(p)}
              className={cn(
                'rounded-md border px-2 py-1 text-xs transition-colors',
                on
                  ? 'border-primary bg-primary/15 text-foreground'
                  : 'border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {p}
            </button>
          );
        })}
        {extras.map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            aria-pressed
            onClick={() => toggle(p)}
            className="inline-flex items-center gap-1 rounded-md border border-primary bg-primary/15 px-2 py-1 text-xs"
          >
            {p}
            <X className="size-3 opacity-70" />
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || !draft.trim()}
          onClick={addCustom}
        >
          Add
        </Button>
      </div>
    </FormField>
  );
}

export function ImageUrlField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const show = Boolean(value.trim().match(/^https?:\/\//i));
  return (
    <FormField label={label}>
      <div className="flex gap-3">
        <div className="size-16 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted">
          {show ? (
            <img
              src={value.trim()}
              alt=""
              className="size-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
              }}
            />
          ) : (
            <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
              Photo
            </div>
          )}
        </div>
        <Input
          className="min-w-0 flex-1"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || 'https://…'}
        />
      </div>
    </FormField>
  );
}

export function GalleryUrlList({
  value,
  onChange,
  disabled,
}: {
  /** Newline-separated URLs */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const urls = value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  function write(next: string[]) {
    onChange(next.join('\n'));
  }

  return (
    <FormField label="Gallery photos">
      <ul className="space-y-2">
        {urls.map((url, i) => (
          <li key={`${i}-${url.slice(0, 24)}`} className="flex gap-2">
            <div className="size-12 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted">
              {/^https?:\/\//i.test(url) ? (
                <img src={url} alt="" className="size-full object-cover" loading="lazy" />
              ) : null}
            </div>
            <Input
              className="min-w-0 flex-1"
              value={url}
              disabled={disabled}
              onChange={(e) => {
                const next = [...urls];
                next[i] = e.target.value;
                write(next);
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="shrink-0"
              disabled={disabled}
              aria-label="Remove photo"
              onClick={() => write(urls.filter((_, idx) => idx !== i))}
            >
              <X className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-2"
        disabled={disabled}
        onClick={() => write([...urls, ''])}
      >
        <Plus className="size-3.5" />
        Add photo URL
      </Button>
    </FormField>
  );
}

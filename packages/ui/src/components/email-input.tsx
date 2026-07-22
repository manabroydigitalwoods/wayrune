import * as React from 'react';
import { cn } from '../lib/utils';
import { Input } from './ui/input';

/** Common consumer providers — users can still type any business domain. */
export const COMMON_EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'rediffmail.com',
] as const;

function splitEmail(value: string): { local: string; domain: string } {
  const at = value.indexOf('@');
  if (at === -1) return { local: value, domain: '' };
  return { local: value.slice(0, at), domain: value.slice(at + 1) };
}

function applyDomain(value: string, domain: string): string {
  const local = splitEmail(value).local.trim();
  if (!local) return `@${domain}`;
  return `${local}@${domain}`;
}

export function EmailInput({
  value,
  onChange,
  id,
  placeholder = 'name@company.com',
  disabled,
  className,
  inputSize = 'default',
  domains = COMMON_EMAIL_DOMAINS,
  maxVisibleDomains = 3,
  'aria-invalid': ariaInvalid,
  autoComplete = 'email',
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputSize?: 'default' | 'sm';
  domains?: readonly string[];
  /** How many domain chips to show before “More domains” (default 3). */
  maxVisibleDomains?: number;
  'aria-invalid'?: boolean;
  autoComplete?: string;
}) {
  const [showAllDomains, setShowAllDomains] = React.useState(false);
  const { domain: currentDomain } = splitEmail(value);
  const query = currentDomain.toLowerCase();
  const filtered = query
    ? domains.filter((d) => d.startsWith(query) || d.includes(query))
    : [...domains];
  const pool = filtered.length > 0 ? filtered : domains.slice(0, Math.max(maxVisibleDomains, 1));
  const chips =
    showAllDomains || query || pool.length <= maxVisibleDomains
      ? pool
      : pool.slice(0, maxVisibleDomains);
  const canExpand = !query && !showAllDomains && pool.length > maxVisibleDomains;

  return (
    <div className={cn('space-y-1.5', className)}>
      <Input
        id={id}
        type="email"
        inputMode="email"
        autoComplete={autoComplete}
        inputSize={inputSize}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={ariaInvalid}
        onChange={(e) => onChange(e.target.value)}
      />
      <div
        role="group"
        aria-label="Email domain suggestions"
        className="flex flex-wrap gap-1.5"
      >
        {chips.map((domain) => {
          const selected = currentDomain.toLowerCase() === domain.toLowerCase();
          return (
            <button
              key={domain}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              title={`Use @${domain}`}
              onClick={() => onChange(applyDomain(value, domain))}
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                selected
                  ? 'border-primary/50 bg-primary/15 text-primary'
                  : 'border-border/80 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:bg-primary-50 hover:text-foreground',
              )}
            >
              @{domain}
            </button>
          );
        })}
        {canExpand ? (
          <button
            type="button"
            disabled={disabled}
            className="rounded-full border border-dashed border-border/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
            onClick={() => setShowAllDomains(true)}
          >
            More domains
          </button>
        ) : null}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Business domain? Just type it after @
      </p>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Input, cn } from '@wayrune/ui';
import { api } from '../api';

type SearchHit = {
  type: string;
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
};

type SearchResponse = {
  query: string;
  types: string[] | null;
  facets: Record<string, number>;
  results: SearchHit[];
};

const TYPE_CHIPS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'party', label: 'Parties' },
  { value: 'trip', label: 'Trips' },
  { value: 'lead', label: 'Leads' },
  { value: 'quotation', label: 'Quotes' },
  { value: 'service_request', label: 'SRs' },
  { value: 'document', label: 'Docs' },
  { value: 'asset', label: 'Assets' },
];

const TYPE_LABEL: Record<string, string> = {
  party: 'Party',
  trip: 'Trip',
  lead: 'Lead',
  quotation: 'Quote',
  service_request: 'Service request',
  document: 'Document',
  asset: 'Asset',
};

function useModKeyLabel() {
  return useMemo(() => {
    if (typeof navigator === 'undefined') return '⌘';
    const platform = navigator.platform || '';
    const ua = navigator.userAgent || '';
    const isApple = /Mac|iPhone|iPad|iPod/.test(platform) || /Mac OS X/.test(ua);
    return isApple ? '⌘' : 'Ctrl';
  }, []);
}

export function GlobalSearch({ onNavigate }: { onNavigate: (to: string) => void }) {
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [facets, setFacets] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const modKey = useModKeyLabel();

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      setFacets({});
      return;
    }
    const handle = setTimeout(() => {
      const params = new URLSearchParams({ q: q.trim() });
      if (typeFilter) params.set('types', typeFilter);
      void api<SearchResponse>(`/search?${params}`)
        .then((res) => {
          setResults(res.results);
          setFacets(res.facets || {});
          setOpen(true);
        })
        .catch(() => {
          setResults([]);
          setFacets({});
        });
    }, 250);
    return () => clearTimeout(handle);
  }, [q, typeFilter]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
      if (e.defaultPrevented) return;
      // Digital Presence owns ⌘K for its command palette while that page is mounted.
      if (document.querySelector('[data-presence-command-palette]')) return;
      e.preventDefault();
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.select();
      if (q.trim().length >= 2) setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q]);

  const totalFacets = Object.values(facets).reduce((a, b) => a + b, 0);
  const shortcutLabel = `${modKey}K`;

  return (
    <div ref={wrapRef} className="relative w-[min(100%,11.5rem)] shrink-0 sm:w-[13rem]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/55" />
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => (results.length || totalFacets > 0) && setOpen(true)}
          placeholder="Search Wayrune…"
          aria-label="Search Wayrune"
          aria-keyshortcuts="Meta+K Control+K"
          className={cn(
            'h-[var(--control-h-sm)] border-border/40 bg-muted/25 pl-7 pr-10',
            'text-[length:var(--control-text-sm)] text-muted-foreground shadow-none',
            'placeholder:text-muted-foreground/50',
            'hover:border-border/55 hover:bg-muted/35',
            'focus-visible:border-border/70 focus-visible:bg-background/80 focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/40',
          )}
        />
        <kbd
          className="pointer-events-none absolute right-1.5 top-1/2 hidden -translate-y-1/2 select-none items-center rounded border border-border/45 bg-background/40 px-1 py-px font-sans text-[10px] font-medium leading-none text-muted-foreground/55 sm:inline-flex"
          aria-hidden
        >
          {shortcutLabel}
        </kbd>
      </div>
      {open && q.trim().length >= 2 ? (
        <div className="absolute right-0 z-50 mt-1 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border/70 bg-card shadow-lg">
          <div className="flex flex-wrap gap-1 border-b border-border/60 px-2 py-2">
            {TYPE_CHIPS.map((chip) => {
              const count = chip.value ? facets[chip.value] ?? 0 : totalFacets;
              const active = typeFilter === chip.value;
              const disabled = chip.value !== '' && count === 0;
              return (
                <button
                  key={chip.value || 'all'}
                  type="button"
                  disabled={disabled}
                  className={`rounded-md px-2 py-0.5 text-[11px] ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : disabled
                        ? 'text-muted-foreground/40'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                  onClick={() => setTypeFilter(chip.value)}
                >
                  {chip.label}
                  {count > 0 ? ` ${count}` : ''}
                </button>
              );
            })}
          </div>
          {results.length > 0 ? (
            <ul className="max-h-72 overflow-auto py-1">
              {results.map((r) => (
                <li key={`${r.type}-${r.id}`}>
                  <button
                    type="button"
                    className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-muted/60"
                    onClick={() => {
                      setOpen(false);
                      setQ('');
                      setTypeFilter('');
                      onNavigate(r.href);
                    }}
                  >
                    <span className="font-medium">{r.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {TYPE_LABEL[r.type] || r.type}
                      {r.subtitle ? ` · ${r.subtitle}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-sm text-muted-foreground">No matches in this facet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

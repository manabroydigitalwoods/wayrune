import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@travel/ui';
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

export function GlobalSearch({ onNavigate }: { onNavigate: (to: string) => void }) {
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [facets, setFacets] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  const totalFacets = Object.values(facets).reduce((a, b) => a + b, 0);

  return (
    <div ref={wrapRef} className="relative w-full max-w-sm">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => (results.length || totalFacets > 0) && setOpen(true)}
          placeholder="Search parties, trips, leads…"
          className="h-9 pl-8 text-sm"
        />
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

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Input } from '@wayrune/ui';
import { api } from '../../api';

type SearchHit = {
  kind: string;
  id: string;
  label: string;
  meta?: string;
  href?: string;
};

export function PresenceCommandPalette({ orgId }: { orgId: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      api<{ results: SearchHit[] }>(
        `/presence/command-search?q=${encodeURIComponent(q.trim())}&limit=20`,
      )
        .then((res) => setResults(res.results || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(t);
  }, [q, open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>Search Digital Presence</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="size-4 text-muted-foreground" />
          <Input
            autoFocus
            className="border-0 shadow-none focus-visible:ring-0"
            placeholder="Search pages, themes, components, forms, collections…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <kbd className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">⌘K</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {loading ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">Searching…</p>
          ) : !q.trim() ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Type to search across Presence. Press Esc to close.
            </p>
          ) : !results.length ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">No matches.</p>
          ) : (
            <ul className="space-y-0.5">
              {results.map((hit) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setOpen(false);
                      if (hit.href) {
                        const href = hit.href.startsWith('/')
                          ? `/${orgId}${hit.href}`
                          : hit.href;
                        navigate(href);
                      }
                    }}
                  >
                    <span className="mt-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                      {hit.kind}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{hit.label}</span>
                      {hit.meta ? (
                        <span className="block truncate text-xs text-muted-foreground">{hit.meta}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

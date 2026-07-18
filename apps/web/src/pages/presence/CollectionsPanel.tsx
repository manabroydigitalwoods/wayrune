import { useEffect, useState } from 'react';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Combobox,
  Input,
  Label,
  StatusBadge,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';

type Collection = {
  id: string;
  key: string;
  name: string;
  listingPath?: string | null;
  _count?: { entries: number };
};

type Entry = {
  id: string;
  slug: string;
  title: string;
  status: string;
};

type SiteOption = { id: string; name: string };

export function CollectionsPanel({
  siteId,
  sites,
  canWrite,
  onSiteChange,
}: {
  siteId: string | null;
  sites: SiteOption[];
  canWrite: boolean;
  onSiteChange?: (siteId: string) => void;
}) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [entryTitle, setEntryTitle] = useState('');
  const [entrySlug, setEntrySlug] = useState('');
  const [loading, setLoading] = useState(false);

  const refreshCollections = async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const rows = await api<Collection[]>(`/presence/sites/${siteId}/collections`);
      setCollections(rows || []);
      if (selectedId && !(rows || []).some((c) => c.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshCollections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  useEffect(() => {
    if (!siteId || !selectedId) {
      setEntries([]);
      return;
    }
    api<Entry[]>(`/presence/sites/${siteId}/collections/${selectedId}/entries`)
      .then((rows) => setEntries(rows || []))
      .catch(() => setEntries([]));
  }, [siteId, selectedId]);

  const selected = collections.find((c) => c.id === selectedId) || null;
  const listingPath = selected?.listingPath || (selected ? `/${selected.key}` : '');

  const createCollection = async () => {
    if (!canWrite || !siteId) return;
    try {
      await api(`/presence/sites/${siteId}/collections`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim() || 'Blog',
          key: (key.trim() || 'blog').toLowerCase().replace(/\s+/g, '_'),
        }),
      });
      setName('');
      setKey('');
      toastSuccess('Collection created');
      await refreshCollections();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to create collection');
    }
  };

  const createEntry = async () => {
    if (!canWrite || !siteId || !selectedId) return;
    try {
      const slug = (entrySlug.trim() || entryTitle.trim() || 'untitled')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      await api(`/presence/sites/${siteId}/collections/${selectedId}/entries`, {
        method: 'POST',
        body: JSON.stringify({
          title: entryTitle.trim() || 'Untitled',
          slug,
          status: 'published',
          dataJson: { body: '' },
        }),
      });
      setEntryTitle('');
      setEntrySlug('');
      toastSuccess('Entry published');
      const rows = await api<Entry[]>(
        `/presence/sites/${siteId}/collections/${selectedId}/entries`,
      );
      setEntries(rows || []);
      await refreshCollections();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to create entry');
    }
  };

  if (!siteId) {
    return (
      <p className="text-sm text-muted-foreground">
        Create a website first, then manage collections for that site.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card/40 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen className="size-4" />
          </div>
          <div className="min-w-0 space-y-1 text-sm">
            <div className="font-medium">What collections are for</div>
            <p className="text-xs text-muted-foreground">
              Structured CMS content (blogs, destinations, FAQs) without creating dozens of pages.
              Each collection becomes a data source{' '}
              <code className="text-[11px]">collection:key</code> for sections, plus automatic
              listing/detail routes (e.g. <code className="text-[11px]">/blog</code>,{' '}
              <code className="text-[11px]">/blog/my-post</code>).
            </p>
          </div>
        </div>
      </div>

      {sites.length > 1 ? (
        <div className="max-w-sm">
          <Label className="text-xs">Website</Label>
          <Combobox
            className="mt-1"
            value={siteId}
            onChange={(id) => onSiteChange?.(id)}
            options={sites.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="space-y-3 rounded-xl border p-3">
          <div className="text-sm font-medium">Collections</div>
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (
            <ul className="space-y-1">
              {collections.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                      selectedId === c.id ? 'bg-muted font-medium' : 'hover:bg-muted/60'
                    }`}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {c._count?.entries ?? 0}
                    </span>
                  </button>
                </li>
              ))}
              {!collections.length ? (
                <li className="px-1 py-2 text-xs text-muted-foreground">No collections yet.</li>
              ) : null}
            </ul>
          )}
          {canWrite ? (
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs">New collection</Label>
              <Input
                className="h-8"
                placeholder="Name (e.g. Blog)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                className="h-8 font-mono text-xs"
                placeholder="key (e.g. blog)"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              <Button size="sm" className="w-full" onClick={() => void createCollection()}>
                <Plus className="mr-1 size-3.5" />
                Add collection
              </Button>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 rounded-xl border p-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground">
              Select or create a collection. Then bind a section’s Data tab to{' '}
              <code className="text-xs">collection:your_key</code>, or open the listing URL on the
              published site.
            </p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{selected.name}</div>
                  <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    <div>
                      Data source:{' '}
                      <code className="text-foreground">collection:{selected.key}</code>
                    </div>
                    <div>
                      Public routes:{' '}
                      <code className="text-foreground">{listingPath}</code>
                      {' · '}
                      <code className="text-foreground">{listingPath}/:slug</code>
                    </div>
                  </div>
                </div>
                {canWrite ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await api(`/presence/sites/${siteId}/collections/${selectedId}`, {
                          method: 'DELETE',
                        });
                        setSelectedId(null);
                        await refreshCollections();
                      } catch (e) {
                        toastError(e instanceof Error ? e.message : 'Delete failed');
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </div>
              <ul className="divide-y rounded-md border">
                {entries.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{e.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {listingPath}/{e.slug}
                      </div>
                    </div>
                    <StatusBadge
                      value={e.status}
                      label={e.status}
                      tone={e.status === 'published' ? 'success' : 'neutral'}
                    />
                  </li>
                ))}
                {!entries.length ? (
                  <li className="px-3 py-4 text-xs text-muted-foreground">No entries yet.</li>
                ) : null}
              </ul>
              {canWrite ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Input
                    className="h-8"
                    placeholder="Entry title"
                    value={entryTitle}
                    onChange={(e) => setEntryTitle(e.target.value)}
                  />
                  <Input
                    className="h-8 font-mono text-xs"
                    placeholder="slug"
                    value={entrySlug}
                    onChange={(e) => setEntrySlug(e.target.value)}
                  />
                  <Button size="sm" onClick={() => void createEntry()}>
                    Publish entry
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Handshake, Network, Plus, Search, Store, UserPlus, X } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  ListPageSkeleton,
  PageSkeleton,
  StatusBadge,
  cn,
  toastError,
  toastSuccess,
  usePageChrome,
} from '@wayrune/ui';
import { api } from '../api';
import { NetworkCommercePanel } from '../components/network/NetworkCommercePanel';
import { CAP } from '../lib/capabilities';
import { reportError } from '../lib/errors';
import { usePermissions } from '../lib/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  networkQueryHasFilters,
  parseNetworkQueryState,
  patchNetworkQueryParams,
  type NetworkView,
} from '../lib/queue';
import {
  ActiveFilterChips,
  FilterMenu,
  QUEUE_PAGE_SEARCH_CLASS,
  QueuePageChrome,
  QueueViewToggle,
} from '../components/queue';

type PartnerCard = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  profile?: {
    city?: string | null;
    region?: string | null;
    bio?: string | null;
    discoverable?: boolean;
  } | null;
  relationship?: { id: string; status: string } | null;
  localSupplierId?: string | null;
};

type RelationshipRow = {
  id: string;
  status: string;
  partner: {
    id: string;
    name: string;
    slug: string;
    kind: string;
    profile?: { city?: string | null } | null;
  };
  localSupplierId?: string | null;
};

const KIND_FILTER_OPTIONS = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'homestay', label: 'Homestay' },
  { value: 'farmstay', label: 'Farmstay' },
  { value: 'car_rental', label: 'Car rental' },
  { value: 'driver', label: 'Driver' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'dmc', label: 'DMC' },
  { value: 'travel_agency', label: 'Agency' },
];

function kindLabel(kind: string) {
  return kind.replace(/_/g, ' ');
}

export function NetworkPage() {
  useDocumentTitle('Partner network');
  usePageChrome({
    title: 'Partner network',
    subtitle:
      'Discover hotels, homestays, drivers and more — follow them and use them on trip bookings. Your private Suppliers list still works offline.',
  });
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.networkWrite);
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => parseNetworkQueryState(searchParams), [searchParams]);
  const view = query.view;
  const [searchDraft, setSearchDraft] = useState(query.q ?? '');
  const [partners, setPartners] = useState<PartnerCard[]>([]);
  const [following, setFollowing] = useState<RelationshipRow[]>([]);
  const [loading, setLoading] = useState(true);

  function applyQuery(patch: Parameters<typeof patchNetworkQueryParams>[1]) {
    setSearchParams(patchNetworkQueryParams(searchParams, patch), { replace: true });
  }

  const setView = useCallback(
    (next: NetworkView) => {
      setSearchParams(patchNetworkQueryParams(searchParams, { view: next }), { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    setSearchDraft(query.q ?? '');
  }, [query.q]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = searchDraft.trim();
      if ((query.q ?? '') === next) return;
      applyQuery({ q: next || undefined });
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce draft only
  }, [searchDraft]);

  const loadDiscover = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.kind) params.set('kind', query.kind);
      const res = await api<PartnerCard[]>(`/network/partners?${params.toString()}`);
      setPartners(res);
    } catch (e) {
      reportError(e, 'Could not load network');
    } finally {
      setLoading(false);
    }
  }, [query.q, query.kind]);

  const loadFollowing = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<RelationshipRow[]>('/network/relationships');
      setFollowing(res.filter((r) => r.status !== 'blocked'));
    } catch (e) {
      reportError(e, 'Could not load following');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'discover') void loadDiscover();
    else void loadFollowing();
  }, [view, loadDiscover, loadFollowing]);

  async function follow(partnerId: string) {
    try {
      await api('/network/relationships', {
        method: 'POST',
        body: JSON.stringify({
          toOrganizationId: partnerId,
          status: 'following',
          addToMySuppliers: true,
        }),
      });
      toastSuccess('Following — added to your suppliers');
      await loadDiscover();
      if (view === 'following') await loadFollowing();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not follow');
    }
  }

  async function addSupplier(partnerId: string) {
    try {
      await api('/network/suppliers', {
        method: 'POST',
        body: JSON.stringify({ partnerOrganizationId: partnerId }),
      });
      toastSuccess('Added to my suppliers');
      if (view === 'discover') await loadDiscover();
      else await loadFollowing();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add supplier');
    }
  }

  async function unfollow(relationshipId: string) {
    try {
      await api(`/network/relationships/${relationshipId}`, { method: 'DELETE' });
      toastSuccess('Unfollowed');
      await loadFollowing();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not unfollow');
    }
  }

  async function setPreferred(relationshipId: string) {
    try {
      await api(`/network/relationships/${relationshipId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'preferred' }),
      });
      toastSuccess('Marked preferred');
      await loadFollowing();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update');
    }
  }

  function clearNetworkFilters() {
    applyQuery({ clearFilters: true });
  }

  function clearNetworkFiltersAndSearch() {
    setSearchDraft('');
    applyQuery({ clearFilters: true, q: '' });
  }

  const filterDefs =
    view === 'discover'
      ? [
          {
            id: 'kind',
            label: 'Kind',
            icon: Store,
            value: query.kind ?? null,
            options: KIND_FILTER_OPTIONS,
            onSelect: (value: string | null) => applyQuery({ kind: value || undefined }),
          },
        ]
      : [];

  const filterChips = [
    query.kind
      ? {
          id: 'kind',
          label: `Kind: ${kindLabel(query.kind)}`,
          onRemove: () => applyQuery({ kind: undefined }),
        }
      : null,
  ].filter(Boolean) as Array<{ id: string; label: string; onRemove: () => void }>;

  const queueToolbar =
    view === 'discover' ? (
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <div className="relative min-w-[12rem] flex-1 basis-[14rem]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-[0.875em] -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search name or city…"
            className={cn(QUEUE_PAGE_SEARCH_CLASS, searchDraft.trim() && 'pr-8')}
            aria-label="Search partners"
          />
          {searchDraft.trim() ? (
            <button
              type="button"
              className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
              onClick={() => {
                setSearchDraft('');
                applyQuery({ q: '' });
              }}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <FilterMenu filters={filterDefs} />
        </div>
      </div>
    ) : null;

  const hasExtraFilters = networkQueryHasFilters(query) || Boolean(query.q);

  return (
    <QueuePageChrome
      viewToggle={
        <QueueViewToggle
          value={view}
          onChange={(id) => setView(id as NetworkView)}
          options={[
            { id: 'discover', label: 'Discover', icon: <Network className="size-[0.875em]" /> },
            { id: 'following', label: 'Following', icon: <Handshake className="size-[0.875em]" /> },
            { id: 'commerce', label: 'Rates & settlements', icon: <Store className="size-[0.875em]" /> },
          ]}
        />
      }
      toolbar={queueToolbar}
      chips={
        view === 'discover' ? (
          <ActiveFilterChips chips={filterChips} onClear={networkQueryHasFilters(query) ? clearNetworkFilters : undefined} />
        ) : null
      }
    >
      {view === 'commerce' ? (
        <NetworkCommercePanel
          relationships={following.map((r) => ({
            id: r.id,
            partner: { id: r.partner.id, name: r.partner.name },
          }))}
        />
      ) : null}

      {view === 'discover' ? (
        loading ? (
          <PageSkeleton variant="cards" />
        ) : partners.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {partners.map((p) => (
              <li key={p.id}>
                <Card>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                          <StatusBadge value={p.kind} label={kindLabel(p.kind)} showIcon={false} />
                          {p.profile?.city ? <span>{p.profile.city}</span> : null}
                        </div>
                      </div>
                      {p.relationship ? (
                        <StatusBadge value={p.relationship.status} showIcon={false} />
                      ) : null}
                    </div>
                    {p.profile?.bio ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{p.profile.bio}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {canWrite && !p.relationship ? (
                        <Button size="sm" onClick={() => void follow(p.id)}>
                          <UserPlus className="size-3.5" />
                          Follow
                        </Button>
                      ) : null}
                      {!p.localSupplierId ? (
                        canWrite ? (
                          <Button size="sm" variant="secondary" onClick={() => void addSupplier(p.id)}>
                            <Plus className="size-3.5" />
                            Add to my suppliers
                          </Button>
                        ) : null
                      ) : (
                        <span className="text-xs text-muted-foreground">In your suppliers</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Network}
            title={hasExtraFilters ? 'No matching partners' : 'No discoverable partners yet'}
            description={
              hasExtraFilters
                ? 'Try clearing filters or search.'
                : 'Partners must turn on discoverability. Seed includes demo hotels for local testing.'
            }
            action={
              hasExtraFilters ? (
                <Button type="button" size="sm" variant="outline" onClick={clearNetworkFiltersAndSearch}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )
      ) : null}

      {view === 'following' ? (
        loading ? (
          <ListPageSkeleton />
        ) : following.length ? (
          <ul className="space-y-2">
            {following.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-3 glass"
              >
                <div>
                  <div className="font-medium">{r.partner.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    <StatusBadge
                      value={r.partner.kind}
                      label={kindLabel(r.partner.kind)}
                      showIcon={false}
                    />
                    <StatusBadge value={r.status} showIcon={false} />
                    {r.partner.profile?.city ? <span>{r.partner.profile.city}</span> : null}
                    {r.localSupplierId ? <span>· in suppliers</span> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {canWrite && !r.localSupplierId ? (
                    <Button size="sm" variant="secondary" onClick={() => void addSupplier(r.partner.id)}>
                      Add to suppliers
                    </Button>
                  ) : null}
                  {canWrite && r.status !== 'preferred' ? (
                    <Button size="sm" variant="secondary" onClick={() => void setPreferred(r.id)}>
                      Prefer
                    </Button>
                  ) : null}
                  {canWrite ? (
                    <Button size="sm" variant="ghost" onClick={() => void unfollow(r.id)}>
                      Unfollow
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Network}
            title="Not following anyone yet"
            description="Discover partners and follow them to attach them on Operations bookings."
          />
        )
      ) : null}
    </QueuePageChrome>
  );
}

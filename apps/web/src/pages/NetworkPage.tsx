import { useCallback, useEffect, useState } from 'react';
import { Network, Plus, UserPlus } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  ListPageShell,
  PageHeader,
  StatusBadge,
  SuggestionChips,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../api';
import { NetworkCommercePanel } from '../components/network/NetworkCommercePanel';
import { CAP } from '../lib/capabilities';
import { reportError } from '../lib/errors';
import { usePermissions } from '../lib/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

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

const KIND_FILTERS = [
  { value: '', label: 'All kinds' },
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
  useDocumentTitle('Network');
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.networkWrite);
  const [tab, setTab] = useState<'discover' | 'following' | 'commerce'>('discover');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [partners, setPartners] = useState<PartnerCard[]>([]);
  const [following, setFollowing] = useState<RelationshipRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDiscover = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (kind) params.set('kind', kind);
      const res = await api<PartnerCard[]>(`/network/partners?${params.toString()}`);
      setPartners(res);
    } catch (e) {
      reportError(e, 'Could not load network');
    } finally {
      setLoading(false);
    }
  }, [q, kind]);

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
    if (tab === 'discover') void loadDiscover();
    else void loadFollowing();
  }, [tab, loadDiscover, loadFollowing]);

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
      if (tab === 'following') await loadFollowing();
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
      if (tab === 'discover') await loadDiscover();
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

  return (
    <ListPageShell>
      <PageHeader
        icon={Network}
        title="Network"
        subtitle="Discover hotels, homestays, drivers and more — follow them and use them on trip bookings. Your private Suppliers list still works offline."
        className="mb-4 shrink-0"
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <SuggestionChips
          aria-label="Network tabs"
          allowDeselect={false}
          options={[
            { value: 'discover', label: 'Discover' },
            { value: 'following', label: 'Following' },
            { value: 'commerce', label: 'Rates & settlements' },
          ]}
          value={tab}
          onChange={(v) => setTab(v as 'discover' | 'following' | 'commerce')}
        />
      </div>

      {tab === 'commerce' ? (
        <NetworkCommercePanel
          relationships={following.map((r) => ({
            id: r.id,
            partner: { id: r.partner.id, name: r.partner.name },
          }))}
        />
      ) : null}

      {tab === 'discover' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-xs"
              placeholder="Search name or city…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void loadDiscover();
              }}
            />
            <Button variant="secondary" onClick={() => void loadDiscover()}>
              Search
            </Button>
          </div>
          <SuggestionChips
            aria-label="Partner kind"
            allowDeselect
            options={KIND_FILTERS.filter((k) => k.value)}
            value={kind}
            onChange={setKind}
          />
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading partners…</p>
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
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => void addSupplier(p.id)}
                            >
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
              title="No discoverable partners yet"
              description="Partners must turn on discoverability. Seed includes demo hotels for local testing."
            />
          )}
        </div>
      ) : null}

      {tab === 'following' ? (
        loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
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
    </ListPageShell>
  );
}

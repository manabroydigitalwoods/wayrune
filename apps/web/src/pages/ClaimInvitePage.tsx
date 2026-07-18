import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import { Button, Card, CardContent, Combobox, PageHeader, StatusBadge, toastError, toastSuccess } from '@wayrune/ui';
import { api } from '../api';
import { useAuth } from '../auth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type InvitePeek = {
  status: string;
  claimable: boolean;
  agency: { id: string; name: string; kind: string };
  supplier: { id: string; name: string; type: string; email?: string | null };
  suggestedKind?: string | null;
  email?: string | null;
};

export function ClaimInvitePage() {
  useDocumentTitle('Claim supplier invite');
  const { token } = useParams();
  const { me, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [peek, setPeek] = useState<InvitePeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [assets, setAssets] = useState<Array<{ id: string; name: string; assetKind: string }>>([]);
  const [assetId, setAssetId] = useState('');

  useEffect(() => {
    if (!token) return;
    void (async () => {
      setLoading(true);
      try {
        const res = await api<InvitePeek>(`/network/invites/${token}`);
        setPeek(res);
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Invite not found');
        setPeek(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  useEffect(() => {
    if (
      !me ||
      me.organization.kind === 'travel_agency' ||
      me.organization.kind === 'dmc' ||
      me.organization.kind === 'platform'
    ) {
      return;
    }
    void (async () => {
      try {
        const rows = await api<Array<{ id: string; name: string; assetKind: string }>>(
          '/partner-assets',
        );
        setAssets(rows);
        if (rows[0]) setAssetId(rows[0].id);
      } catch {
        setAssets([]);
      }
    })();
  }, [me]);

  async function claim() {
    if (!token) return;
    setClaiming(true);
    try {
      await api(`/network/invites/${token}/claim`, {
        method: 'POST',
        body: JSON.stringify(assetId ? { assetId } : {}),
      });
      toastSuccess('Supplier claimed — you are linked to this agency');
      navigate('/');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not claim invite');
    } finally {
      setClaiming(false);
    }
  }

  const isPartner =
    me &&
    me.organization.kind !== 'travel_agency' &&
    me.organization.kind !== 'dmc' &&
    me.organization.kind !== 'platform';

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <PageHeader
        icon={Link2}
        title="Claim supplier invite"
        subtitle="Link your partner organization to an agency’s local supplier record."
      />
      <Card>
        <CardContent className="space-y-4 p-5">
          {loading || authLoading ? (
            <p className="text-sm text-muted-foreground">Loading invite…</p>
          ) : !peek ? (
            <p className="text-sm text-muted-foreground">This invite is invalid or was revoked.</p>
          ) : (
            <>
              <div className="space-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">Agency · </span>
                  <strong>{peek.agency.name}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Supplier · </span>
                  <strong>{peek.supplier.name}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge value={peek.status} />
                  {peek.suggestedKind ? (
                    <StatusBadge value={peek.suggestedKind} label={peek.suggestedKind} />
                  ) : null}
                </div>
              </div>

              {!peek.claimable ? (
                <p className="text-sm text-muted-foreground">
                  This invite can no longer be claimed.
                </p>
              ) : !me ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Sign in with a partner organization (hotel, DMC, etc.) or register one, then
                    return to this link to claim.
                  </p>
                  <Button asChild>
                    <Link to={`/login?next=/claim/${token}`}>Sign in to claim</Link>
                  </Button>
                </div>
              ) : !isPartner ? (
                <p className="text-sm text-muted-foreground">
                  You are signed in as {me.organization.name} ({me.organization.kind}). Switch to a
                  partner organization account to claim this invite.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Claiming as <strong>{me.organization.name}</strong>. This links the agency’s
                    supplier “{peek.supplier.name}” to a property / unit in your portfolio.
                  </p>
                  {assets.length > 0 ? (
                    <div className="space-y-1.5 text-sm">
                      <span className="text-muted-foreground">Link to asset</span>
                      <Combobox
                        options={assets.map((a) => ({
                          value: a.id,
                          label: `${a.name} (${a.assetKind})`,
                        }))}
                        value={assetId || undefined}
                        onChange={setAssetId}
                        placeholder="Select asset"
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No assets yet — a default asset will be created on claim.
                    </p>
                  )}
                  <Button type="button" disabled={claiming} onClick={() => void claim()}>
                    {claiming ? 'Claiming…' : 'Claim supplier link'}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

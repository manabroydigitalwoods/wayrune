import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Building2,
  Mail,
  Phone,
  UserPlus,
} from 'lucide-react';
import {
  Breadcrumbs,
  Button,
  EmailInput,
  FormGrid,
  Input,
  PageHeader,
  PhoneInput,
  SimpleFormField as FormField,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api, type AssetRoomProductRow } from '../api';
import { Can } from '../components/Can';
import { PartnerInventoryPanel } from '../components/partner/PartnerInventoryPanel';
import { SupplierActivityRatesPanel } from '../components/agency/SupplierActivityRatesPanel';
import { SupplierContractsPanel } from '../components/agency/SupplierContractsPanel';
import { SupplierHotelRatesPanel } from '../components/agency/SupplierHotelRatesPanel';
import { SupplierTransferFaresPanel } from '../components/agency/SupplierTransferFaresPanel';
import { SupplierProfilePanel } from '../components/agency/SupplierProfilePanel';
import { PlaceSinglePicker } from '../components/places/PlacePicker';
import { CAP } from '../lib/capabilities';
import { AGENCY_ROUTES } from '../lib/agencyRoutes';
import { reportError } from '../lib/errors';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import { usePermissions } from '../lib/permissions';
import { toPlaceRef, type PlaceRef } from '../lib/placeRefs';
import {
  contactCompletenessLabel,
  isInventorySupplierType,
  isStaySupplierType,
  isTransportSupplierType,
  supplierProfileCompletenessLabel,
  supplierProfileSectionTitle,
  supplierTypeLabel,
} from '../lib/supplierTypes';

type SupplierDetail = {
  id: string;
  name: string;
  type: string;
  email?: string | null;
  phone?: string | null;
  placeId?: string | null;
  profileJson?: Record<string, unknown> | null;
  linkedOrganizationId?: string | null;
  linkedOrganization?: { id: string; name: string; kind: string } | null;
  linkedAsset?: { id: string; name: string; assetKind: string } | null;
  place?: { id: string; name: string; kind?: string; key?: string } | null;
};

type SupplierTab = 'overview' | 'profile' | 'rates' | 'contracts' | 'inventory';

function namesAlign(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function commercialRelationshipLabel(detail: SupplierDetail): string {
  if (detail.linkedOrganization) {
    return detail.linkedAsset
      ? 'Network partner — claimed property'
      : 'Network partner';
  }
  if (detail.linkedAsset) {
    return namesAlign(detail.name, detail.linkedAsset.name)
      ? 'Direct property / Self-operated'
      : 'Linked property';
  }
  if (detail.type === 'dmc') return 'Multi-service partner';
  return 'Direct commercial — no linked asset yet';
}

function verificationLabel(
  profile: Record<string, unknown> | null | undefined,
): string | null {
  const raw = profile?.verificationStatus;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const v = raw.trim().toLowerCase();
  if (v === 'verified' || v === 'approved') return 'Verified';
  if (v === 'unverified' || v === 'pending') return 'Unverified';
  return raw.trim();
}

function tabFromHash(
  hash: string,
  opts: { rates: boolean; contracts: boolean; inventory: boolean },
): SupplierTab {
  const h = hash.replace(/^#/, '').toLowerCase();
  if (h === 'profile' || h === 'property') return 'profile';
  if (
    (h === 'rates' || h === 'rate-chart' || h === 'supplier-rate-chart') &&
    opts.rates
  ) {
    return 'rates';
  }
  if ((h === 'contracts' || h === 'contract') && opts.contracts) return 'contracts';
  if ((h === 'inventory' || h === 'stock') && opts.inventory) return 'inventory';
  if (h === 'overview' || h === 'contact') return 'overview';
  return 'overview';
}

function hashForTab(tab: SupplierTab): string {
  switch (tab) {
    case 'profile':
      return '#profile';
    case 'rates':
      return '#supplier-rate-chart';
    case 'contracts':
      return '#contracts';
    case 'inventory':
      return '#inventory';
    default:
      return '#overview';
  }
}

export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { navigate } = useOrgNavigate();
  const { has, hasAny } = usePermissions();
  const canWrite = hasAny(CAP.supplierWrite);
  const canContracts = has('ops.read');
  const canNetworkWrite = hasAny(CAP.networkWrite);
  const canOpenInventory = hasAny(CAP.supplierInventory);
  const canRates = hasAny(CAP.ratesWrite) || has('quote.read');

  const [detail, setDetail] = useState<SupplierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingContact, setSavingContact] = useState(false);
  const [tab, setTab] = useState<SupplierTab>('overview');
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    place: null as PlaceRef | null,
  });
  const [activeRateCount, setActiveRateCount] = useState<number | null>(null);
  const [contractSummary, setContractSummary] = useState<{
    active: number;
    preferred: boolean;
  } | null>(null);
  const [inventoryTarget, setInventoryTarget] = useState<{
    assetId: string;
    assetKind: string;
    name: string;
  } | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryBlocked, setInventoryBlocked] = useState<string | null>(null);
  const [activeRoomProductCount, setActiveRoomProductCount] = useState(0);

  useDocumentTitle(detail?.name || 'Supplier');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await api<SupplierDetail>(`/suppliers/${id}`);
      setDetail(res);
      setContactForm({
        name: res.name,
        email: res.email || '',
        phone: res.phone || '',
        place: res.place
          ? {
              placeId: res.place.id,
              name: res.place.name,
              kind: res.place.kind,
            }
          : null,
      });
    } catch (e) {
      reportError(e, 'Could not load supplier');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const stay = detail ? isStaySupplierType(detail.type) : false;
  const activity = detail?.type === 'activity';
  const transport = detail ? isTransportSupplierType(detail.type) : false;
  const showRates = Boolean((stay || activity || transport) && canRates);
  const showContracts = canContracts;
  const showInventory = Boolean(
    detail && isInventorySupplierType(detail.type) && canOpenInventory,
  );

  useEffect(() => {
    if (!detail || loading) return;
    const next = tabFromHash(
      typeof window !== 'undefined' ? window.location.hash : '',
      { rates: showRates, contracts: showContracts, inventory: showInventory },
    );
    setTab(next);
  }, [detail?.id, loading, showRates, showContracts, showInventory]);

  useEffect(() => {
    if (!detail?.linkedAsset?.id || !isStaySupplierType(detail.type)) {
      setActiveRoomProductCount(0);
      return;
    }
    let cancelled = false;
    void api<AssetRoomProductRow[]>(
      `/inventory/assets/${detail.linkedAsset.id}/rooms`,
    )
      .then((rows) => {
        if (!cancelled) {
          setActiveRoomProductCount(rows.filter((r) => r.isActive !== false).length);
        }
      })
      .catch(() => {
        if (!cancelled) setActiveRoomProductCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [detail?.linkedAsset?.id, detail?.type]);

  useEffect(() => {
    if (!id) return;
    const supplierId = id;
    let cancelled = false;

    async function loadSectionMeta() {
      if (showRates) {
        try {
          const path = activity
            ? `/activity-rates?supplierId=${encodeURIComponent(supplierId)}`
            : transport
              ? `/transfer-fares?supplierId=${encodeURIComponent(supplierId)}`
              : `/hotel-rates?supplierId=${encodeURIComponent(supplierId)}`;
          const res = await api<{ items: Array<{ isActive?: boolean }> }>(path);
          if (!cancelled) {
            setActiveRateCount(
              (res.items || []).filter((r) => r.isActive !== false).length,
            );
          }
        } catch {
          if (!cancelled) setActiveRateCount(null);
        }
      } else if (!cancelled) {
        setActiveRateCount(null);
      }

      if (showContracts) {
        try {
          const contracts = await api<
            Array<{ status?: string; preferred?: boolean }>
          >(
            `/commerce/supplier-contracts?supplierId=${encodeURIComponent(supplierId)}`,
          );
          if (!cancelled) {
            const active = contracts.filter((c) => c.status === 'active').length;
            setContractSummary({
              active,
              preferred: contracts.some(
                (c) => c.preferred && c.status === 'active',
              ),
            });
          }
        } catch {
          if (!cancelled) setContractSummary(null);
        }
      } else if (!cancelled) {
        setContractSummary(null);
      }
    }

    void loadSectionMeta();
    return () => {
      cancelled = true;
    };
  }, [id, showRates, showContracts, activity, transport]);

  function selectTab(next: string) {
    const value = next as SupplierTab;
    setTab(value);
    if (typeof window !== 'undefined') {
      const hash = hashForTab(value);
      window.history.replaceState(null, '', `${window.location.pathname}${hash}`);
    }
  }

  async function saveContact() {
    if (!id || !contactForm.name.trim()) {
      toastError('Name is required');
      return;
    }
    if (!contactForm.email.trim() && !contactForm.phone.trim()) {
      toastError('Add a phone or email');
      return;
    }
    setSavingContact(true);
    try {
      const updated = await api<SupplierDetail>(`/suppliers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: contactForm.name.trim(),
          email: contactForm.email.trim() || null,
          phone: contactForm.phone.trim() || null,
          placeId: toPlaceRef(contactForm.place)?.placeId || null,
        }),
      });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              ...updated,
              profileJson: updated.profileJson ?? prev.profileJson,
            }
          : updated,
      );
      toastSuccess('Contact updated');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSavingContact(false);
    }
  }

  const ensureInventoryAsset = useCallback(async () => {
    if (!detail) return;
    if (detail.linkedOrganization && detail.linkedAsset) {
      setInventoryBlocked(
        `${detail.linkedOrganization.name} manages this inventory — switch to their ${detail.linkedOrganization.kind.replace(/_/g, ' ')} workspace to edit.`,
      );
      setInventoryTarget(null);
      return;
    }
    setInventoryBlocked(null);
    setInventoryLoading(true);
    try {
      let assetId = detail.linkedAsset?.id;
      let assetKind = detail.linkedAsset?.assetKind || detail.type;
      if (!assetId) {
        const asset = await api<{ id: string; assetKind: string }>(
          '/inventory/shadow-asset',
          {
            method: 'POST',
            body: JSON.stringify({ supplierId: detail.id }),
          },
        );
        assetId = asset.id;
        assetKind = asset.assetKind;
        await load();
      }
      setInventoryTarget({
        assetId,
        assetKind,
        name: detail.linkedAsset?.name || detail.name,
      });
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not open inventory');
      setInventoryTarget(null);
    } finally {
      setInventoryLoading(false);
    }
  }, [detail, load]);

  useEffect(() => {
    if (tab !== 'inventory' || !showInventory || !detail) return;
    void ensureInventoryAsset();
  }, [tab, showInventory, detail, ensureInventoryAsset]);

  async function inviteSupplier() {
    if (!detail) return;
    try {
      const res = await api<{ claimPath: string }>(
        `/network/suppliers/${detail.id}/invites`,
        {
          method: 'POST',
          body: JSON.stringify({ email: detail.email || undefined }),
        },
      );
      const url = `${window.location.origin}${res.claimPath}`;
      await navigator.clipboard.writeText(url);
      toastSuccess('Invite link copied — send it to the supplier to claim');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create invite');
    }
  }

  const contactStatus = useMemo(
    () =>
      contactCompletenessLabel({
        name: contactForm.name || detail?.name,
        email: contactForm.email || detail?.email,
        phone: contactForm.phone || detail?.phone,
      }),
    [contactForm, detail?.name, detail?.email, detail?.phone],
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading supplier…</p>;
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Supplier not found.</p>
        <Button variant="outline" onClick={() => navigate(AGENCY_ROUTES.suppliers)}>
          Back to suppliers
        </Button>
      </div>
    );
  }

  const verified = verificationLabel(detail.profileJson);
  const profileStatus = supplierProfileCompletenessLabel(
    detail.type,
    detail.profileJson,
    isStaySupplierType(detail.type)
      ? { roomProductCount: activeRoomProductCount }
      : undefined,
  );
  const rateStatus =
    activeRateCount == null
      ? undefined
      : activeRateCount === 0
        ? 'No rates'
        : `${activeRateCount} active`;
  const contractStatus =
    contractSummary == null
      ? undefined
      : contractSummary.active === 0
        ? 'None active'
        : `${contractSummary.active} active`;

  const statusChips = [
    supplierTypeLabel(detail.type),
    detail.linkedOrganization ? 'Network' : 'Local',
    detail.linkedOrganization ? 'Claimed' : 'Unclaimed',
    'Active',
    verified,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[
          { label: 'Suppliers', onClick: () => navigate(AGENCY_ROUTES.suppliers) },
          { label: detail.name },
        ]}
      />
      <PageHeader
        icon={Building2}
        title={detail.name}
        subtitle={statusChips.join(' · ')}
        actions={
          !detail.linkedOrganization && canNetworkWrite ? (
            <Button size="sm" variant="outline" onClick={() => void inviteSupplier()}>
              <UserPlus className="size-4" />
              Invite to claim
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <StatusBadge
          value={detail.type}
          label={supplierTypeLabel(detail.type)}
          showIcon={false}
        />
        {detail.linkedOrganization ? (
          <StatusBadge value="network" label="Network" showIcon={false} />
        ) : (
          <StatusBadge value="local" label="Local" showIcon={false} />
        )}
        {contractSummary?.preferred ? (
          <span title="From active preferred contract">
            <StatusBadge value="preferred" label="Preferred" showIcon={false} />
          </span>
        ) : null}
        {detail.email ? (
          <span className="inline-flex items-center gap-1.5">
            <Mail className="size-3.5" />
            {detail.email}
          </span>
        ) : null}
        {detail.phone ? (
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <Phone className="size-3.5" />
            {detail.phone}
          </span>
        ) : null}
        {detail.place?.name ? <span>Near {detail.place.name}</span> : null}
      </div>

      <Tabs value={tab} onValueChange={selectTab} className="space-y-4">
        <TabsList className="h-auto flex-wrap gap-1">
          <TabsTrigger value="overview" className="gap-1.5">
            Overview
            <span className="text-[10px] font-normal opacity-70">{contactStatus}</span>
          </TabsTrigger>
          <TabsTrigger value="profile" className="gap-1.5">
            {supplierProfileSectionTitle(detail.type).replace(/ profile$/i, '')}
            <span className="text-[10px] font-normal opacity-70">{profileStatus}</span>
          </TabsTrigger>
          {showRates ? (
            <TabsTrigger value="rates" className="gap-1.5">
              Rates
              {rateStatus ? (
                <span className="text-[10px] font-normal opacity-70">{rateStatus}</span>
              ) : null}
            </TabsTrigger>
          ) : null}
          {showContracts ? (
            <TabsTrigger value="contracts" className="gap-1.5">
              Contracts
              {contractStatus ? (
                <span className="text-[10px] font-normal opacity-70">{contractStatus}</span>
              ) : null}
            </TabsTrigger>
          ) : null}
          {showInventory ? (
            <TabsTrigger value="inventory">Rooms & allotments</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-4">
          <section className="rounded-xl border border-border/60 bg-muted/15 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Commercial relationship
              </p>
              <p className="text-xs text-muted-foreground">
                {commercialRelationshipLabel(detail)}
              </p>
            </div>
            <dl className="mt-2 grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Supplier</dt>
                <dd className="mt-0.5 text-sm font-medium">{detail.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Linked asset</dt>
                <dd className="mt-0.5 text-sm font-medium">
                  {detail.linkedAsset?.name || 'None yet'}
                  {detail.linkedAsset?.assetKind ? (
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {detail.linkedAsset.assetKind.replace(/_/g, ' ')}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Claimed by</dt>
                <dd className="mt-0.5 text-sm font-medium">
                  {detail.linkedOrganization?.name || 'Unclaimed (local)'}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-border/60 px-4 py-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Contact</h2>
                <p className="text-xs text-muted-foreground">
                  Phone or email required. Near place improves discovery.
                </p>
              </div>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {contactStatus}
              </span>
            </div>
            <FormGrid>
              <FormField label="Name" required>
                <Input
                  value={contactForm.name}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setContactForm({ ...contactForm, name: e.target.value })
                  }
                />
              </FormField>
              <FormField label="Type">
                <Input value={supplierTypeLabel(detail.type)} disabled />
              </FormField>
              <FormField label="Email">
                <EmailInput
                  value={contactForm.email}
                  disabled={!canWrite}
                  onChange={(email) => setContactForm({ ...contactForm, email })}
                />
              </FormField>
              <FormField label="Phone">
                <PhoneInput
                  value={contactForm.phone}
                  disabled={!canWrite}
                  onChange={(phone) => setContactForm({ ...contactForm, phone })}
                />
              </FormField>
            </FormGrid>
            <div className="mt-3">
              <PlaceSinglePicker
                label="Near place (recommended)"
                value={contactForm.place}
                onChange={(place) => {
                  if (!canWrite) return;
                  setContactForm({ ...contactForm, place });
                }}
              />
            </div>
            <Can anyOf={CAP.supplierWrite}>
              <Button
                type="button"
                size="sm"
                className="mt-3"
                disabled={savingContact}
                onClick={() => void saveContact()}
              >
                {savingContact ? 'Saving…' : 'Save contact'}
              </Button>
            </Can>
          </section>
        </TabsContent>

        <TabsContent value="profile" className="mt-0">
            <SupplierProfilePanel
              supplierId={detail.id}
              supplierName={detail.name}
              supplierType={detail.type}
              initialProfile={detail.profileJson}
              linkedAssetId={detail.linkedAsset?.id}
              layout="split"
              onSaved={(profileJson) =>
                setDetail((prev) => (prev ? { ...prev, profileJson } : prev))
              }
            />
        </TabsContent>

        {showRates ? (
          <TabsContent value="rates" className="mt-0" id="supplier-rate-chart">
            {activity ? (
              <SupplierActivityRatesPanel
                supplierId={detail.id}
                supplierName={detail.name}
                defaultPlace={
                  detail.place
                    ? {
                        placeId: detail.place.id,
                        name: detail.place.name,
                        kind: detail.place.kind,
                      }
                    : null
                }
              />
            ) : transport ? (
              <SupplierTransferFaresPanel
                supplierId={detail.id}
                supplierName={detail.name}
                defaultPlace={
                  detail.place
                    ? {
                        placeId: detail.place.id,
                        name: detail.place.name,
                        kind: detail.place.kind,
                      }
                    : null
                }
              />
            ) : (
              <SupplierHotelRatesPanel
                supplierId={detail.id}
                supplierName={detail.name}
                linkedAssetId={detail.linkedAsset?.id}
              />
            )}
          </TabsContent>
        ) : null}

        {showContracts ? (
          <TabsContent value="contracts" className="mt-0">
            <SupplierContractsPanel
              supplierId={detail.id}
              supplierName={detail.name}
              linkedAssetId={detail.linkedAsset?.id}
            />
          </TabsContent>
        ) : null}

        {showInventory ? (
          <TabsContent value="inventory" className="mt-0 space-y-3">
            {inventoryBlocked ? (
              <p className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                {inventoryBlocked}
              </p>
            ) : inventoryLoading ? (
              <p className="text-sm text-muted-foreground">Loading inventory…</p>
            ) : inventoryTarget ? (
              <PartnerInventoryPanel
                assetId={inventoryTarget.assetId}
                assetKind={inventoryTarget.assetKind}
                assetName={inventoryTarget.name}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No inventory asset linked yet.
              </p>
            )}
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

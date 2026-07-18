import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  FormGrid,
  Input,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { isPermissionError, reportError } from '../../lib/errors';

type CareHistory = {
  party?: { id: string; displayName: string; phone?: string | null } | null;
  matchedParties: Array<{ id: string; displayName: string; phone?: string | null }>;
  stays: Array<{
    id: string;
    guestName: string;
    status: string;
    checkIn: string;
    checkOut: string;
    asset?: { name: string } | null;
    roomProduct?: { name: string } | null;
  }>;
  meals: Array<{
    id: string;
    guestName: string;
    status: string;
    serviceAt: string;
    asset?: { name: string } | null;
    mealPackage?: { name: string } | null;
  }>;
  mealInquiries: Array<{
    id: string;
    contactName: string;
    status: string;
    guestCount: number;
    createdAt: string;
  }>;
  rentals: Array<{
    id: string;
    guestName: string;
    status: string;
    startAt: string;
    endAt: string;
    fleetUnit?: { name: string; plateNumber?: string | null } | null;
  }>;
  driverJobs: Array<{
    id: string;
    guestName: string;
    status: string;
    startAt: string;
    pickupLocation?: string | null;
    dropLocation?: string | null;
  }>;
  experiences?: Array<{
    id: string;
    bookerName: string;
    status: string;
    guestCount: number;
    asset?: { name: string } | null;
    experienceProduct?: { title: string } | null;
    experienceSlot?: { startAt: string } | null;
    participants?: Array<{ fullName: string }>;
  }>;
  relatedIncidents?: Array<{
    id: string;
    title: string;
    category: string;
    severity: string;
    status: string;
    travellerImpact?: string | null;
    trip?: { tripNumber: string; title: string } | null;
  }>;
  counts: {
    stays: number;
    meals: number;
    mealInquiries: number;
    rentals: number;
    driverJobs: number;
    experiences?: number;
    relatedIncidents?: number;
  };
};

type CareIncident = {
  id: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  description?: string | null;
  travellerImpact?: string | null;
  trip?: { tripNumber: string; title: string } | null;
  supplier?: { name: string } | null;
};

type CareRating = {
  id: string;
  score: number;
  note?: string | null;
  direction: 'given' | 'received';
  fromOrganization?: { name: string } | null;
  targetOrganization?: { name: string } | null;
  createdAt: string;
};

type CareBoard = {
  openIncidents: CareIncident[];
  ratings: CareRating[];
  counts: { openIncidents: number; ratings: number };
};

const INCIDENT_CATEGORIES = [
  { value: 'driver_late', label: 'Driver late' },
  { value: 'room_unavailable', label: 'Room unavailable' },
  { value: 'meal_issue', label: 'Meal issue' },
  { value: 'vehicle_breakdown', label: 'Vehicle breakdown' },
  { value: 'supplier_no_show', label: 'Supplier no-show' },
  { value: 'traveller_emergency', label: 'Traveller emergency' },
  { value: 'other', label: 'Other' },
];

const SEVERITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

function labelFor(options: Array<{ value: string; label: string }>, value: string) {
  return options.find((o) => o.value === value)?.label || value;
}

export function CareHistoryPanel({
  initialPartyId,
  initialPhone,
  initialName,
  compact,
}: {
  initialPartyId?: string;
  initialPhone?: string;
  initialName?: string;
  /** Narrow layout for driver phone — still shows report form. */
  compact?: boolean;
}) {
  const [partyId, setPartyId] = useState(initialPartyId || '');
  const [guestPhone, setGuestPhone] = useState(initialPhone || '');
  const [guestName, setGuestName] = useState(initialName || '');
  const [data, setData] = useState<CareHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [board, setBoard] = useState<CareBoard | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [boardLoading, setBoardLoading] = useState(false);
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentImpact, setIncidentImpact] = useState('');
  const [category, setCategory] = useState('other');
  const [severity, setSeverity] = useState('medium');
  const [savingIncident, setSavingIncident] = useState(false);

  const loadBoard = useCallback(async () => {
    setBoardLoading(true);
    setBoardError(null);
    try {
      const res = await api<CareBoard>('/commerce/care/board');
      setBoard(res);
    } catch (e) {
      setBoard(null);
      if (!isPermissionError(e)) {
        setBoardError(e instanceof Error ? e.message : 'Could not load care board');
      }
      reportError(e, 'Could not load care board');
    } finally {
      setBoardLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  async function lookup(overrides?: {
    partyId?: string;
    guestPhone?: string;
    guestName?: string;
  }) {
    const pid = (overrides?.partyId ?? partyId).trim();
    const phone = (overrides?.guestPhone ?? guestPhone).trim();
    const name = (overrides?.guestName ?? guestName).trim();
    if (!pid && !phone && !name) {
      toastError('Enter a phone, name, or party id');
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // Party-scoped: send partyId only so history is precise
      if (pid) {
        params.set('partyId', pid);
      } else {
        if (phone) params.set('guestPhone', phone);
        if (name) params.set('guestName', name);
      }
      const res = await api<CareHistory>(`/commerce/care/history?${params}`);
      setData(res);
      const impactHint =
        res.party?.displayName ||
        name ||
        phone ||
        res.stays[0]?.guestName ||
        res.meals[0]?.guestName ||
        '';
      if (impactHint && !incidentImpact.trim()) {
        setIncidentImpact(impactHint);
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Lookup failed');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialPartyId) {
      void lookup({ partyId: initialPartyId, guestPhone: '', guestName: '' });
    } else if (initialPhone || initialName) {
      void lookup({
        partyId: '',
        guestPhone: initialPhone,
        guestName: initialName,
      });
    }
    // Intentionally once per mount / key change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPartyId, initialPhone, initialName]);

  async function reportIncident() {
    if (!incidentTitle.trim()) {
      toastError('Enter an incident title');
      return;
    }
    setSavingIncident(true);
    try {
      const impact =
        incidentImpact.trim() ||
        data?.party?.displayName ||
        guestName.trim() ||
        guestPhone.trim() ||
        undefined;
      await api('/commerce/incidents', {
        method: 'POST',
        body: JSON.stringify({
          title: incidentTitle.trim(),
          category,
          severity,
          travellerImpact: impact,
        }),
      });
      toastSuccess('Incident reported');
      setIncidentTitle('');
      await loadBoard();
      if (data) void lookup();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not report incident');
    } finally {
      setSavingIncident(false);
    }
  }

  async function resolveIncident(id: string) {
    try {
      await api(`/commerce/incidents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'resolved' }),
      });
      toastSuccess('Incident resolved');
      await loadBoard();
      if (data) void lookup();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not resolve incident');
    }
  }

  const total =
    (data?.counts.stays || 0) +
    (data?.counts.meals || 0) +
    (data?.counts.rentals || 0) +
    (data?.counts.driverJobs || 0) +
    (data?.counts.mealInquiries || 0) +
    (data?.counts.experiences || 0) +
    (data?.counts.relatedIncidents || 0);

  return (
    <div className={`space-y-4 ${compact ? 'mx-auto max-w-lg' : ''}`}>
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium">Incidents & ratings</h3>
              <p className="text-xs text-muted-foreground">
                Open service incidents and recent partner ratings for this org.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 sm:min-h-0"
              disabled={boardLoading}
              onClick={() => void loadBoard()}
            >
              {boardLoading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>

          <div className="space-y-3 border-t border-border/60 pt-3">
            <FormField label="Category">
              <SuggestionChips
                aria-label="Incident category"
                allowDeselect={false}
                options={INCIDENT_CATEGORIES}
                value={category}
                onChange={setCategory}
              />
            </FormField>
            <FormField label="Severity">
              <SuggestionChips
                aria-label="Severity"
                allowDeselect={false}
                options={SEVERITIES}
                value={severity}
                onChange={setSeverity}
              />
            </FormField>
            <FormGrid>
              <FormField label="Title">
                <Input
                  className="min-h-11 text-base sm:min-h-0 sm:text-sm"
                  value={incidentTitle}
                  onChange={(e) => setIncidentTitle(e.target.value)}
                  placeholder="What happened"
                />
              </FormField>
              <FormField label="Guest impact (optional)">
                <Input
                  className="min-h-11 text-base sm:min-h-0 sm:text-sm"
                  value={incidentImpact}
                  onChange={(e) => setIncidentImpact(e.target.value)}
                  placeholder="Guest name or impact note"
                />
              </FormField>
            </FormGrid>
            <Button
              type="button"
              size="sm"
              className="min-h-11 w-full sm:min-h-0 sm:w-auto"
              disabled={savingIncident}
              onClick={() => void reportIncident()}
            >
              {savingIncident ? 'Reporting…' : 'Report incident'}
            </Button>
          </div>

          {boardError ? (
            <p className="text-sm text-destructive">{boardError}</p>
          ) : (
            <>
              <div className="space-y-2">
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Open incidents ({board?.counts.openIncidents ?? 0})
                </h4>
                <ul className="space-y-2">
                  {(board?.openIncidents || []).map((i) => (
                    <li
                      key={i.id}
                      className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">{i.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {labelFor(INCIDENT_CATEGORIES, i.category)} · {i.severity}
                          {i.trip ? ` · ${i.trip.tripNumber}` : ''}
                          {i.travellerImpact ? ` · ${i.travellerImpact}` : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <StatusBadge value={i.status} />
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="min-h-11 sm:min-h-0"
                          onClick={() => void resolveIncident(i.id)}
                        >
                          Resolve
                        </Button>
                      </div>
                    </li>
                  ))}
                  {!boardLoading && !board?.openIncidents?.length ? (
                    <li className="text-sm text-muted-foreground">No open incidents.</li>
                  ) : null}
                </ul>
              </div>

              <div className="space-y-2 border-t border-border/60 pt-3">
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Partner ratings ({board?.counts.ratings ?? 0})
                </h4>
                <ul className="space-y-2">
                  {(board?.ratings || []).slice(0, compact ? 5 : 15).map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">
                          {r.direction === 'given'
                            ? r.targetOrganization?.name || 'Partner'
                            : r.fromOrganization?.name || 'Partner'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {r.direction === 'given' ? 'Given' : 'Received'}
                          {r.note ? ` · ${r.note}` : ''}
                        </div>
                      </div>
                      <StatusBadge
                        value="confirmed"
                        label={`${r.score} / 5`}
                        showIcon={false}
                        tone="success"
                      />
                    </li>
                  ))}
                  {!boardLoading && !board?.ratings?.length ? (
                    <li className="text-sm text-muted-foreground">
                      No ratings yet. Rate partners from Network.
                    </li>
                  ) : null}
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <h3 className="text-sm font-medium">Guest history</h3>
            <p className="text-xs text-muted-foreground">
              Look up stays, meals, experiences, rentals, driver jobs, and related incidents.
              Party id search is scoped to that client only.
            </p>
          </div>
          <FormGrid>
            <FormField label="Phone">
              <Input
                className="min-h-11 text-base sm:min-h-0 sm:text-sm"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                placeholder="+91…"
                inputMode="tel"
              />
            </FormField>
            <FormField label="Guest name">
              <Input
                className="min-h-11 text-base sm:min-h-0 sm:text-sm"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Name contains…"
              />
            </FormField>
            {!initialPartyId ? (
              <FormField label="Party id (optional)">
                <Input
                  className="min-h-11 text-base sm:min-h-0 sm:text-sm"
                  value={partyId}
                  onChange={(e) => setPartyId(e.target.value)}
                  placeholder="cuid…"
                />
              </FormField>
            ) : null}
          </FormGrid>
          <Button
            type="button"
            disabled={loading}
            onClick={() => void lookup()}
            className="min-h-11 w-full sm:min-h-0 sm:w-auto"
          >
            {loading ? 'Looking up…' : 'Look up'}
          </Button>
        </CardContent>
      </Card>

      {data ? (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="text-sm">
              <strong>{total}</strong> related record{total === 1 ? '' : 's'}
              {data.party ? (
                <span className="text-muted-foreground">
                  {' '}
                  · linked Party: {data.party.displayName}
                </span>
              ) : null}
            </div>

            {total === 0 ? (
              <p className="text-sm text-muted-foreground">
                No stays, meals, experiences, rentals, or jobs matched this guest.
              </p>
            ) : null}

            {data.matchedParties.length > 1 ? (
              <div className="space-y-1">
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Matched parties
                </h4>
                <ul className="space-y-1 text-sm">
                  {data.matchedParties.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="min-h-11 text-primary underline sm:min-h-0"
                        onClick={() => {
                          setPartyId(p.id);
                          setGuestPhone('');
                          setGuestName('');
                          void lookup({ partyId: p.id, guestPhone: '', guestName: '' });
                        }}
                      >
                        {p.displayName}
                      </button>
                      {p.phone ? (
                        <span className="text-muted-foreground"> · {p.phone}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <HistorySection
              title="Related incidents"
              empty={!data.relatedIncidents?.length}
              items={(data.relatedIncidents || []).map((r) => ({
                id: r.id,
                title: r.title,
                meta: `${labelFor(INCIDENT_CATEGORIES, r.category)} · ${r.severity}${
                  r.trip ? ` · ${r.trip.tripNumber}` : ''
                }${r.travellerImpact ? ` · ${r.travellerImpact}` : ''}`,
                status: r.status,
              }))}
            />
            <HistorySection
              title="Stays"
              empty={!data.stays.length}
              items={data.stays.map((r) => ({
                id: r.id,
                title: r.guestName,
                meta: `${r.asset?.name || 'Property'}${
                  r.roomProduct ? ` · ${r.roomProduct.name}` : ''
                } · ${new Date(r.checkIn).toLocaleDateString()} → ${new Date(
                  r.checkOut,
                ).toLocaleDateString()}`,
                status: r.status,
              }))}
            />
            <HistorySection
              title="Meals"
              empty={!data.meals.length}
              items={data.meals.map((r) => ({
                id: r.id,
                title: r.guestName,
                meta: `${r.mealPackage?.name || r.asset?.name || 'Meal'} · ${new Date(
                  r.serviceAt,
                ).toLocaleString()}`,
                status: r.status,
              }))}
            />
            <HistorySection
              title="Meal inquiries"
              empty={!data.mealInquiries.length}
              items={data.mealInquiries.map((r) => ({
                id: r.id,
                title: r.contactName,
                meta: `${r.guestCount} guests · ${new Date(r.createdAt).toLocaleDateString()}`,
                status: r.status,
              }))}
            />
            <HistorySection
              title="Experiences"
              empty={!data.experiences?.length}
              items={(data.experiences || []).map((r) => ({
                id: r.id,
                title: r.bookerName,
                meta: `${r.experienceProduct?.title || r.asset?.name || 'Experience'} · ${
                  r.guestCount
                } guests${
                  r.experienceSlot?.startAt
                    ? ` · ${new Date(r.experienceSlot.startAt).toLocaleString()}`
                    : ''
                }`,
                status: r.status,
              }))}
            />
            <HistorySection
              title="Rentals"
              empty={!data.rentals.length}
              items={data.rentals.map((r) => ({
                id: r.id,
                title: r.guestName,
                meta: `${r.fleetUnit?.name || 'Vehicle'}${
                  r.fleetUnit?.plateNumber ? ` (${r.fleetUnit.plateNumber})` : ''
                } · ${new Date(r.startAt).toLocaleDateString()}`,
                status: r.status,
              }))}
            />
            <HistorySection
              title="Driver jobs"
              empty={!data.driverJobs.length}
              items={data.driverJobs.map((r) => ({
                id: r.id,
                title: r.guestName,
                meta: `${r.pickupLocation || 'Pickup'} → ${r.dropLocation || 'Drop'} · ${new Date(
                  r.startAt,
                ).toLocaleString()}`,
                status: r.status,
              }))}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function HistorySection({
  title,
  empty,
  items,
}: {
  title: string;
  empty: boolean;
  items: Array<{ id: string; title: string; meta: string; status: string }>;
}) {
  if (empty) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <ul className="space-y-2">
        {items.map((it) => (
          <li
            key={it.id}
            className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 py-2 text-sm"
          >
            <div>
              <div className="font-medium">{it.title}</div>
              <div className="text-xs text-muted-foreground">{it.meta}</div>
            </div>
            <StatusBadge value={it.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

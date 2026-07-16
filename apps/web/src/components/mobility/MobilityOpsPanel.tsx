import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Combobox,
  DatePicker,
  FormGrid,
  Input,
  PriceField,
  SimpleFormField as FormField,
  StatusBadge,
  TimePicker,
  formatCurrency,
  toastError,
  toastSuccess,
} from '@travel/ui';
import { api } from '../../api';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { usePermissions } from '../../lib/permissions';
import {
  formatDateInput,
  parseDateInput,
  patchDateTimeLocal,
  splitDateTimeLocal,
} from '../../lib/dateInput';
import { CareHistoryPanel } from '../care/CareHistoryPanel';
import { PartnerInventoryPanel } from '../partner/PartnerInventoryPanel';
import type { MobilityTabId } from './MobilityPortalLayout';

type FleetUnit = {
  id: string;
  name: string;
  plateNumber?: string | null;
  available?: boolean;
};

type FleetRate = {
  id: string;
  name: string;
  amountPerDay: number | string;
  depositAmount: number | string;
  currency: string;
};

type RentalReservation = {
  id: string;
  guestName: string;
  guestPhone?: string | null;
  startAt: string;
  endAt: string;
  status: string;
  rateAmount?: number | string | null;
  depositAmount?: number | string | null;
  depositPaid?: number | string | null;
  amountPaid?: number | string | null;
  currency: string;
  damageNote?: string | null;
  fleetUnit?: { id: string; name: string; plateNumber?: string | null } | null;
  fleetRate?: { id: string; name: string } | null;
};

type Folio = {
  rental: number;
  charges: number;
  depositAmount: number;
  depositPaid: number;
  paid: number;
  outstanding: number;
  depositOutstanding: number;
  currency: string;
  reservation: RentalReservation;
};

function toIso(local: string) {
  if (!local) return '';
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? local : d.toISOString();
}

export function MobilityOpsPanel({
  assetId,
  orgKind,
  tab,
}: {
  assetId: string;
  orgKind?: string | null;
  tab: MobilityTabId;
}) {
  const [rates, setRates] = useState<FleetRate[]>([]);
  const [units, setUnits] = useState<FleetUnit[]>([]);
  const [reservations, setReservations] = useState<RentalReservation[]>([]);
  const [selectedResId, setSelectedResId] = useState('');
  const [folio, setFolio] = useState<Folio | null>(null);

  const [rateName, setRateName] = useState('Daily');
  const [amountPerDay, setAmountPerDay] = useState('2500');
  const [depositAmount, setDepositAmount] = useState('5000');

  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [fleetUnitId, setFleetUnitId] = useState('');
  const [fleetRateId, setFleetRateId] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [confirmNow, setConfirmNow] = useState(true);

  const [damageNote, setDamageNote] = useState('');
  const [damageAmount, setDamageAmount] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payToward, setPayToward] = useState<'deposit' | 'charges'>('deposit');

  const { hasAny } = usePermissions();
  const canCreateReservation = hasAny([...CAP.reservationCreate]);
  const canConfirm = hasAny([...CAP.reservationConfirm]);
  const canOpsWrite = hasAny([...CAP.opsWrite]);
  const canFinance = hasAny([...CAP.partnerFinanceWrite]);
  const canRates = hasAny([...CAP.mobilityRatesWrite]);

  const load = useCallback(async () => {
    try {
      const [r, fleet, res] = await Promise.all([
        api<FleetRate[]>(`/mobility/assets/${assetId}/rates`),
        api<FleetUnit[]>(`/inventory/assets/${assetId}/fleet`),
        api<RentalReservation[]>(`/mobility/assets/${assetId}/reservations`),
      ]);
      setRates(r);
      setUnits(fleet);
      setReservations(res);
      if (!fleetRateId && r[0]) setFleetRateId(r[0].id);
      if (!fleetUnitId && fleet[0]) setFleetUnitId(fleet[0].id);
      if (!selectedResId && res[0]) setSelectedResId(res[0].id);
    } catch (e) {
      reportError(e, 'Could not load fleet data');
    }
  }, [assetId, fleetRateId, fleetUnitId, selectedResId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedResId || (tab !== 'bill' && tab !== 'ops' && tab !== 'book')) {
      return;
    }
    api<Folio>(`/mobility/reservations/${selectedResId}/folio`)
      .then(setFolio)
      .catch(() => setFolio(null));
  }, [selectedResId, tab]);

  async function saveRate() {
    try {
      await api('/mobility/rates', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          name: rateName,
          amountPerDay: Number(amountPerDay),
          depositAmount: Number(depositAmount),
        }),
      });
      toastSuccess('Rate saved');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  async function createReservation() {
    try {
      await api('/mobility/reservations', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          fleetUnitId,
          fleetRateId: fleetRateId || undefined,
          guestName,
          guestPhone: guestPhone || undefined,
          startAt: toIso(startAt),
          endAt: toIso(endAt),
          confirmImmediately: confirmNow,
        }),
      });
      toastSuccess(confirmNow ? 'Rental confirmed' : 'Rental held');
      setGuestName('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Create failed');
    }
  }

  async function postRes(id: string, action: 'confirm' | 'cancel' | 'checkout' | 'return') {
    try {
      const body =
        action === 'return'
          ? {
              damageNote: damageNote || undefined,
              damageAmount: damageAmount ? Number(damageAmount) : undefined,
            }
          : action === 'checkout'
            ? {}
            : undefined;
      await api(`/mobility/reservations/${id}/${action === 'return' ? 'return' : action}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      toastSuccess(
        action === 'confirm'
          ? 'Confirmed'
          : action === 'cancel'
            ? 'Cancelled'
            : action === 'checkout'
              ? 'Checked out'
              : 'Returned',
      );
      setDamageNote('');
      setDamageAmount('');
      await load();
      if (selectedResId === id) {
        const f = await api<Folio>(`/mobility/reservations/${id}/folio`);
        setFolio(f);
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Action failed');
    }
  }

  async function issueDoc(kind: 'deposit-invoice' | 'invoice') {
    if (!selectedResId) return;
    try {
      await api(`/mobility/reservations/${selectedResId}/${kind}`, { method: 'POST' });
      toastSuccess(kind === 'deposit-invoice' ? 'Deposit invoice issued' : 'Final invoice issued');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Document failed');
    }
  }

  async function recordPay() {
    if (!selectedResId) return;
    try {
      await api(`/mobility/reservations/${selectedResId}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(payAmount),
          toward: payToward,
          method: 'cash',
        }),
      });
      toastSuccess('Payment recorded');
      setPayAmount('');
      const f = await api<Folio>(`/mobility/reservations/${selectedResId}/folio`);
      setFolio(f);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Payment failed');
    }
  }

  if (tab === 'fleet') {
    return (
      <PartnerInventoryPanel assetId={assetId} assetKind="vehicle" orgKind={orgKind} />
    );
  }

  if (tab === 'rates') {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {canRates ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-medium">New daily rate</h3>
            <FormGrid>
              <FormField label="Name">
                <Input value={rateName} onChange={(e) => setRateName(e.target.value)} />
              </FormField>
              <FormField label="Amount / day">
                <PriceField value={amountPerDay} onChange={setAmountPerDay} />
              </FormField>
              <FormField label="Deposit">
                <PriceField value={depositAmount} onChange={setDepositAmount} />
              </FormField>
            </FormGrid>
            <Button type="button" onClick={() => void saveRate()}>
              Save rate
            </Button>
          </CardContent>
        </Card>
        ) : null}
        <Card>
          <CardContent className="space-y-2 p-4">
            <h3 className="text-sm font-medium">Rates</h3>
            <ul className="space-y-2 text-sm">
              {rates.map((r) => (
                <li key={r.id} className="flex justify-between gap-2 border-b border-border/60 py-2">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted-foreground">
                    {formatCurrency(Number(r.amountPerDay), r.currency)}/day · deposit{' '}
                    {formatCurrency(Number(r.depositAmount), r.currency)}
                  </span>
                </li>
              ))}
              {!rates.length ? (
                <p className="text-muted-foreground">No rates yet — add a daily rate to book.</p>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tab === 'ops') {
    const active = reservations.filter((r) =>
      ['confirmed', 'checked_out'].includes(r.status),
    );
    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-medium">Checkout / return</h3>
          <p className="text-xs text-muted-foreground">
            Confirm pickup checklist on checkout; note damage and optional charge on return.
          </p>
          {active.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 py-3 text-sm"
            >
              <div>
                <div className="font-medium">{r.guestName}</div>
                <div className="text-xs text-muted-foreground">
                  {r.fleetUnit?.name}
                  {r.fleetUnit?.plateNumber ? ` · ${r.fleetUnit.plateNumber}` : ''} ·{' '}
                  {new Date(r.startAt).toLocaleString()} → {new Date(r.endAt).toLocaleString()}
                </div>
                <div className="mt-1">
                  <StatusBadge value={r.status} />
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {canOpsWrite && r.status === 'confirmed' ? (
                  <Button size="sm" onClick={() => void postRes(r.id, 'checkout')}>
                    Checkout
                  </Button>
                ) : null}
                {canOpsWrite && r.status === 'checked_out' ? (
                  <>
                    <Input
                      className="min-w-[10rem]"
                      placeholder="Damage note"
                      value={selectedResId === r.id ? damageNote : ''}
                      onChange={(e) => {
                        setSelectedResId(r.id);
                        setDamageNote(e.target.value);
                      }}
                    />
                    <PriceField
                      value={selectedResId === r.id ? damageAmount : ''}
                      onChange={(v) => {
                        setSelectedResId(r.id);
                        setDamageAmount(v);
                      }}
                    />
                    <Button size="sm" onClick={() => void postRes(r.id, 'return')}>
                      Return
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
          {!active.length ? (
            <p className="text-sm text-muted-foreground">
              No confirmed or out vehicles. Book a rental first.
            </p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (tab === 'care') {
    return <CareHistoryPanel />;
  }

  if (tab === 'bill') {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-2 p-4">
            <h3 className="text-sm font-medium">Select rental</h3>
            <Combobox
              options={reservations.map((r) => ({
                value: r.id,
                label: `${r.guestName} — ${r.status}`,
              }))}
              value={selectedResId}
              onChange={setSelectedResId}
              placeholder="Select rental"
            />
            {folio ? (
              <div className="space-y-1 text-sm">
                <div>Rental: {formatCurrency(folio.rental, folio.currency)}</div>
                <div>Extra charges: {formatCurrency(folio.charges, folio.currency)}</div>
                <div>
                  Deposit: {formatCurrency(folio.depositPaid, folio.currency)} /{' '}
                  {formatCurrency(folio.depositAmount, folio.currency)}
                </div>
                <div>Paid (charges): {formatCurrency(folio.paid, folio.currency)}</div>
                <div className="font-medium">
                  Outstanding: {formatCurrency(folio.outstanding, folio.currency)}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-medium">Payments & documents</h3>
            <FormField label="Amount">
              <PriceField value={payAmount} onChange={setPayAmount} />
            </FormField>
            <FormField label="Toward">
              <Combobox
                options={[
                  { value: 'deposit', label: 'Deposit' },
                  { value: 'charges', label: 'Charges' },
                ]}
                value={payToward}
                onChange={(v) => setPayToward(v as 'deposit' | 'charges')}
              />
            </FormField>
            <div className="flex flex-wrap gap-2">
              {canFinance ? (
              <Button type="button" onClick={() => void recordPay()}>
                Record payment
              </Button>
              ) : null}
              {canFinance ? (
              <Button type="button" variant="outline" onClick={() => void issueDoc('deposit-invoice')}>
                Deposit invoice
              </Button>
              ) : null}
              {canFinance ? (
              <Button type="button" variant="outline" onClick={() => void issueDoc('invoice')}>
                Final invoice
              </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // book (default)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {canCreateReservation ? (
      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-medium">New rental</h3>
          <FormGrid>
            <FormField label="Guest">
              <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} />
            </FormField>
            <FormField label="Phone">
              <Input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
            </FormField>
            <FormField label="Vehicle">
              <Combobox
                options={[
                  { value: '', label: '—' },
                  ...units.map((u) => ({
                    value: u.id,
                    label: u.plateNumber ? `${u.name} (${u.plateNumber})` : u.name,
                  })),
                ]}
                value={fleetUnitId}
                onChange={setFleetUnitId}
                placeholder="Select vehicle"
              />
            </FormField>
            <FormField label="Rate">
              <Combobox
                options={[
                  { value: '', label: '— custom / none —' },
                  ...rates.map((r) => ({
                    value: r.id,
                    label: `${r.name} (${formatCurrency(Number(r.amountPerDay), r.currency)}/day)`,
                  })),
                ]}
                value={fleetRateId}
                onChange={setFleetRateId}
                placeholder="Select rate"
              />
            </FormField>
            <FormField label="Start date">
              <DatePicker
                value={parseDateInput(splitDateTimeLocal(startAt).date)}
                onChange={(d) =>
                  setStartAt((v) =>
                    patchDateTimeLocal(v, { date: formatDateInput(d) }),
                  )
                }
              />
            </FormField>
            <FormField label="Start time">
              <TimePicker
                value={splitDateTimeLocal(startAt).time || undefined}
                onChange={(time) =>
                  setStartAt((v) =>
                    patchDateTimeLocal(v, { time: time || '00:00' }),
                  )
                }
              />
            </FormField>
            <FormField label="End date">
              <DatePicker
                value={parseDateInput(splitDateTimeLocal(endAt).date)}
                onChange={(d) =>
                  setEndAt((v) =>
                    patchDateTimeLocal(v, { date: formatDateInput(d) }),
                  )
                }
              />
            </FormField>
            <FormField label="End time">
              <TimePicker
                value={splitDateTimeLocal(endAt).time || undefined}
                onChange={(time) =>
                  setEndAt((v) =>
                    patchDateTimeLocal(v, { time: time || '00:00' }),
                  )
                }
              />
            </FormField>
          </FormGrid>
          <div className="flex items-center gap-2">
            <Checkbox
              id="mobility-confirm-now"
              checked={confirmNow}
              onCheckedChange={(checked) => setConfirmNow(checked === true)}
            />
            <label htmlFor="mobility-confirm-now" className="cursor-pointer text-sm">
              Confirm immediately (hold → booked calendar)
            </label>
          </div>
          <Button type="button" onClick={() => void createReservation()}>
            Create rental
          </Button>
        </CardContent>
      </Card>
      ) : null}
      <Card>
        <CardContent className="space-y-2 p-4">
          <h3 className="text-sm font-medium">Rentals</h3>
          {reservations.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 text-sm"
            >
              <button type="button" className="text-left" onClick={() => setSelectedResId(r.id)}>
                <div className="font-medium">{r.guestName}</div>
                <div className="text-muted-foreground">
                  {r.fleetUnit?.name} · {new Date(r.startAt).toLocaleDateString()} →{' '}
                  {new Date(r.endAt).toLocaleDateString()}
                </div>
              </button>
              <div className="flex flex-wrap gap-1">
                <StatusBadge value={r.status} />
                {canConfirm && r.status === 'held' ? (
                  <Button size="sm" onClick={() => void postRes(r.id, 'confirm')}>
                    Confirm
                  </Button>
                ) : null}
                {canOpsWrite && (r.status === 'held' || r.status === 'confirmed') ? (
                  <Button size="sm" variant="outline" onClick={() => void postRes(r.id, 'cancel')}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {!reservations.length ? (
            <p className="text-sm text-muted-foreground">No rentals yet.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
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
  toastError,
  toastSuccess,
  formatCurrency,
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
import type { RestaurantTabId } from './RestaurantPortalLayout';
import { MealKitchenBoard } from './MealKitchenBoard';

type MealPackage = {
  id: string;
  name: string;
  mealType: string;
  pricePerPerson: number | string;
  currency: string;
};

type MealReservation = {
  id: string;
  guestName: string;
  guestCount: number;
  serviceAt: string;
  status: string;
  preparationStatus: string;
  rateAmount?: number | string | null;
  amountPaid?: number | string | null;
  currency: string;
  mealPackage?: { name: string } | null;
  partyId?: string | null;
  dietaryJson?: Record<string, number> | null;
};

type MealInquiry = {
  id: string;
  contactName: string;
  guestCount: number;
  status: string;
  quotedAmount?: number | string | null;
  currency: string;
  preferredServiceAt?: string | null;
  mealPackage?: { id: string; name: string } | null;
};

type DiningCapacity = {
  id: string;
  serviceDate: string;
  slotStart: string;
  slotEnd: string;
  totalCapacity: number;
  reserved: number;
  held: number;
  zone?: string | null;
};

type Folio = {
  charges: number;
  paid: number;
  outstanding: number;
  currency: string;
  reservation: MealReservation;
};

export function RestaurantOpsPanel({
  assetId,
  tab,
}: {
  assetId: string;
  tab: RestaurantTabId;
}) {
  const [packages, setPackages] = useState<MealPackage[]>([]);
  const [kitchen, setKitchen] = useState<MealReservation[]>([]);
  const [reservations, setReservations] = useState<MealReservation[]>([]);
  const [inquiries, setInquiries] = useState<MealInquiry[]>([]);
  const [capacities, setCapacities] = useState<DiningCapacity[]>([]);
  const [selectedResId, setSelectedResId] = useState('');
  const [folio, setFolio] = useState<Folio | null>(null);

  const [pkgName, setPkgName] = useState('');
  const [mealType, setMealType] = useState('lunch');
  const [price, setPrice] = useState('450');

  const [contactName, setContactName] = useState('');
  const [guestCount, setGuestCount] = useState('25');
  const [preferredAt, setPreferredAt] = useState('');
  const [inquiryPackageId, setInquiryPackageId] = useState('');

  const [guestName, setGuestName] = useState('');
  const [serviceAt, setServiceAt] = useState('');
  const [packageId, setPackageId] = useState('');
  const [capacityId, setCapacityId] = useState('');
  const [confirmNow, setConfirmNow] = useState(true);

  const [serviceDate, setServiceDate] = useState('');
  const [slotStart, setSlotStart] = useState('');
  const [slotEnd, setSlotEnd] = useState('');
  const [totalCapacity, setTotalCapacity] = useState('40');
  const [payAmount, setPayAmount] = useState('');

  const { hasAny } = usePermissions();
  const canCreateReservation = hasAny([...CAP.reservationCreate]);
  const canConfirm = hasAny([...CAP.reservationConfirm]);
  const canOpsWrite = hasAny([...CAP.opsWrite]);
  const canFinance = hasAny([...CAP.partnerFinanceWrite]);
  const canMealPackage = hasAny([...CAP.mealPackageWrite]);
  const canInventory = hasAny([...CAP.inventoryManage]);

  const load = useCallback(async () => {
    try {
      const [pkgs, board, caps, inqs, res] = await Promise.all([
        api<MealPackage[]>(`/commerce/assets/${assetId}/meal-packages`),
        api<MealReservation[]>(`/restaurant/assets/${assetId}/kitchen-board`),
        api<DiningCapacity[]>(`/commerce/assets/${assetId}/dining-capacities`),
        api<MealInquiry[]>(`/restaurant/assets/${assetId}/inquiries`),
        api<MealReservation[]>(`/restaurant/assets/${assetId}/reservations`),
      ]);
      setPackages(pkgs);
      setKitchen(board);
      setCapacities(caps);
      setInquiries(inqs);
      setReservations(res);
      if (!packageId && pkgs[0]) setPackageId(pkgs[0].id);
      if (!inquiryPackageId && pkgs[0]) setInquiryPackageId(pkgs[0].id);
      if (!selectedResId && res[0]) setSelectedResId(res[0].id);
    } catch (e) {
      reportError(e, 'Could not load restaurant data');
    }
  }, [assetId, packageId, inquiryPackageId, selectedResId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedResId || (tab !== 'bill' && tab !== 'reserve')) return;
    api<Folio>(`/restaurant/reservations/${selectedResId}/folio`)
      .then(setFolio)
      .catch(() => setFolio(null));
  }, [selectedResId, tab]);

  async function savePackage() {
    try {
      await api('/commerce/meal-packages', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          name: pkgName,
          mealType,
          pricePerPerson: Number(price),
          minGuests: 10,
          maxGuests: 80,
        }),
      });
      toastSuccess('Meal package saved');
      setPkgName('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  async function saveCapacity() {
    try {
      await api('/commerce/dining-capacities', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          serviceDate,
          slotStart: `${serviceDate}T${slotStart}:00.000Z`,
          slotEnd: `${serviceDate}T${slotEnd}:00.000Z`,
          totalCapacity: Number(totalCapacity),
        }),
      });
      toastSuccess('Capacity slot saved');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  async function createInquiry() {
    try {
      await api('/restaurant/inquiries', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          contactName,
          guestCount: Number(guestCount),
          preferredServiceAt: preferredAt || undefined,
          mealPackageId: inquiryPackageId || undefined,
        }),
      });
      toastSuccess('Inquiry created');
      setContactName('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Create failed');
    }
  }

  async function quoteInquiry(id: string) {
    try {
      await api(`/restaurant/inquiries/${id}/quote`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      toastSuccess('Quoted');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Quote failed');
    }
  }

  async function convertInquiry(id: string) {
    const at = preferredAt || serviceAt || new Date().toISOString();
    try {
      await api(`/restaurant/inquiries/${id}/convert`, {
        method: 'POST',
        body: JSON.stringify({
          serviceAt: at,
          diningCapacityId: capacityId || undefined,
          confirmImmediately: true,
        }),
      });
      toastSuccess('Converted to reservation');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Convert failed');
    }
  }

  async function createReservation() {
    try {
      await api('/restaurant/reservations', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          guestName,
          guestCount: Number(guestCount),
          serviceAt,
          mealPackageId: packageId || undefined,
          diningCapacityId: capacityId || undefined,
          confirmImmediately: confirmNow,
        }),
      });
      toastSuccess(confirmNow ? 'Reservation confirmed' : 'Reservation requested');
      setGuestName('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Create failed');
    }
  }

  async function postRes(id: string, action: string) {
    try {
      await api(`/restaurant/reservations/${id}/${action}`, { method: 'POST', body: '{}' });
      toastSuccess(action);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Action failed');
    }
  }

  async function recordPay() {
    if (!selectedResId) return;
    try {
      await api(`/restaurant/reservations/${selectedResId}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(payAmount) }),
      });
      toastSuccess('Payment recorded');
      setPayAmount('');
      const f = await api<Folio>(`/restaurant/reservations/${selectedResId}/folio`);
      setFolio(f);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Payment failed');
    }
  }

  async function completeSelected(force?: boolean) {
    if (!selectedResId) return;
    try {
      await api(
        `/restaurant/reservations/${selectedResId}/complete${force ? '?force=1' : ''}`,
        { method: 'POST', body: '{}' },
      );
      toastSuccess('Completed');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Complete blocked');
    }
  }

  if (tab === 'inquiry') {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {canCreateReservation ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-medium">New group / event inquiry</h3>
            <FormGrid>
              <FormField label="Contact name">
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </FormField>
              <FormField label="Guest count">
                <Input value={guestCount} onChange={(e) => setGuestCount(e.target.value)} />
              </FormField>
              <FormField label="Preferred date">
                <DatePicker
                  value={parseDateInput(splitDateTimeLocal(preferredAt).date)}
                  onChange={(d) =>
                    setPreferredAt((v) =>
                      patchDateTimeLocal(v, { date: formatDateInput(d) }),
                    )
                  }
                />
              </FormField>
              <FormField label="Preferred time">
                <TimePicker
                  value={splitDateTimeLocal(preferredAt).time || undefined}
                  onChange={(time) =>
                    setPreferredAt((v) =>
                      patchDateTimeLocal(v, { time: time || '00:00' }),
                    )
                  }
                />
              </FormField>
              <FormField label="Package">
                <Combobox
                  options={[
                    { value: '', label: '—' },
                    ...packages.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  value={inquiryPackageId}
                  onChange={setInquiryPackageId}
                  placeholder="Select package"
                />
              </FormField>
            </FormGrid>
            <Button type="button" onClick={() => void createInquiry()}>
              <Plus className="mr-1 h-4 w-4" /> Create inquiry
            </Button>
          </CardContent>
        </Card>
        ) : null}
        <Card>
          <CardContent className="space-y-2 p-4">
            <h3 className="text-sm font-medium">Open inquiries</h3>
            {inquiries.map((inq) => (
              <div
                key={inq.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{inq.contactName}</div>
                  <div className="text-muted-foreground">
                    {inq.guestCount} guests · {inq.mealPackage?.name || 'No package'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge value={inq.status} />
                  {canOpsWrite && inq.status === 'open' ? (
                    <Button size="sm" variant="outline" onClick={() => void quoteInquiry(inq.id)}>
                      Quote
                    </Button>
                  ) : null}
                  {canCreateReservation && (inq.status === 'quoted' || inq.status === 'open') ? (
                    <Button size="sm" onClick={() => void convertInquiry(inq.id)}>
                      Convert
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            {!inquiries.length ? (
              <p className="text-sm text-muted-foreground">No inquiries yet.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tab === 'kitchen') {
    return <MealKitchenBoard kitchen={kitchen} onChanged={load} />;
  }

  if (tab === 'bill') {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-2 p-4">
            <h3 className="text-sm font-medium">Select reservation</h3>
            <Combobox
              options={reservations.map((r) => ({
                value: r.id,
                label: `${r.guestName} — ${r.status}`,
              }))}
              value={selectedResId}
              onChange={setSelectedResId}
              placeholder="Select reservation"
            />
            {folio ? (
              <div className="space-y-1 text-sm">
                <div>Charges: {formatCurrency(folio.charges, folio.currency)}</div>
                <div>Paid: {formatCurrency(folio.paid, folio.currency)}</div>
                <div className="font-medium">
                  Outstanding: {formatCurrency(folio.outstanding, folio.currency)}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-medium">Record payment</h3>
            <PriceField value={payAmount} onChange={setPayAmount} />
            <div className="flex flex-wrap gap-2">
              {canFinance ? (
              <Button type="button" onClick={() => void recordPay()}>
                Record payment
              </Button>
              ) : null}
              {canOpsWrite ? (
              <Button type="button" variant="outline" onClick={() => void completeSelected(false)}>
                Complete
              </Button>
              ) : null}
              {canOpsWrite ? (
              <Button type="button" variant="ghost" onClick={() => void completeSelected(true)}>
                Force complete
              </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tab === 'care') {
    return <CareHistoryPanel />;
  }

  if (tab === 'catalog') {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-medium">Meal packages</h3>
            {canMealPackage ? (
              <>
            <FormGrid>
              <FormField label="Name">
                <Input value={pkgName} onChange={(e) => setPkgName(e.target.value)} />
              </FormField>
              <FormField label="Type">
                <Input value={mealType} onChange={(e) => setMealType(e.target.value)} />
              </FormField>
              <FormField label="Price / person">
                <PriceField value={price} onChange={setPrice} />
              </FormField>
            </FormGrid>
            <Button type="button" onClick={() => void savePackage()}>
              Save package
            </Button>
              </>
            ) : null}
            <ul className="space-y-1 text-sm">
              {packages.map((p) => (
                <li key={p.id}>
                  {p.name} — {formatCurrency(Number(p.pricePerPerson), p.currency)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-medium">Dining capacity</h3>
            {canInventory ? (
              <>
            <FormGrid>
              <FormField label="Date">
                <DatePicker
                  value={parseDateInput(serviceDate)}
                  onChange={(d) => setServiceDate(formatDateInput(d))}
                />
              </FormField>
              <FormField label="Slot start">
                <TimePicker value={slotStart || undefined} onChange={setSlotStart} />
              </FormField>
              <FormField label="Slot end">
                <TimePicker value={slotEnd || undefined} onChange={setSlotEnd} />
              </FormField>
              <FormField label="Total capacity">
                <Input value={totalCapacity} onChange={(e) => setTotalCapacity(e.target.value)} />
              </FormField>
            </FormGrid>
            <Button type="button" onClick={() => void saveCapacity()}>
              Save slot
            </Button>
              </>
            ) : null}
            <ul className="space-y-1 text-sm">
              {capacities.map((c) => (
                <li key={c.id}>
                  {c.serviceDate.slice(0, 10)} · {c.totalCapacity} (held {c.held}, reserved{' '}
                  {c.reserved})
                  <button
                    type="button"
                    className="ml-2 text-xs underline"
                    onClick={() => setCapacityId(c.id)}
                  >
                    use
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }

  // reserve (default)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {canCreateReservation ? (
      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-medium">New reservation</h3>
          <FormGrid>
            <FormField label="Guest / group">
              <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} />
            </FormField>
            <FormField label="Guest count">
              <Input value={guestCount} onChange={(e) => setGuestCount(e.target.value)} />
            </FormField>
            <FormField label="Service date">
              <DatePicker
                value={parseDateInput(splitDateTimeLocal(serviceAt).date)}
                onChange={(d) =>
                  setServiceAt((v) =>
                    patchDateTimeLocal(v, { date: formatDateInput(d) }),
                  )
                }
              />
            </FormField>
            <FormField label="Service time">
              <TimePicker
                value={splitDateTimeLocal(serviceAt).time || undefined}
                onChange={(time) =>
                  setServiceAt((v) =>
                    patchDateTimeLocal(v, { time: time || '00:00' }),
                  )
                }
              />
            </FormField>
            <FormField label="Package">
              <Combobox
                options={[
                  { value: '', label: '—' },
                  ...packages.map((p) => ({ value: p.id, label: p.name })),
                ]}
                value={packageId}
                onChange={setPackageId}
                placeholder="Select package"
              />
            </FormField>
            <FormField label="Capacity slot">
              <Combobox
                options={[
                  { value: '', label: '— none —' },
                  ...capacities.map((c) => ({
                    value: c.id,
                    label: `${c.serviceDate.slice(0, 10)} (${c.totalCapacity - c.reserved - c.held} left)`,
                  })),
                ]}
                value={capacityId}
                onChange={setCapacityId}
                placeholder="Select slot"
              />
            </FormField>
          </FormGrid>
          <div className="flex items-center gap-2">
            <Checkbox
              id="restaurant-confirm-now"
              checked={confirmNow}
              onCheckedChange={(checked) => setConfirmNow(checked === true)}
            />
            <label htmlFor="restaurant-confirm-now" className="cursor-pointer text-sm">
              Confirm immediately (hold → consume capacity)
            </label>
          </div>
          <Button type="button" onClick={() => void createReservation()}>
            Create reservation
          </Button>
        </CardContent>
      </Card>
      ) : null}
      <Card>
        <CardContent className="space-y-2 p-4">
          <h3 className="text-sm font-medium">Reservations</h3>
          {reservations.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 text-sm"
            >
              <button
                type="button"
                className="text-left"
                onClick={() => setSelectedResId(r.id)}
              >
                <div className="font-medium">{r.guestName}</div>
                <div className="text-muted-foreground">
                  {new Date(r.serviceAt).toLocaleString()}
                </div>
              </button>
              <div className="flex flex-wrap gap-1">
                <StatusBadge value={r.status} />
                {canConfirm &&
                (r.status === 'requested' || r.status === 'held' || r.status === 'tentative') ? (
                  <Button size="sm" onClick={() => void postRes(r.id, 'confirm')}>
                    Confirm
                  </Button>
                ) : null}
                {canOpsWrite ? (
                <Button size="sm" variant="outline" onClick={() => void postRes(r.id, 'cancel')}>
                  Cancel
                </Button>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

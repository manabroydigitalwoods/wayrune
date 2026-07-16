import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
  formatCurrency,
  toastError,
  toastSuccess,
} from '@travel/ui';
import { api } from '../../api';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { usePermissions } from '../../lib/permissions';

type RoomProduct = { id: string; name: string; isActive?: boolean };
type RatePlan = {
  id: string;
  name: string;
  amount: string | number;
  currency: string;
  startDate?: string | null;
  endDate?: string | null;
  roomProduct: { id: string; name: string };
};

type HomestayAttrs = {
  inventoryMode?: 'entire_home' | 'private_room';
  hostPresent?: boolean;
  houseRules?: string;
  requireRulesAck?: boolean;
  mealCutoffHours?: number | null;
  flexibleCheckIn?: boolean;
};

type PartnerAssetProfile = {
  profileJson?: { homestay?: HomestayAttrs } | null;
};

export function StayRatesPanel({ assetId }: { assetId: string }) {
  const [rooms, setRooms] = useState<RoomProduct[]>([]);
  const [rates, setRates] = useState<RatePlan[]>([]);
  const [form, setForm] = useState({
    roomProductId: '',
    name: 'BAR',
    amount: '',
    startDate: '',
    endDate: '',
  });
  const [homestayForm, setHomestayForm] = useState<{
    inventoryMode: 'entire_home' | 'private_room';
    hostPresent: boolean;
    houseRules: string;
    requireRulesAck: boolean;
    mealCutoffHours: string;
    flexibleCheckIn: boolean;
  }>({
    inventoryMode: 'entire_home',
    hostPresent: false,
    houseRules: '',
    requireRulesAck: false,
    mealCutoffHours: '',
    flexibleCheckIn: false,
  });
  const [savingHomestay, setSavingHomestay] = useState(false);
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.partnerInventoryWrite);

  const load = useCallback(async () => {
    try {
      const [r, plans, asset] = await Promise.all([
        api<RoomProduct[]>(`/inventory/assets/${assetId}/rooms`),
        api<RatePlan[]>(`/stay/assets/${assetId}/rates`),
        api<PartnerAssetProfile>(`/partner-assets/${assetId}`).catch(() => null),
      ]);
      setRooms(r.filter((p) => p.isActive !== false));
      setRates(plans);
      setForm((f) => ({
        ...f,
        roomProductId:
          f.roomProductId || r.find((p) => p.isActive !== false)?.id || '',
      }));
      const homestay = asset?.profileJson?.homestay;
      if (homestay) {
        setHomestayForm({
          inventoryMode: homestay.inventoryMode || 'entire_home',
          hostPresent: Boolean(homestay.hostPresent),
          houseRules: homestay.houseRules || '',
          requireRulesAck: Boolean(homestay.requireRulesAck),
          mealCutoffHours:
            homestay.mealCutoffHours != null ? String(homestay.mealCutoffHours) : '',
          flexibleCheckIn: Boolean(homestay.flexibleCheckIn),
        });
      }
    } catch (e) {
      reportError(e, 'Could not load rates');
    }
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveHomestayAttrs() {
    setSavingHomestay(true);
    try {
      await api(`/stay/assets/${assetId}/homestay-attrs`, {
        method: 'PATCH',
        body: JSON.stringify({
          inventoryMode: homestayForm.inventoryMode,
          hostPresent: homestayForm.hostPresent,
          houseRules: homestayForm.houseRules,
          requireRulesAck: homestayForm.requireRulesAck,
          mealCutoffHours:
            homestayForm.mealCutoffHours === '' ? null : Number(homestayForm.mealCutoffHours),
          flexibleCheckIn: homestayForm.flexibleCheckIn,
        }),
      });
      toastSuccess('Homestay attributes saved');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save homestay attributes');
    } finally {
      setSavingHomestay(false);
    }
  }

  async function addRate() {
    if (!form.roomProductId || !form.name.trim() || form.amount === '') {
      toastError('Product, name, and amount are required');
      return;
    }
    try {
      await api('/stay/rates', {
        method: 'POST',
        body: JSON.stringify({
          roomProductId: form.roomProductId,
          name: form.name.trim(),
          amount: Number(form.amount),
          startDate: form.startDate || null,
          endDate: form.endDate || null,
        }),
      });
      setForm((f) => ({ ...f, name: 'BAR', amount: '', startDate: '', endDate: '' }));
      toastSuccess('Rate plan added');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add rate');
    }
  }

  async function removeRate(id: string) {
    try {
      await api(`/stay/rates/${id}`, { method: 'DELETE' });
      toastSuccess('Rate plan removed');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not remove rate');
    }
  }

  const roomOptions = rooms.map((r) => ({ value: r.id, label: r.name }));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <strong className="text-sm">Rate plans</strong>
            <p className="text-xs text-muted-foreground">
              Simple BAR / seasonal prices. Default amount can be picked into new
              reservations.
            </p>
          </div>
          {canWrite ? (
            <>
              <FormGrid>
                <FormField label="Room product">
                  <Combobox
                    options={roomOptions}
                    value={form.roomProductId || undefined}
                    onChange={(roomProductId) => setForm((f) => ({ ...f, roomProductId }))}
                    placeholder="Select product"
                  />
                </FormField>
                <FormField label="Name">
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </FormField>
                <FormField label="Amount">
                  <PriceField
                    value={form.amount}
                    onChange={(amount) => setForm((f) => ({ ...f, amount }))}
                    placeholder="0"
                  />
                </FormField>
                <FormField label="From">
                  <DatePicker
                    value={parseDateInput(form.startDate)}
                    onChange={(d) =>
                      setForm((f) => ({ ...f, startDate: formatDateInput(d) }))
                    }
                    placeholder="Optional start"
                  />
                </FormField>
                <FormField label="To">
                  <DatePicker
                    value={parseDateInput(form.endDate)}
                    onChange={(d) => setForm((f) => ({ ...f, endDate: formatDateInput(d) }))}
                    placeholder="Optional end"
                  />
                </FormField>
              </FormGrid>
              <Button type="button" size="sm" onClick={() => void addRate()}>
                <Plus className="size-4" />
                Add rate plan
              </Button>
            </>
          ) : null}

          <ul className="space-y-2">
            {rates.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm glass-row"
              >
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.roomProduct.name} ·{' '}
                    {formatCurrency(r.amount, {
                      currency: r.currency,
                      maximumFractionDigits: 0,
                    })}
                    {r.startDate || r.endDate
                      ? ` · ${(r.startDate || '…').toString().slice(0, 10)} → ${(r.endDate || '…').toString().slice(0, 10)}`
                      : ''}
                  </div>
                </div>
                {canWrite ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void removeRate(r.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </li>
            ))}
            {!rates.length ? (
              <li className="text-sm text-muted-foreground">No rate plans yet.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <strong className="text-sm">Homestay attributes</strong>
            <p className="text-xs text-muted-foreground">
              Independent OS settings for homestay-style properties — inventory mode, host
              presence, and meal / check-in flexibility.
            </p>
          </div>
          <FormGrid>
            <FormField label="Inventory mode">
              <Combobox
                options={[
                  { value: 'entire_home', label: 'Entire home' },
                  { value: 'private_room', label: 'Private room' },
                ]}
                value={homestayForm.inventoryMode}
                onChange={(v) =>
                  setHomestayForm((f) => ({
                    ...f,
                    inventoryMode: v as 'entire_home' | 'private_room',
                  }))
                }
              />
            </FormField>
            <FormField label="Meal cutoff (hours)">
              <Input
                type="number"
                value={homestayForm.mealCutoffHours}
                onChange={(e) =>
                  setHomestayForm((f) => ({ ...f, mealCutoffHours: e.target.value }))
                }
                placeholder="e.g. 12"
              />
            </FormField>
          </FormGrid>
          <FormGrid>
            <FormField label="Host presence">
              <div className="flex h-9 items-center gap-2">
                <Checkbox
                  id="homestay-host-present"
                  checked={homestayForm.hostPresent}
                  onCheckedChange={(checked) =>
                    setHomestayForm((f) => ({ ...f, hostPresent: checked === true }))
                  }
                />
                <label htmlFor="homestay-host-present" className="cursor-pointer text-sm">
                  Host lives on-site
                </label>
              </div>
            </FormField>
            <FormField label="Flexible check-in">
              <div className="flex h-9 items-center gap-2">
                <Checkbox
                  id="homestay-flexible-checkin"
                  checked={homestayForm.flexibleCheckIn}
                  onCheckedChange={(checked) =>
                    setHomestayForm((f) => ({ ...f, flexibleCheckIn: checked === true }))
                  }
                />
                <label htmlFor="homestay-flexible-checkin" className="cursor-pointer text-sm">
                  Allow flexible check-in time
                </label>
              </div>
            </FormField>
          </FormGrid>
          <FormField label="House rules">
            <Input
              value={homestayForm.houseRules}
              onChange={(e) => setHomestayForm((f) => ({ ...f, houseRules: e.target.value }))}
              placeholder="Quiet hours, shoes off, etc."
            />
          </FormField>
          <FormField label="Require rules ack at check-in">
            <div className="flex h-9 items-center gap-2">
              <Checkbox
                id="homestay-rules-ack"
                checked={homestayForm.requireRulesAck}
                onCheckedChange={(checked) =>
                  setHomestayForm((f) => ({ ...f, requireRulesAck: checked === true }))
                }
              />
              <label htmlFor="homestay-rules-ack" className="cursor-pointer text-sm">
                Block check-in until guest acknowledges
              </label>
            </div>
          </FormField>
          {canWrite ? (
            <Button
              type="button"
              size="sm"
              disabled={savingHomestay}
              onClick={() => void saveHomestayAttrs()}
            >
              {savingHomestay ? 'Saving…' : 'Save homestay attributes'}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Plus, Wrench } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Combobox,
  DatePicker,
  FormGrid,
  Input,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { usePermissions } from '../../lib/permissions';

type MaintenanceOrder = {
  id: string;
  title: string;
  status: string;
  blockInventory?: boolean;
  category?: string | null;
  vendorName?: string | null;
  downtimeFrom?: string | null;
  downtimeTo?: string | null;
  recurring?: boolean;
  roomUnit?: { name: string } | null;
};

type RoomUnit = {
  id: string;
  name: string;
};

const emptyForm = {
  title: '',
  roomUnitId: '',
  blockInventory: true,
  category: '',
  vendorName: '',
  downtimeFrom: '',
  downtimeTo: '',
  recurring: false,
};

type EditForm = {
  status: string;
  category: string;
  vendorName: string;
  downtimeFrom: string;
  downtimeTo: string;
  recurring: boolean;
};

export function StayMaintenancePanel({ assetId }: { assetId: string }) {
  const [orders, setOrders] = useState<MaintenanceOrder[]>([]);
  const [units, setUnits] = useState<RoomUnit[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editTarget, setEditTarget] = useState<MaintenanceOrder | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    status: 'open',
    category: '',
    vendorName: '',
    downtimeFrom: '',
    downtimeTo: '',
    recurring: false,
  });
  const [saving, setSaving] = useState(false);
  const { hasAny } = usePermissions();
  const canCreate = hasAny(['ops.write', 'inventory.manage']);
  const canManage = hasAny(CAP.opsWrite);

  const load = useCallback(async () => {
    try {
      const [orderRows, unitRows] = await Promise.all([
        api<MaintenanceOrder[]>(`/commerce/assets/${assetId}/maintenance`),
        api<RoomUnit[]>(`/stay/assets/${assetId}/units`),
      ]);
      setOrders(orderRows);
      setUnits(unitRows);
    } catch (e) {
      reportError(e, 'Could not load maintenance');
    }
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!form.title.trim()) {
      toastError('Enter a title');
      return;
    }
    try {
      await api('/commerce/maintenance', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          title: form.title.trim(),
          roomUnitId: form.roomUnitId || undefined,
          blockInventory: form.blockInventory,
          category: form.category.trim() || undefined,
          vendorName: form.vendorName.trim() || undefined,
          downtimeFrom: form.downtimeFrom || undefined,
          downtimeTo: form.downtimeTo || undefined,
          recurring: form.recurring,
        }),
      });
      toastSuccess('Work order created');
      setForm(emptyForm);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create work order');
    }
  }

  async function resolve(id: string) {
    try {
      await api(`/commerce/maintenance/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'resolved' }),
      });
      toastSuccess('Work order resolved');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not resolve work order');
    }
  }

  function openEdit(order: MaintenanceOrder) {
    setEditTarget(order);
    setEditForm({
      status: order.status,
      category: order.category || '',
      vendorName: order.vendorName || '',
      downtimeFrom: order.downtimeFrom ? order.downtimeFrom.slice(0, 10) : '',
      downtimeTo: order.downtimeTo ? order.downtimeTo.slice(0, 10) : '',
      recurring: Boolean(order.recurring),
    });
  }

  async function saveEdit() {
    if (!editTarget) return;
    setSaving(true);
    try {
      await api(`/commerce/maintenance/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: editForm.status,
          category: editForm.category.trim() || null,
          vendorName: editForm.vendorName.trim() || null,
          downtimeFrom: editForm.downtimeFrom || null,
          downtimeTo: editForm.downtimeTo || null,
          recurring: editForm.recurring,
        }),
      });
      toastSuccess('Work order updated');
      setEditTarget(null);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update work order');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wrench className="size-5 text-primary" />
        <div>
          <h2 className="text-sm font-semibold">Maintenance</h2>
          <p className="text-xs text-muted-foreground">
            Track work orders and optionally block inventory while open.
          </p>
        </div>
      </div>
      {canCreate ? (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <FormField label="Title">
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="AC repair — room 204"
              />
            </FormField>
            <FormGrid>
              <FormField label="Room unit (optional)">
                <Combobox
                  options={[
                    { value: '', label: 'Whole property' },
                    ...units.map((u) => ({ value: u.id, label: u.name })),
                  ]}
                  value={form.roomUnitId}
                  onChange={(roomUnitId) => setForm((f) => ({ ...f, roomUnitId }))}
                  placeholder="Whole property"
                />
              </FormField>
              <FormField label="Block inventory">
                <div className="flex h-9 items-center gap-2">
                  <Checkbox
                    id="maint-block-inventory"
                    checked={form.blockInventory}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({ ...f, blockInventory: checked === true }))
                    }
                  />
                  <label htmlFor="maint-block-inventory" className="cursor-pointer text-sm">
                    Hold unit until resolved
                  </label>
                </div>
              </FormField>
            </FormGrid>
            <FormGrid>
              <FormField label="Category">
                <Input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="Electrical, plumbing…"
                />
              </FormField>
              <FormField label="Vendor">
                <Input
                  value={form.vendorName}
                  onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))}
                  placeholder="Vendor / contractor name"
                />
              </FormField>
            </FormGrid>
            <FormGrid>
              <FormField label="Downtime from">
                <DatePicker
                  value={parseDateInput(form.downtimeFrom)}
                  onChange={(d) =>
                    setForm((f) => ({ ...f, downtimeFrom: formatDateInput(d) }))
                  }
                  placeholder="Optional"
                />
              </FormField>
              <FormField label="Downtime to">
                <DatePicker
                  value={parseDateInput(form.downtimeTo)}
                  onChange={(d) => setForm((f) => ({ ...f, downtimeTo: formatDateInput(d) }))}
                  placeholder="Optional"
                />
              </FormField>
            </FormGrid>
            <FormField label="Recurring">
              <div className="flex h-9 items-center gap-2">
                <Checkbox
                  id="maint-recurring"
                  checked={form.recurring}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, recurring: checked === true }))
                  }
                />
                <label htmlFor="maint-recurring" className="cursor-pointer text-sm">
                  Recurs on a schedule (e.g. periodic servicing)
                </label>
              </div>
            </FormField>
            <Button type="button" size="sm" onClick={() => void save()}>
              <Plus className="size-4" />
              Create work order
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <ul className="space-y-2">
        {orders.map((o) => (
          <li
            key={o.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm glass-row"
          >
            <div className="min-w-0">
              <div className="font-medium">{o.title}</div>
              <div className="text-xs text-muted-foreground">
                {o.roomUnit?.name ? `Room ${o.roomUnit.name}` : 'Whole property'}
                {o.blockInventory ? ' · inventory blocked' : ''}
                {o.category ? ` · ${o.category}` : ''}
                {o.vendorName ? ` · ${o.vendorName}` : ''}
                {o.recurring ? ' · recurring' : ''}
              </div>
              {o.downtimeFrom || o.downtimeTo ? (
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Downtime {(o.downtimeFrom || '…').toString().slice(0, 10)} →{' '}
                  {(o.downtimeTo || '…').toString().slice(0, 10)}
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <StatusBadge value={o.status} showIcon={false} />
              {canManage ? (
                <Button size="sm" variant="outline" onClick={() => openEdit(o)}>
                  Edit
                </Button>
              ) : null}
              {canManage && o.status !== 'resolved' && o.status !== 'closed' ? (
                <Button size="sm" variant="secondary" onClick={() => void resolve(o.id)}>
                  Resolve
                </Button>
              ) : null}
            </div>
          </li>
        ))}
        {!orders.length ? (
          <li className="text-sm text-muted-foreground">No open work orders.</li>
        ) : null}
      </ul>

      <RecordSheet
        open={Boolean(editTarget)}
        onOpenChange={(next) => {
          if (!next) setEditTarget(null);
        }}
        title={editTarget ? `Edit — ${editTarget.title}` : 'Edit work order'}
        submitLabel="Save"
        submitting={saving}
        onSubmit={() => void saveEdit()}
      >
        <FormField label="Status">
          <Combobox
            options={[
              { value: 'open', label: 'Open' },
              { value: 'assigned', label: 'Assigned' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'closed', label: 'Closed' },
            ]}
            value={editForm.status}
            onChange={(status) => setEditForm((f) => ({ ...f, status }))}
          />
        </FormField>
        <FormGrid>
          <FormField label="Category">
            <Input
              value={editForm.category}
              onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Electrical, plumbing…"
            />
          </FormField>
          <FormField label="Vendor">
            <Input
              value={editForm.vendorName}
              onChange={(e) => setEditForm((f) => ({ ...f, vendorName: e.target.value }))}
              placeholder="Vendor / contractor name"
            />
          </FormField>
        </FormGrid>
        <FormGrid>
          <FormField label="Downtime from">
            <DatePicker
              value={parseDateInput(editForm.downtimeFrom)}
              onChange={(d) =>
                setEditForm((f) => ({ ...f, downtimeFrom: formatDateInput(d) }))
              }
              placeholder="Optional"
            />
          </FormField>
          <FormField label="Downtime to">
            <DatePicker
              value={parseDateInput(editForm.downtimeTo)}
              onChange={(d) => setEditForm((f) => ({ ...f, downtimeTo: formatDateInput(d) }))}
              placeholder="Optional"
            />
          </FormField>
        </FormGrid>
        <FormField label="Recurring">
          <div className="flex h-9 items-center gap-2">
            <Checkbox
              id="maint-edit-recurring"
              checked={editForm.recurring}
              onCheckedChange={(checked) =>
                setEditForm((f) => ({ ...f, recurring: checked === true }))
              }
            />
            <label htmlFor="maint-edit-recurring" className="cursor-pointer text-sm">
              Recurs on a schedule (e.g. periodic servicing)
            </label>
          </div>
        </FormField>
      </RecordSheet>
    </div>
  );
}

import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  FormGrid,
  Input,
  SimpleFormField as FormField,
  toastError,
  toastSuccess,
} from '@travel/ui';
import { api } from '../../api';
import { Can } from '../Can';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';

type GsSettings = {
  qrEnabled: boolean;
  acceptingOrders: boolean;
  walkInQrEnabled: boolean;
  requireRoomPin: boolean;
  businessHoursFrom: string;
  businessHoursUntil: string;
  eInvoiceEnabled: boolean;
};

const defaults: GsSettings = {
  qrEnabled: true,
  acceptingOrders: true,
  walkInQrEnabled: false,
  requireRoomPin: true,
  businessHoursFrom: '07:00',
  businessHoursUntil: '23:00',
  eInvoiceEnabled: false,
};

export function GuestSettingsPanel({ isRestaurant }: { isRestaurant: boolean }) {
  const [s, setS] = useState<GsSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const org = await api<{ settingsJson?: { guestServices?: Partial<GsSettings> } }>(
          '/organizations/current',
        );
        const g = org.settingsJson?.guestServices || {};
        setS({ ...defaults, ...g, walkInQrEnabled: g.walkInQrEnabled ?? isRestaurant });
      } catch (e) {
        reportError(e, 'Could not load settings');
      } finally {
        setLoading(false);
      }
    })();
  }, [isRestaurant]);

  async function save() {
    setSaving(true);
    try {
      await api('/organizations/current', {
        method: 'PATCH',
        body: JSON.stringify({ settingsJson: { guestServices: s } }),
      });
      toastSuccess('Guest Companion settings saved');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">Companion settings</h3>
        <p className="text-xs text-muted-foreground">
          Pause the floor without editing the menu — hours and order rules
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-medium">Accepting orders</p>
            <p className="text-xs text-muted-foreground">
              {s.acceptingOrders
                ? 'Guests can place QR orders right now'
                : 'QR ordering is paused for guests'}
            </p>
          </div>
          <Button
            type="button"
            variant={s.acceptingOrders ? 'default' : 'outline'}
            onClick={() => setS((x) => ({ ...x, acceptingOrders: !x.acceptingOrders }))}
          >
            {s.acceptingOrders ? 'Open' : 'Paused'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={s.qrEnabled}
              onCheckedChange={(c) => setS((x) => ({ ...x, qrEnabled: !!c }))}
            />
            QR guest links enabled
          </label>
          {isRestaurant ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={s.walkInQrEnabled}
                onCheckedChange={(c) => setS((x) => ({ ...x, walkInQrEnabled: !!c }))}
              />
              Allow walk-in QR without staff opening a table
            </label>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={s.requireRoomPin}
                onCheckedChange={(c) => setS((x) => ({ ...x, requireRoomPin: !!c }))}
              />
              Require room service PIN
            </label>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={s.eInvoiceEnabled}
              onCheckedChange={(c) => setS((x) => ({ ...x, eInvoiceEnabled: !!c }))}
            />
            E-invoice IRN attempt on guest checks (provider stub)
          </label>
          <FormGrid>
            <FormField label="Hours from">
              <Input
                value={s.businessHoursFrom}
                onChange={(e) => setS((x) => ({ ...x, businessHoursFrom: e.target.value }))}
                placeholder="07:00"
              />
            </FormField>
            <FormField label="Hours until" className="mb-0">
              <Input
                value={s.businessHoursUntil}
                onChange={(e) => setS((x) => ({ ...x, businessHoursUntil: e.target.value }))}
                placeholder="23:00"
              />
            </FormField>
          </FormGrid>
        </CardContent>
      </Card>

      <Can anyOf={CAP.orgSettingsWrite}>
        <Button type="button" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
      </Can>
    </div>
  );
}

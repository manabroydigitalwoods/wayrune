import { Input, SimpleFormField as FormField } from '@wayrune/ui';
import { ToggleRow } from '../ToggleRow';
import type { IntegrationsSettings } from '../types';

export function HubSpotPanel({
  value,
  onChange,
}: {
  value: IntegrationsSettings['hubspot'];
  onChange: (next: IntegrationsSettings['hubspot']) => void;
}) {
  return (
    <div className="space-y-5">
      <ToggleRow
        label="Enable HubSpot sync"
        description="New leads are pushed to HubSpot as contacts."
        checked={value.enabled}
        onCheckedChange={(checked) => onChange({ ...value, enabled: checked })}
      />

      <FormField className="mb-0" label="Portal ID" description="Optional — for your reference only.">
        <Input
          autoComplete="off"
          value={value.portalId}
          onChange={(e) => onChange({ ...value, portalId: e.target.value })}
          placeholder="e.g. 12345678"
        />
      </FormField>

      <FormField
        className="mb-0"
        label="Private app access token"
        description={
          value.accessTokenConfigured
            ? 'Saved. Leave blank to keep. Needs crm.objects.contacts.write scope.'
            : 'From a HubSpot private app with crm.objects.contacts.write scope.'
        }
      >
        <Input
          autoComplete="off"
          spellCheck={false}
          value={value.accessToken}
          onChange={(e) => onChange({ ...value, accessToken: e.target.value })}
          placeholder={
            value.accessTokenConfigured
              ? '••••••••  (unchanged unless you type a new one)'
              : 'Paste private app token'
          }
        />
      </FormField>
    </div>
  );
}

import { useMemo } from 'react';
import {
  Button,
  FormSection,
  Input,
  SimpleFormField as FormField,
  toastSuccess,
} from '@travel/ui';
import { ToggleRow } from '../ToggleRow';
import type { IntegrationsSettings } from '../types';

export function ConversationWidgetPanel({
  organizationId,
  value,
  onChange,
}: {
  organizationId: string;
  value: IntegrationsSettings['conversationWidget'];
  onChange: (next: IntegrationsSettings['conversationWidget']) => void;
}) {
  const embed = useMemo(() => {
    const api = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `<script src="${origin}/widget.js" data-org="${organizationId}" data-key="${value.publicKey || 'YOUR_PUBLIC_KEY'}" data-api="${api}"></script>`;
  }, [organizationId, value.publicKey]);

  return (
    <div className="space-y-6">
      <ToggleRow
        label="Enable conversation widget"
        description="One embed replaces WhatsApp buttons, chatbots, and contact forms — all land as Interactions in Inbox."
        checked={value.enabled}
        onCheckedChange={(checked) => onChange({ ...value, enabled: checked })}
      />

      <FormSection className="mb-0" title="Widget branding">
        <FormField label="Public key" description="Shared with the embed script (not a secret for signing, but keep obscure).">
          <div className="flex gap-2">
            <Input
              value={value.publicKey}
              onChange={(e) => onChange({ ...value, publicKey: e.target.value })}
              placeholder="cp_widget_…"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onChange({
                  ...value,
                  publicKey: `cp_widget_${Math.random().toString(36).slice(2, 12)}`,
                })
              }
            >
              Generate
            </Button>
          </div>
        </FormField>
        <FormField label="Brand name">
          <Input
            value={value.brandName}
            onChange={(e) => onChange({ ...value, brandName: e.target.value })}
          />
        </FormField>
        <FormField label="Primary color">
          <Input
            value={value.primaryColor}
            onChange={(e) => onChange({ ...value, primaryColor: e.target.value })}
          />
        </FormField>
        <FormField label="WhatsApp number" description="Digits with country code for the WhatsApp handoff button.">
          <Input
            value={value.whatsappNumber}
            onChange={(e) => onChange({ ...value, whatsappNumber: e.target.value })}
            placeholder="9198…"
          />
        </FormField>
        <FormField label="Greeting">
          <Input
            value={value.defaultGreeting}
            onChange={(e) => onChange({ ...value, defaultGreeting: e.target.value })}
          />
        </FormField>
      </FormSection>

      <FormField
        label="Embed snippet"
        description="Paste before </body> on the agency website. Modes: Chat, Callback, Travel enquiry, Contact, WhatsApp."
      >
        <div className="flex gap-2">
          <Input className="font-mono text-xs" readOnly value={embed} onFocus={(e) => e.currentTarget.select()} />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(embed);
              toastSuccess('Copied embed snippet');
            }}
          >
            Copy
          </Button>
        </div>
      </FormField>
    </div>
  );
}

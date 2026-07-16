import {
  Button,
  Input,
  SimpleFormField as FormField,
  toastSuccess,
} from '@travel/ui';
import type { IntegrationsSettings } from '../types';
import { absoluteApiUrl, ingestBaseUrl } from '../types';

export function WebhookPanel({
  organizationId,
  webhookUrl,
  onWebhookUrlChange,
  websiteIngest,
  onWebsiteIngestChange,
}: {
  organizationId: string;
  webhookUrl: string;
  onWebhookUrlChange: (next: string) => void;
  websiteIngest: IntegrationsSettings['websiteIngest'];
  onWebsiteIngestChange: (next: IntegrationsSettings['websiteIngest']) => void;
}) {
  const endpointPath = `${ingestBaseUrl()}/leads/ingest/webhook/${organizationId}`;

  return (
    <div className="space-y-5">
      <FormField
        className="mb-0"
        label="Inbound endpoint"
        description="Copy into your website form or middleware. Payloads land in Inbox as pending touches. When a shared secret is set, send it as X-Webhook-Ingest-Token."
      >
        <div className="flex items-center gap-2">
          <Input
            className="min-w-0 flex-1 font-mono text-xs"
            value={organizationId ? endpointPath : ''}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => {
              void navigator.clipboard.writeText(absoluteApiUrl(endpointPath));
              toastSuccess('Copied webhook URL');
            }}
          >
            Copy
          </Button>
        </div>
      </FormField>

      <pre className="overflow-x-auto rounded-xl border border-border/60 bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
{`{
  "title": "Goa trip enquiry",
  "contactName": "Priya",
  "phone": "9876543210",
  "email": "priya@example.com",
  "channelKey": "website",
  "acquisitionKey": "google",
  "utm": { "source": "google", "medium": "cpc", "campaign": "summer" },
  "idempotencyKey": "form-abc-123"
}`}
      </pre>

      <FormField
        className="mb-0"
        label="Inbound shared secret"
        description={
          websiteIngest.sharedSecretConfigured
            ? 'Saved. Leave blank to keep. Sent as X-Webhook-Ingest-Token.'
            : 'Optional. When set, ingest POSTs must include X-Webhook-Ingest-Token.'
        }
      >
        <div className="flex gap-2">
          <Input
            autoComplete="off"
            spellCheck={false}
            value={websiteIngest.sharedSecret}
            onChange={(e) =>
              onWebsiteIngestChange({ ...websiteIngest, sharedSecret: e.target.value })
            }
            placeholder={
              websiteIngest.sharedSecretConfigured
                ? '••••••••  (unchanged unless you type a new one)'
                : 'Choose a shared secret'
            }
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => {
              const token =
                typeof crypto !== 'undefined' && 'randomUUID' in crypto
                  ? crypto.randomUUID().replace(/-/g, '')
                  : `wh${Date.now().toString(36)}`;
              onWebsiteIngestChange({ ...websiteIngest, sharedSecret: token });
            }}
          >
            Generate
          </Button>
        </div>
      </FormField>

      <FormField
        className="mb-0"
        label="Outbound hook (optional)"
        description="We POST JSON when a new Inbox touch is ingested: { event, organizationId, interactionId, channel, summary, partyId? }."
      >
        <Input
          value={webhookUrl}
          onChange={(e) => onWebhookUrlChange(e.target.value)}
          placeholder="https://your-site.com/hooks/outbound"
        />
      </FormField>
    </div>
  );
}

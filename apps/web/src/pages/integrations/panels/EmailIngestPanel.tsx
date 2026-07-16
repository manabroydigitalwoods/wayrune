import {
  Button,
  Input,
  SimpleFormField as FormField,
  toastSuccess,
} from '@travel/ui';
import { ToggleRow } from '../ToggleRow';
import {
  absoluteApiUrl,
  ingestBaseUrl,
  type IntegrationsSettings,
} from '../types';

export function EmailIngestPanel({
  organizationId,
  value,
  onChange,
}: {
  organizationId: string;
  value: IntegrationsSettings['emailIngest'];
  onChange: (next: IntegrationsSettings['emailIngest']) => void;
}) {
  const endpointPath = `${ingestBaseUrl()}/leads/ingest/email/${organizationId}`;

  return (
    <div className="space-y-5">
      <ToggleRow
        label="Enable email ingest"
        description="Forwarding tools POST here; messages land in Inbox as channel Email."
        checked={value.enabled}
        onCheckedChange={(checked) => onChange({ ...value, enabled: checked })}
      />

      <FormField
        className="mb-0"
        label="Endpoint"
        description="Send JSON with from, subject, text (optional messageId). Header X-Email-Ingest-Token when a secret is set."
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
              toastSuccess('Copied email ingest URL');
            }}
          >
            Copy
          </Button>
        </div>
      </FormField>

      <pre className="overflow-x-auto rounded-xl border border-border/60 bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
{`{
  "from": "traveller@example.com",
  "fromName": "Priya",
  "subject": "Goa trip enquiry",
  "text": "Looking for 4 nights in early August.",
  "messageId": "msg-abc-123"
}`}
      </pre>

      <FormField
        className="mb-0"
        label="Shared secret"
        description={
          value.sharedSecretConfigured
            ? 'Saved. Leave blank to keep. Sent as X-Email-Ingest-Token.'
            : 'Optional. Required header value for ingest POSTs.'
        }
      >
        <div className="flex gap-2">
          <Input
            autoComplete="off"
            spellCheck={false}
            value={value.sharedSecret}
            onChange={(e) => onChange({ ...value, sharedSecret: e.target.value })}
            placeholder={
              value.sharedSecretConfigured
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
                  : `em${Date.now().toString(36)}`;
              onChange({ ...value, sharedSecret: token });
            }}
          >
            Generate
          </Button>
        </div>
      </FormField>
    </div>
  );
}

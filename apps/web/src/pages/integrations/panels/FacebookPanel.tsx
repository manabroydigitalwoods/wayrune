import {
  Button,
  FormGrid,
  FormSection,
  Input,
  Label,
  SimpleFormField as FormField,
  StatusBadge,
  toastSuccess,
} from '@wayrune/ui';
import { ToggleRow } from '../ToggleRow';
import {
  absoluteApiUrl,
  ingestBaseUrl,
  type IntegrationsSettings,
} from '../types';

export function FacebookPanel({
  organizationId,
  value,
  onChange,
}: {
  organizationId: string;
  value: IntegrationsSettings['facebook'];
  onChange: (next: IntegrationsSettings['facebook']) => void;
}) {
  const callbackPath = `${ingestBaseUrl()}/leads/ingest/facebook/${organizationId}`;
  const instagramCallbackPath = `${ingestBaseUrl()}/leads/ingest/instagram/${organizationId}`;

  return (
    <div className="space-y-6">
      <ToggleRow
        label="Enable Facebook Lead Ads ingest"
        description="Meta leadgen webhooks create Inbox rows as channel Facebook."
        checked={value.enabled}
        onCheckedChange={(checked) => onChange({ ...value, enabled: checked })}
      />

      {(value.verifyToken || value.accessTokenConfigured || value.appSecretConfigured) && (
        <div className="flex flex-wrap gap-2">
          {value.verifyToken ? (
            <StatusBadge value="confirmed" label="Verify token set" showIcon={false} />
          ) : null}
          {value.accessTokenConfigured ? (
            <StatusBadge value="confirmed" label="Access token saved" showIcon={false} />
          ) : null}
          {value.appSecretConfigured ? (
            <StatusBadge value="confirmed" label="App secret saved" showIcon={false} />
          ) : null}
        </div>
      )}

      <FormField
        className="mb-0"
        label="Callback URL"
        description="Meta App → Webhooks → Page → leadgen. Subscribe and use the verify token below."
      >
        <div className="flex items-center gap-2">
          <Input
            className="min-w-0 flex-1 font-mono text-xs"
            value={organizationId ? callbackPath : ''}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => {
              void navigator.clipboard.writeText(absoluteApiUrl(callbackPath));
              toastSuccess('Copied callback URL');
            }}
          >
            Copy
          </Button>
        </div>
      </FormField>

      {value.instagramBusinessAccountId ? (
        <FormField
          className="mb-0"
          label="Instagram DM callback URL"
          description="Meta App → Webhooks → Instagram. Subscribe to `messages` using the same verify token."
        >
          <div className="flex items-center gap-2">
            <Input
              className="min-w-0 flex-1 font-mono text-xs"
              value={organizationId ? instagramCallbackPath : ''}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={() => {
                void navigator.clipboard.writeText(absoluteApiUrl(instagramCallbackPath));
                toastSuccess('Copied callback URL');
              }}
            >
              Copy
            </Button>
          </div>
        </FormField>
      ) : null}

      <FormSection
        className="mb-0"
        title="Credentials"
        description="Paste a permanent Page or system user token. OAuth connect can come later."
      >
        <FormGrid>
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">Page ID</Label>
            <Input
              autoComplete="off"
              value={value.pageId}
              onChange={(e) => onChange({ ...value, pageId: e.target.value })}
              placeholder="Optional — filters by page"
            />
          </div>
          <FormField
            className="mb-0"
            label="Instagram Business Account ID"
            description="Linked IG account for this Page — enables Instagram DM ingest/reply below."
          >
            <Input
              autoComplete="off"
              value={value.instagramBusinessAccountId}
              onChange={(e) => onChange({ ...value, instagramBusinessAccountId: e.target.value })}
              placeholder="Optional — from Meta Business Suite"
            />
          </FormField>
          <div className="flex flex-col gap-2">
            <div className="flex h-5 items-center justify-between gap-2">
              <Label className="text-sm font-medium">
                Verify token
                <span className="ml-0.5 text-destructive" aria-hidden>
                  *
                </span>
              </Label>
              <button
                type="button"
                className="shrink-0 text-xs font-medium text-primary hover:underline"
                onClick={() => {
                  const token =
                    typeof crypto !== 'undefined' && 'randomUUID' in crypto
                      ? crypto.randomUUID().replace(/-/g, '')
                      : `fb${Date.now().toString(36)}`;
                  onChange({ ...value, verifyToken: token });
                }}
              >
                Generate
              </button>
            </div>
            <Input
              autoComplete="off"
              className="font-mono text-xs"
              value={value.verifyToken}
              onChange={(e) => onChange({ ...value, verifyToken: e.target.value })}
              placeholder="Must match Meta webhook verify token"
            />
          </div>
          <FormField
            className="mb-0"
            label="Access token"
            description={
              value.accessTokenConfigured
                ? 'Saved. Leave blank to keep. Used to pull lead field data.'
                : 'Page or system user token with leads_retrieval.'
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
                  : 'Paste access token'
              }
            />
          </FormField>
          <FormField
            className="mb-0"
            label="App secret"
            description={
              value.appSecretConfigured
                ? 'Saved. Leave blank to keep. Enables signature checks.'
                : 'Optional. Enables X-Hub-Signature-256 validation.'
            }
          >
            <Input
              autoComplete="off"
              spellCheck={false}
              value={value.appSecret}
              onChange={(e) => onChange({ ...value, appSecret: e.target.value })}
              placeholder={
                value.appSecretConfigured
                  ? '••••••••  (unchanged unless you type a new one)'
                  : 'Meta app secret (optional)'
              }
            />
          </FormField>
        </FormGrid>
      </FormSection>
    </div>
  );
}

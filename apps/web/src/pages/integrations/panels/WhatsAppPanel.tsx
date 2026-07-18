import { useEffect, useState } from 'react';
import {
  Button,
  FormGrid,
  FormSection,
  Input,
  Label,
  SimpleFormField as FormField,
  StatusBadge,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../../api';
import { ToggleRow } from '../ToggleRow';
import {
  absoluteApiUrl,
  ingestBaseUrl,
  type IntegrationsSettings,
} from '../types';

type WaTemplate = {
  id: string;
  name: string;
  metaTemplateName: string;
  languageCode: string;
  isActive: boolean;
};
export function WhatsAppPanel({
  organizationId,
  value,
  onChange,
}: {
  organizationId: string;
  value: IntegrationsSettings['whatsapp'];
  onChange: (next: IntegrationsSettings['whatsapp']) => void;
}) {
  const callbackPath = `${ingestBaseUrl()}/leads/ingest/whatsapp/${organizationId}`;
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [tplName, setTplName] = useState('');
  const [tplMeta, setTplMeta] = useState('');
  const [tplLang, setTplLang] = useState('en');
  const [tplSaving, setTplSaving] = useState(false);

  useEffect(() => {
    api<WaTemplate[]>('/lead-sources/whatsapp-templates')
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  async function addTemplate() {
    if (!tplName.trim() || !tplMeta.trim()) {
      toastError('Name and Meta template name are required');
      return;
    }
    setTplSaving(true);
    try {
      const row = await api<WaTemplate>('/lead-sources/whatsapp-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: tplName.trim(),
          metaTemplateName: tplMeta.trim(),
          languageCode: tplLang.trim() || 'en',
          variableCount: 0,
        }),
      });
      setTemplates((prev) => [...prev, row]);
      setTplName('');
      setTplMeta('');
      toastSuccess('Template saved');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save template');
    } finally {
      setTplSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <ToggleRow
        label="Enable WhatsApp ingest"
        description="Meta must be able to reach this API (use a tunnel on localhost)."
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
        description="In Meta Developer → WhatsApp → Configuration, set this URL and subscribe to messages."
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

      <FormSection
        className="mb-0"
        title="Credentials"
        description="Phone number ID and verify token are required for Meta webhook setup."
      >
        <FormGrid>
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">
              Phone number ID
              <span className="ml-0.5 text-destructive" aria-hidden>
                *
              </span>
            </Label>
            <Input
              name="wa-phone-number-id"
              autoComplete="off"
              value={value.phoneNumberId}
              onChange={(e) => onChange({ ...value, phoneNumberId: e.target.value })}
              placeholder="From Meta WhatsApp → API setup"
            />
          </div>
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
                      : `wa${Date.now().toString(36)}`;
                  onChange({ ...value, verifyToken: token });
                }}
              >
                Generate
              </button>
            </div>
            <Input
              name="wa-verify-token"
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
                ? 'Saved. Leave blank to keep the current token.'
                : 'Permanent system user token from Meta.'
            }
          >
            <Input
              name="wa-access-token"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={value.accessToken}
              onChange={(e) => onChange({ ...value, accessToken: e.target.value })}
              placeholder={
                value.accessTokenConfigured
                  ? '••••••••  (unchanged unless you type a new one)'
                  : 'Paste system user token'
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
              name="wa-app-secret"
              type="text"
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

      <FormSection
        className="mb-0"
        title="Message templates"
        description="Approved Meta templates for first outbound / outside the 24h window."
      >
        <ul className="mb-3 space-y-1 text-sm">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
            >
              <span>
                <span className="font-medium">{t.name}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {t.metaTemplateName} ({t.languageCode})
                </span>
              </span>
              <StatusBadge
                value={t.isActive ? 'active' : 'pending'}
                label={t.isActive ? 'Active' : 'Off'}
                showIcon={false}
              />
            </li>
          ))}
          {!templates.length ? (
            <li className="text-xs text-muted-foreground">No templates yet.</li>
          ) : null}
        </ul>
        <FormGrid>
          <Input
            placeholder="Internal name"
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
          />
          <Input
            placeholder="Meta template name"
            value={tplMeta}
            onChange={(e) => setTplMeta(e.target.value)}
          />
          <Input
            placeholder="Language code"
            value={tplLang}
            onChange={(e) => setTplLang(e.target.value)}
          />
          <Button type="button" disabled={tplSaving} onClick={() => void addTemplate()}>
            {tplSaving ? 'Saving…' : 'Add template'}
          </Button>
        </FormGrid>
      </FormSection>
    </div>
  );
}

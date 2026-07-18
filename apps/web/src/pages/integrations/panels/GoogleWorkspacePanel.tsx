import { useCallback, useEffect, useState } from 'react';
import {
  Button,
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
import { absoluteApiUrl, ingestBaseUrl } from '../types';

export type GoogleWorkspaceStatus = {
  connected: boolean;
  oauthConfigured: boolean;
  googleAccountEmail?: string | null;
  status?: string;
  scopes?: string[];
  locations?: Array<{ name: string; title?: string | null; storeCode?: string | null }>;
  calendarId?: string | null;
  driveRootFolderId?: string | null;
  useDriveAsFileStorage?: boolean;
  syncFollowUpsToCalendar?: boolean;
  lastSyncAt?: string | null;
  lastError?: string | null;
  capabilities?: {
    business?: boolean;
    calendar?: boolean;
    drive?: boolean;
    sheets?: boolean;
  };
};

type ListedLocation = { name: string; title: string; storeCode?: string };

export function GoogleWorkspacePanel({
  organizationId,
  onStatusChange,
}: {
  organizationId: string;
  onStatusChange?: (connected: boolean) => void;
}) {
  const [status, setStatus] = useState<GoogleWorkspaceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [listed, setListed] = useState<ListedLocation[]>([]);
  const [listWarning, setListWarning] = useState('');
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [sheetTitle, setSheetTitle] = useState('Inbox export');
  const [importSpreadsheetId, setImportSpreadsheetId] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api<GoogleWorkspaceStatus>('/integrations/google/status');
      setStatus(next);
      onStatusChange?.(Boolean(next.connected));
      const bound = Array.isArray(next.locations) ? next.locations : [];
      setSelectedNames(new Set(bound.map((l) => l.name).filter(Boolean)));
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not load Google status');
      setStatus({ connected: false, oauthConfigured: false });
      onStatusChange?.(false);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const google = params.get('google');
    if (!google) return;
    if (google === 'connected') toastSuccess('Google connected');
    if (google === 'error') {
      toastError(params.get('reason') || 'Google connect failed');
    }
    params.delete('google');
    params.delete('reason');
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
    window.history.replaceState({}, '', next);
  }, []);

  async function connect() {
    setBusy(true);
    try {
      const res = await api<{ url: string }>('/integrations/google/connect');
      window.location.href = res.url;
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not start Google connect');
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await api('/integrations/google/disconnect', { method: 'POST' });
      toastSuccess('Google disconnected');
      await reload();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not disconnect');
    } finally {
      setBusy(false);
    }
  }

  async function loadLocations() {
    setBusy(true);
    try {
      const res = await api<{ locations: ListedLocation[]; warning?: string }>(
        '/integrations/google/locations',
      );
      setListed(res.locations ?? []);
      setListWarning(res.warning || '');
      if (!(res.locations ?? []).length && res.warning) {
        toastError(res.warning);
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not list locations');
    } finally {
      setBusy(false);
    }
  }

  async function saveLocations() {
    if (!selectedNames.size) {
      toastError('Select at least one location');
      return;
    }
    setBusy(true);
    try {
      const byName = new Map(listed.map((l) => [l.name, l]));
      const existing = Array.isArray(status?.locations) ? status!.locations! : [];
      for (const loc of existing) {
        if (loc.name && !byName.has(loc.name)) {
          byName.set(loc.name, {
            name: loc.name,
            title: loc.title || loc.name,
            storeCode: loc.storeCode || undefined,
          });
        }
      }
      const locations = [...selectedNames].map((name) => {
        const hit = byName.get(name);
        return {
          name,
          title: hit?.title ?? name,
          storeCode: hit?.storeCode ?? null,
        };
      });
      await api('/integrations/google/locations', {
        method: 'POST',
        body: JSON.stringify({ locations }),
      });
      toastSuccess('Locations bound — messages & reviews go to Inbox');
      await reload();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save locations');
    } finally {
      setBusy(false);
    }
  }

  async function syncReviews() {
    setBusy(true);
    try {
      const res = await api<{ ingested: number; errors: string[] }>(
        '/integrations/google/sync-reviews',
        { method: 'POST' },
      );
      toastSuccess(
        res.ingested
          ? `Synced ${res.ingested} review${res.ingested === 1 ? '' : 's'} into Inbox`
          : 'No new reviews',
      );
      if (res.errors?.length) toastError(res.errors.slice(0, 2).join('; '));
      await reload();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Review sync failed');
    } finally {
      setBusy(false);
    }
  }

  async function patchSettings(patch: Record<string, unknown>) {
    setBusy(true);
    try {
      await api('/integrations/google/settings', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      toastSuccess('Settings saved');
      await reload();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save settings');
    } finally {
      setBusy(false);
    }
  }

  async function exportSheet() {
    setBusy(true);
    try {
      const res = await api<{ spreadsheetUrl: string; rowCount: number }>(
        '/integrations/google/sheets/export-interactions',
        {
          method: 'POST',
          body: JSON.stringify({ title: sheetTitle.trim() || undefined, windowDays: 30 }),
        },
      );
      toastSuccess(`Exported ${res.rowCount} interactions`);
      if (res.spreadsheetUrl) window.open(res.spreadsheetUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Sheet export failed');
    } finally {
      setBusy(false);
    }
  }

  async function importSheet() {
    if (!importSpreadsheetId.trim()) {
      toastError('Paste a Spreadsheet ID');
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ imported: number }>(
        '/integrations/google/sheets/import-interactions',
        {
          method: 'POST',
          body: JSON.stringify({
            spreadsheetId: importSpreadsheetId.trim(),
            range: 'Sheet1!A2:G',
          }),
        },
      );
      toastSuccess(`Imported ${res.imported} rows as Interactions`);
      await reload();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Sheet import failed');
    } finally {
      setBusy(false);
    }
  }

  const ingestPath = `${ingestBaseUrl()}/integrations/google/ingest/${organizationId}`;

  if (loading && !status) {
    return <p className="text-sm text-muted-foreground">Loading Google…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {status?.connected ? (
          <StatusBadge value="active" label="Connected" showIcon={false} />
        ) : (
          <StatusBadge value="open" label="Not connected" showIcon={false} />
        )}
        {status?.googleAccountEmail ? (
          <StatusBadge
            value="confirmed"
            label={status.googleAccountEmail}
            showIcon={false}
          />
        ) : null}
        {status?.capabilities?.business ? (
          <StatusBadge value="confirmed" label="Business Profile" showIcon={false} />
        ) : null}
        {status?.capabilities?.calendar ? (
          <StatusBadge value="confirmed" label="Calendar" showIcon={false} />
        ) : null}
        {status?.capabilities?.drive ? (
          <StatusBadge value="confirmed" label="Drive" showIcon={false} />
        ) : null}
        {status?.capabilities?.sheets ? (
          <StatusBadge value="confirmed" label="Sheets" showIcon={false} />
        ) : null}
      </div>

      {!status?.oauthConfigured ? (
        <p className="text-sm text-destructive">
          Server is missing GOOGLE_OAUTH_CLIENT_ID / SECRET. Connect Google cannot start until those
          are set by the Wayrune platform (shared OAuth app).
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status?.connected ? (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void disconnect()}>
            Disconnect Google
          </Button>
        ) : (
          <Button type="button" disabled={busy || !status?.oauthConfigured} onClick={() => void connect()}>
            Connect Google
          </Button>
        )}
      </div>

      {status?.connected ? (
        <>
          <FormSection title="Google Business Profile">
            <p className="mb-3 text-xs text-muted-foreground">
              Messages and reviews become Interactions in Inbox — never Leads. Bind locations, then
              sync reviews or POST to the ingest URL.
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void loadLocations()}>
                List locations
              </Button>
              <Button type="button" size="sm" disabled={busy || !selectedNames.size} onClick={() => void saveLocations()}>
                Save bound locations
              </Button>
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void syncReviews()}>
                Sync reviews now
              </Button>
            </div>
            {listWarning ? (
              <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">{listWarning}</p>
            ) : null}
            {listed.length ? (
              <ul className="mb-3 max-h-48 space-y-2 overflow-y-auto rounded-lg border p-2">
                {listed.map((loc) => {
                  const checked = selectedNames.has(loc.name);
                  return (
                    <li key={loc.name}>
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          onChange={() => {
                            setSelectedNames((prev) => {
                              const next = new Set(prev);
                              if (next.has(loc.name)) next.delete(loc.name);
                              else next.add(loc.name);
                              return next;
                            });
                          }}
                        />
                        <span>
                          <span className="font-medium">{loc.title}</span>
                          <span className="block text-xs text-muted-foreground">{loc.name}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : Array.isArray(status.locations) && status.locations.length ? (
              <p className="mb-2 text-xs text-muted-foreground">
                Bound: {status.locations.map((l) => l.title || l.name).join(', ')}
              </p>
            ) : null}
            <FormField label="GBP ingest webhook">
              <Input readOnly value={absoluteApiUrl(ingestPath)} />
            </FormField>
          </FormSection>

          <FormSection title="Google Calendar">
            <ToggleRow
              label="Sync follow-ups to Google Calendar"
              description="Creates calendar events when Tasks with due dates are created, and when Travel Request date windows are set."
              checked={status.syncFollowUpsToCalendar !== false}
              onCheckedChange={(syncFollowUpsToCalendar) =>
                void patchSettings({ syncFollowUpsToCalendar })
              }
            />
            <FormField label="Calendar ID" className="mt-3">
              <Input
                defaultValue={status.calendarId || 'primary'}
                placeholder="primary"
                onBlur={(e) => {
                  const calendarId = e.target.value.trim() || 'primary';
                  if (calendarId !== (status.calendarId || 'primary')) {
                    void patchSettings({ calendarId });
                  }
                }}
              />
            </FormField>
          </FormSection>

          <FormSection title="Drive & Sheets">
            <ToggleRow
              label="Use Google Drive as file storage"
              description="New uploads (proposals, trip photos, activity attachments) are saved into your agency Drive folder. The app can still open them from Inbox and trips."
              checked={Boolean(status.useDriveAsFileStorage)}
              onCheckedChange={(useDriveAsFileStorage) =>
                void patchSettings({ useDriveAsFileStorage })
              }
            />
            <p className="mb-3 text-xs text-muted-foreground">
              You can also use Save to Drive on a trip quotation. Export Inbox rows to a Sheet, or
              import rows as Interactions (not bulk Leads).
            </p>
            {status.driveRootFolderId ? (
              <p className="mb-2 text-xs text-muted-foreground">
                Drive folder id: {status.driveRootFolderId}
              </p>
            ) : (
              <p className="mb-2 text-xs text-muted-foreground">
                Folder is created automatically on first upload or Sheet export.
              </p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <FormField label="Export sheet title" className="min-w-[12rem] flex-1">
                <Input value={sheetTitle} onChange={(e) => setSheetTitle(e.target.value)} />
              </FormField>
              <Button type="button" size="sm" disabled={busy} onClick={() => void exportSheet()}>
                Export Inbox to Sheets
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <FormField label="Import spreadsheet ID" className="min-w-[12rem] flex-1">
                <Input
                  value={importSpreadsheetId}
                  onChange={(e) => setImportSpreadsheetId(e.target.value)}
                  placeholder="1BxiM…"
                />
              </FormField>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void importSheet()}
              >
                Import as Interactions
              </Button>
            </div>
          </FormSection>

          {status.lastError ? (
            <p className="text-xs text-destructive">Last error: {status.lastError}</p>
          ) : null}
          {status.scopes?.length ? (
            <div>
              <Label className="text-xs text-muted-foreground">Granted scopes</Label>
              <ul className="mt-1 max-h-24 overflow-y-auto text-xs text-muted-foreground">
                {status.scopes.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Connect Google with offline access. Business Profile, Calendar, Drive, and Sheets share
          one org connection (Wayrune&apos;s Google Cloud app — agencies do not create their own
          projects). Staff login with Google is platform-wide and separate from this connector.
        </p>
      )}
    </div>
  );
}

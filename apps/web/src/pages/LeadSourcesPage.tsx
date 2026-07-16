import { FormEvent, useEffect, useState } from 'react';
import { Tags, Trash2 } from 'lucide-react';
import {
  Button,
  Input,
  PageHeader,
  SimpleFormField as FormField,
  StatusBadge,
  Switch,
  toastError,
  toastSuccess,
} from '@travel/ui';
import { api } from '../api';
import { Can } from '../components/Can';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { CAP } from '../lib/capabilities';
import { usePermissions } from '../lib/permissions';

type LeadSourceRow = {
  id: string;
  name: string;
  key: string;
  isActive: boolean;
};

type MemberRow = { id: string; fullName: string; email: string };

type AssignRule = {
  channel: string;
  acquisitionKey: string;
  memberIds: string[];
};

type AutoAssign = {
  mode: 'off' | 'round_robin' | 'rules';
  memberIds: string[];
  rules: AssignRule[];
};

type PipelineStageRow = {
  id: string;
  name: string;
  key: string;
  position: number;
  isWon: boolean;
  isLost: boolean;
};

type PipelineRow = {
  id: string;
  name: string;
  isDefault: boolean;
  stages: PipelineStageRow[];
};

type CustomFieldRow = {
  id: string;
  entity: 'lead' | 'party';
  key: string;
  label: string;
  fieldType: string;
  required: boolean;
  isActive: boolean;
};

const FIELD_TYPES = ['text', 'number', 'boolean', 'select'] as const;

export function LeadSourcesPage() {
  useDocumentTitle('Lead sources');
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.orgSettingsWrite);

  const [sources, setSources] = useState<LeadSourceRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [autoAssign, setAutoAssign] = useState<AutoAssign>({
    mode: 'off',
    memberIds: [],
    rules: [],
  });
  const [autoSaving, setAutoSaving] = useState(false);

  const [pipelines, setPipelines] = useState<PipelineRow[]>([]);
  const [stageName, setStageName] = useState('');
  const [stageKey, setStageKey] = useState('');
  const [stageSaving, setStageSaving] = useState(false);

  const [customFields, setCustomFields] = useState<CustomFieldRow[]>([]);
  const [cfEntity, setCfEntity] = useState<'lead' | 'party'>('lead');
  const [cfKey, setCfKey] = useState('');
  const [cfLabel, setCfLabel] = useState('');
  const [cfType, setCfType] = useState<(typeof FIELD_TYPES)[number]>('text');
  const [cfRequired, setCfRequired] = useState(false);
  const [cfSaving, setCfSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [src, org, mem, pipes, fields] = await Promise.all([
        api<LeadSourceRow[]>('/lead-sources?includeInactive=1'),
        api<{ settingsJson?: unknown }>('/organizations/current'),
        api<MemberRow[]>('/organizations/current/members').catch(() => [] as MemberRow[]),
        api<PipelineRow[]>('/pipelines').catch(() => [] as PipelineRow[]),
        api<CustomFieldRow[]>('/custom-fields').catch(() => [] as CustomFieldRow[]),
      ]);
      setSources(src);
      setMembers(mem);
      setPipelines(pipes);
      setCustomFields(fields);
      const settings =
        org.settingsJson && typeof org.settingsJson === 'object'
          ? (org.settingsJson as Record<string, unknown>)
          : {};
      const leads =
        settings.leads && typeof settings.leads === 'object'
          ? (settings.leads as Record<string, unknown>)
          : {};
      const aa =
        leads.autoAssign && typeof leads.autoAssign === 'object'
          ? (leads.autoAssign as Record<string, unknown>)
          : {};
      const rawRules = Array.isArray(aa.rules) ? aa.rules : [];
      setAutoAssign({
        mode: aa.mode === 'round_robin' ? 'round_robin' : aa.mode === 'rules' ? 'rules' : 'off',
        memberIds: Array.isArray(aa.memberIds)
          ? aa.memberIds.filter((id): id is string => typeof id === 'string')
          : [],
        rules: rawRules.map((r) => {
          const rule = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
          return {
            channel: typeof rule.channel === 'string' ? rule.channel : '',
            acquisitionKey: typeof rule.acquisitionKey === 'string' ? rule.acquisitionKey : '',
            memberIds: Array.isArray(rule.memberIds)
              ? rule.memberIds.filter((id): id is string => typeof id === 'string')
              : [],
          };
        }),
      });
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not load lead sources');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addSource(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    try {
      await api('/lead-sources', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), key: key.trim() || name.trim() }),
      });
      setName('');
      setKey('');
      toastSuccess('Source added');
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not add source');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: LeadSourceRow) {
    if (!canWrite) return;
    try {
      await api(`/lead-sources/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not update source');
    }
  }

  async function saveAutoAssign() {
    if (!canWrite) return;
    setAutoSaving(true);
    try {
      await api('/organizations/current', {
        method: 'PATCH',
        body: JSON.stringify({
          settingsJson: {
            leads: {
              autoAssign: {
                mode: autoAssign.mode,
                memberIds: autoAssign.memberIds,
                rules: autoAssign.rules.map((r) => ({
                  channel: r.channel.trim() || undefined,
                  acquisitionKey: r.acquisitionKey.trim() || undefined,
                  memberIds: r.memberIds,
                })),
              },
            },
          },
        }),
      });
      toastSuccess('Auto-assign saved');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not save auto-assign');
    } finally {
      setAutoSaving(false);
    }
  }

  function toggleMember(id: string) {
    setAutoAssign((prev) => ({
      ...prev,
      memberIds: prev.memberIds.includes(id)
        ? prev.memberIds.filter((m) => m !== id)
        : [...prev.memberIds, id],
    }));
  }

  function addRule() {
    setAutoAssign((prev) => ({
      ...prev,
      rules: [...prev.rules, { channel: '', acquisitionKey: '', memberIds: [] }],
    }));
  }

  function removeRule(index: number) {
    setAutoAssign((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index),
    }));
  }

  function patchRule(index: number, patch: Partial<AssignRule>) {
    setAutoAssign((prev) => ({
      ...prev,
      rules: prev.rules.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));
  }

  function toggleRuleMember(index: number, memberId: string) {
    setAutoAssign((prev) => ({
      ...prev,
      rules: prev.rules.map((r, i) =>
        i === index
          ? {
              ...r,
              memberIds: r.memberIds.includes(memberId)
                ? r.memberIds.filter((m) => m !== memberId)
                : [...r.memberIds, memberId],
            }
          : r,
      ),
    }));
  }

  const defaultPipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0];

  async function addStage(e: FormEvent) {
    e.preventDefault();
    if (!canWrite || !defaultPipeline || !stageName.trim()) return;
    setStageSaving(true);
    try {
      await api(`/pipelines/${defaultPipeline.id}/stages`, {
        method: 'POST',
        body: JSON.stringify({
          name: stageName.trim(),
          key: stageKey.trim() || stageName.trim(),
        }),
      });
      setStageName('');
      setStageKey('');
      toastSuccess('Stage added');
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not add stage');
    } finally {
      setStageSaving(false);
    }
  }

  async function addCustomField(e: FormEvent) {
    e.preventDefault();
    if (!canWrite || !cfLabel.trim()) return;
    setCfSaving(true);
    try {
      await api('/custom-fields', {
        method: 'POST',
        body: JSON.stringify({
          entity: cfEntity,
          key: cfKey.trim() || cfLabel.trim(),
          label: cfLabel.trim(),
          fieldType: cfType,
          required: cfRequired,
        }),
      });
      setCfKey('');
      setCfLabel('');
      setCfRequired(false);
      toastSuccess('Custom field added');
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not add custom field');
    } finally {
      setCfSaving(false);
    }
  }

  async function deactivateCustomField(row: CustomFieldRow) {
    if (!canWrite) return;
    try {
      await api(`/custom-fields/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      });
      toastSuccess('Custom field removed');
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not remove custom field');
    }
  }

  return (
    <div>
      <PageHeader
        icon={Tags}
        title="Lead sources"
        subtitle="Acquisition keys for create forms, call flow, and reporting."
      />

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-4 space-y-8">
          <section className="space-y-3">
            <h2 className="text-sm font-medium">Sources</h2>
            <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
              {sources.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{row.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{row.key}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge
                      value={row.isActive ? 'active' : 'pending'}
                      label={row.isActive ? 'Active' : 'Inactive'}
                      showIcon={false}
                    />
                    <Can anyOf={CAP.orgSettingsWrite}>
                      <Switch
                        checked={row.isActive}
                        onCheckedChange={() => void toggleActive(row)}
                        aria-label={`Toggle ${row.name}`}
                      />
                    </Can>
                  </div>
                </li>
              ))}
            </ul>

            <Can anyOf={CAP.orgSettingsWrite}>
              <form onSubmit={(e) => void addSource(e)} className="grid gap-3 sm:grid-cols-3">
                <FormField label="Name" className="mb-0">
                  <Input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!key) setKey(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                    }}
                    placeholder="Partner portal"
                  />
                </FormField>
                <FormField label="Key" className="mb-0">
                  <Input
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="partner_portal"
                    className="font-mono text-xs"
                  />
                </FormField>
                <div className="flex items-end">
                  <Button type="submit" disabled={saving || !name.trim()}>
                    {saving ? 'Adding…' : 'Add source'}
                  </Button>
                </div>
              </form>
            </Can>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium">Auto-assignment</h2>
            <p className="text-xs text-muted-foreground">
              When round-robin is on, new leads rotate among selected members (or all members if none
              selected).
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  autoAssign.mode === 'off'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/70 bg-muted/30'
                }`}
                onClick={() => setAutoAssign((p) => ({ ...p, mode: 'off' }))}
              >
                Off
              </button>
              <button
                type="button"
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  autoAssign.mode === 'round_robin'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/70 bg-muted/30'
                }`}
                onClick={() => setAutoAssign((p) => ({ ...p, mode: 'round_robin' }))}
              >
                Round-robin
              </button>
              <button
                type="button"
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  autoAssign.mode === 'rules'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/70 bg-muted/30'
                }`}
                onClick={() => setAutoAssign((p) => ({ ...p, mode: 'rules' }))}
              >
                Rules
              </button>
            </div>
            {autoAssign.mode === 'round_robin' && members.length ? (
              <ul className="space-y-2 rounded-xl border border-border/60 p-3">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {m.fullName}{' '}
                      <span className="text-muted-foreground">({m.email})</span>
                    </span>
                    <Switch
                      checked={autoAssign.memberIds.includes(m.id)}
                      onCheckedChange={() => toggleMember(m.id)}
                      disabled={!canWrite}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
            {autoAssign.mode === 'rules' ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Rules match top-down by channel and/or acquisition key (either can be left blank
                  to match anything). New leads round-robin within the first matching rule&apos;s
                  members.
                </p>
                <ul className="space-y-3">
                  {autoAssign.rules.map((rule, index) => (
                    <li key={index} className="space-y-2 rounded-xl border border-border/60 p-3">
                      <div className="flex flex-wrap items-end gap-2">
                        <FormField label="Channel" className="mb-0 min-w-[9rem] flex-1">
                          <Input
                            value={rule.channel}
                            onChange={(e) => patchRule(index, { channel: e.target.value })}
                            placeholder="whatsapp, email…"
                          />
                        </FormField>
                        <FormField label="Acquisition key" className="mb-0 min-w-[9rem] flex-1">
                          <Input
                            value={rule.acquisitionKey}
                            onChange={(e) => patchRule(index, { acquisitionKey: e.target.value })}
                            placeholder="google, referral…"
                          />
                        </FormField>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => removeRule(index)}
                          aria-label="Remove rule"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      {members.length ? (
                        <ul className="flex flex-wrap gap-2">
                          {members.map((m) => (
                            <li key={m.id}>
                              <button
                                type="button"
                                onClick={() => toggleRuleMember(index, m.id)}
                                className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                                  rule.memberIds.includes(m.id)
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border/70 bg-muted/30'
                                }`}
                              >
                                {m.fullName}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <Can anyOf={CAP.orgSettingsWrite}>
                  <Button type="button" variant="outline" size="sm" onClick={addRule}>
                    Add rule
                  </Button>
                </Can>
              </div>
            ) : null}
            <Can anyOf={CAP.orgSettingsWrite}>
              <Button type="button" disabled={autoSaving} onClick={() => void saveAutoAssign()}>
                {autoSaving ? 'Saving…' : 'Save auto-assign'}
              </Button>
            </Can>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium">Sales pipeline</h2>
            <p className="text-xs text-muted-foreground">
              Stages for your default pipeline, in order.
            </p>
            {defaultPipeline ? (
              <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
                {defaultPipeline.stages
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map((stage) => (
                    <li
                      key={stage.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">{stage.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{stage.key}</div>
                      </div>
                      {stage.isWon ? (
                        <StatusBadge value="active" label="Won" showIcon={false} />
                      ) : stage.isLost ? (
                        <StatusBadge value="pending" label="Lost" showIcon={false} />
                      ) : null}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No pipeline configured yet.</p>
            )}
            <Can anyOf={CAP.orgSettingsWrite}>
              {defaultPipeline ? (
                <form onSubmit={(e) => void addStage(e)} className="grid gap-3 sm:grid-cols-3">
                  <FormField label="Stage name" className="mb-0">
                    <Input
                      value={stageName}
                      onChange={(e) => {
                        setStageName(e.target.value);
                        if (!stageKey) {
                          setStageKey(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                        }
                      }}
                      placeholder="Site visit scheduled"
                    />
                  </FormField>
                  <FormField label="Key" className="mb-0">
                    <Input
                      value={stageKey}
                      onChange={(e) => setStageKey(e.target.value)}
                      placeholder="site_visit_scheduled"
                      className="font-mono text-xs"
                    />
                  </FormField>
                  <div className="flex items-end">
                    <Button type="submit" disabled={stageSaving || !stageName.trim()}>
                      {stageSaving ? 'Adding…' : 'Add stage'}
                    </Button>
                  </div>
                </form>
              ) : null}
            </Can>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium">Custom fields</h2>
            <p className="text-xs text-muted-foreground">
              Extra fields captured on leads or clients, in addition to the built-ins.
            </p>
            <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
              {customFields.map((field) => (
                <li key={field.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {field.label}{' '}
                      {field.required ? (
                        <span className="text-xs text-destructive">*</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{field.key}</span> · {field.entity} ·{' '}
                      {field.fieldType}
                    </div>
                  </div>
                  <Can anyOf={CAP.orgSettingsWrite}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => void deactivateCustomField(field)}
                    >
                      Remove
                    </Button>
                  </Can>
                </li>
              ))}
              {!customFields.length ? (
                <li className="px-4 py-3 text-sm text-muted-foreground">No custom fields yet.</li>
              ) : null}
            </ul>
            <Can anyOf={CAP.orgSettingsWrite}>
              <form onSubmit={(e) => void addCustomField(e)} className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  {(['lead', 'party'] as const).map((entity) => (
                    <button
                      key={entity}
                      type="button"
                      onClick={() => setCfEntity(entity)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium capitalize ${
                        cfEntity === entity
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border/70 bg-muted/30'
                      }`}
                    >
                      {entity}
                    </button>
                  ))}
                </div>
                <FormField label="Label" className="mb-0">
                  <Input
                    value={cfLabel}
                    onChange={(e) => {
                      setCfLabel(e.target.value);
                      if (!cfKey) setCfKey(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                    }}
                    placeholder="Passport number"
                  />
                </FormField>
                <FormField label="Key" className="mb-0">
                  <Input
                    value={cfKey}
                    onChange={(e) => setCfKey(e.target.value)}
                    placeholder="passport_number"
                    className="font-mono text-xs"
                  />
                </FormField>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  {FIELD_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setCfType(t)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium capitalize ${
                        cfType === t
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border/70 bg-muted/30'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch checked={cfRequired} onCheckedChange={setCfRequired} />
                  <span className="text-sm">Required</span>
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={cfSaving || !cfLabel.trim()}>
                    {cfSaving ? 'Adding…' : 'Add field'}
                  </Button>
                </div>
              </form>
            </Can>
          </section>
        </div>
      )}
    </div>
  );
}

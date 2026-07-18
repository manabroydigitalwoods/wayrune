import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, FormInput, Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import {
  Button,
  Combobox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  StatusBadge,
  Switch,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';

export type PresenceFormRow = {
  id: string;
  key: string;
  name: string;
  ingestMode: string;
  isActive: boolean;
  fieldsJson: unknown;
};

type FormFieldDraft = {
  id: string;
  name: string;
  label: string;
  type: string;
  required: boolean;
};

const INGEST_OPTIONS = [
  {
    value: 'contact',
    label: 'Contact',
    description: 'General message → CRM inquiry',
  },
  {
    value: 'travel_enquiry',
    label: 'Travel enquiry',
    description: 'Trip request with destinations',
  },
  {
    value: 'callback',
    label: 'Callback',
    description: 'Request a call back',
  },
  {
    value: 'whatsapp',
    label: 'WhatsApp',
    description: 'Route toward WhatsApp handoff',
  },
  {
    value: 'chat',
    label: 'Chat',
    description: 'Conversation-widget style ingest',
  },
];

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Phone' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'url', label: 'URL' },
];

const DEFAULT_FIELDS: FormFieldDraft[] = [
  { id: 'f1', name: 'name', label: 'Name', type: 'text', required: true },
  { id: 'f2', name: 'email', label: 'Email', type: 'email', required: true },
  { id: 'f3', name: 'phone', label: 'Phone', type: 'tel', required: false },
  { id: 'f4', name: 'message', label: 'Message', type: 'textarea', required: true },
];

function fieldsSummary(fieldsJson: unknown) {
  if (!Array.isArray(fieldsJson)) return '0 fields';
  return `${fieldsJson.length} field${fieldsJson.length === 1 ? '' : 's'}`;
}

function slugifyFieldName(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

function parseFields(raw: unknown): FormFieldDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const label = typeof row.label === 'string' ? row.label : `Field ${index + 1}`;
    const name =
      typeof row.name === 'string' && row.name.trim()
        ? row.name.trim()
        : slugifyFieldName(label) || `field_${index + 1}`;
    const type = typeof row.type === 'string' && row.type.trim() ? row.type.trim() : 'text';
    return {
      id: `field_${index}_${name}`,
      name,
      label,
      type,
      required: row.required === true,
    };
  });
}

function toFieldsJson(fields: FormFieldDraft[]) {
  return fields.map(({ name, label, type, required }) => ({
    name: name.trim() || slugifyFieldName(label) || 'field',
    label: label.trim() || name.trim() || 'Field',
    type: type || 'text',
    required: Boolean(required),
  }));
}

export function FormsPanel({
  forms,
  canWrite,
  onChanged,
}: {
  forms: PresenceFormRow[];
  canWrite: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [ingestMode, setIngestMode] = useState('contact');
  const [isActive, setIsActive] = useState(true);
  const [fields, setFields] = useState<FormFieldDraft[]>(DEFAULT_FIELDS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingKey) {
      const row = forms.find((f) => f.key === editingKey);
      if (row) {
        setName(row.name);
        setKey(row.key);
        setIngestMode(row.ingestMode || 'contact');
        setIsActive(row.isActive !== false);
        const parsed = parseFields(row.fieldsJson);
        setFields(parsed.length ? parsed : DEFAULT_FIELDS);
      }
    } else {
      setName('');
      setKey('');
      setIngestMode('contact');
      setIsActive(true);
      setFields(DEFAULT_FIELDS.map((f) => ({ ...f, id: `${f.id}_${Date.now()}` })));
    }
  }, [open, editingKey, forms]);

  const openCreate = () => {
    setEditingKey(null);
    setOpen(true);
  };

  const openEdit = (formKey: string) => {
    setEditingKey(formKey);
    setOpen(true);
  };

  const patchField = (id: string, patch: Partial<FormFieldDraft>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const moveField = (id: string, dir: -1 | 1) => {
    setFields((prev) => {
      const index = prev.findIndex((f) => f.id === id);
      if (index < 0) return prev;
      const nextIndex = index + dir;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      const [row] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, row);
      return copy;
    });
  };

  const addField = () => {
    const id = `field_${Date.now()}`;
    setFields((prev) => [
      ...prev,
      { id, name: `field_${prev.length + 1}`, label: 'New field', type: 'text', required: false },
    ]);
  };

  const save = async () => {
    if (!canWrite) return;
    const formKey = (editingKey || key).trim().toLowerCase().replace(/\s+/g, '_');
    if (!formKey || !name.trim()) {
      toastError('Name and key are required');
      return;
    }
    if (!fields.length) {
      toastError('Add at least one field');
      return;
    }
    const names = new Set<string>();
    for (const field of fields) {
      const n = (field.name.trim() || slugifyFieldName(field.label)).toLowerCase();
      if (!n) {
        toastError('Each field needs a name or label');
        return;
      }
      if (names.has(n)) {
        toastError(`Duplicate field name: ${n}`);
        return;
      }
      names.add(n);
    }

    setSaving(true);
    try {
      await api('/presence/forms', {
        method: 'PUT',
        body: JSON.stringify({
          key: formKey,
          name: name.trim(),
          ingestMode,
          isActive,
          fieldsJson: toFieldsJson(fields),
        }),
      });
      toastSuccess(editingKey ? 'Form updated' : 'Form created');
      setOpen(false);
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to save form');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card/40 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Workflow className="size-4" />
          </div>
          <div className="min-w-0 space-y-1 text-sm">
            <div className="font-medium">How forms work</div>
            <p className="text-xs text-muted-foreground">
              Drop a <span className="text-foreground">Form</span> section on a page and pick a form
              key. Visitors submit on the public site →{' '}
              <code className="text-[11px]">/leads/widget/ingest</code> → a CRM inquiry (and optional
              conversation widget). Edit fields here with the form builder; enable the conversation
              widget public key in Integrations.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {forms.length} form{forms.length === 1 ? '' : 's'} available to page sections
        </p>
        {canWrite ? (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 size-3.5" />
            New form
          </Button>
        ) : null}
      </div>

      {forms.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {forms.map((form) => (
            <div key={form.id} className="flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{form.name}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {form.key}
                  </div>
                </div>
                <StatusBadge
                  value={form.isActive ? 'active' : 'inactive'}
                  label={form.isActive ? 'Active' : 'Inactive'}
                  tone={form.isActive ? 'success' : 'neutral'}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Ingest: <span className="text-foreground">{form.ingestMode}</span>
                {' · '}
                {fieldsSummary(form.fieldsJson)}
              </div>
              {canWrite ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-auto w-full"
                  onClick={() => openEdit(form.key)}
                >
                  <Pencil className="mr-1.5 size-3.5" />
                  Edit
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed px-6 py-10 text-center">
          <FormInput className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No forms yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Presets are created for your org kind when you open Digital Presence.
          </p>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(85vh,560px)] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingKey ? 'Edit form' : 'New form'}</DialogTitle>
            <DialogDescription>
              Build fields visually. Submissions create CRM inquiries via the selected ingest mode.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                className="mt-1 h-9"
                value={name}
                disabled={saving}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Key</Label>
              <Input
                className="mt-1 h-9 font-mono text-sm"
                value={editingKey || key}
                disabled={Boolean(editingKey) || saving}
                onChange={(e) => setKey(e.target.value)}
                placeholder="contact"
              />
            </div>
            <div>
              <Label className="text-xs">Ingest mode</Label>
              <Combobox
                className="mt-1"
                value={ingestMode}
                onChange={setIngestMode}
                disabled={saving}
                options={INGEST_OPTIONS}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <div className="text-xs font-medium">Active</div>
                <p className="text-[11px] text-muted-foreground">
                  Inactive forms stay hidden from pickers
                </p>
              </div>
              <Switch checked={isActive} disabled={saving} onCheckedChange={setIsActive} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Fields</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7"
                  disabled={saving}
                  onClick={addField}
                >
                  <Plus className="mr-1 size-3.5" />
                  Add field
                </Button>
              </div>
              <div className="space-y-2">
                {fields.map((field, index) => (
                  <div key={field.id} className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-medium text-muted-foreground">
                        Field {index + 1}
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          disabled={saving || index === 0}
                          onClick={() => moveField(field.id, -1)}
                          aria-label="Move up"
                        >
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          disabled={saving || index === fields.length - 1}
                          onClick={() => moveField(field.id, 1)}
                          aria-label="Move down"
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7 text-destructive"
                          disabled={saving || fields.length <= 1}
                          onClick={() =>
                            setFields((prev) => prev.filter((f) => f.id !== field.id))
                          }
                          aria-label="Remove field"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label className="text-[10px]">Label</Label>
                        <Input
                          className="mt-1 h-8"
                          value={field.label}
                          disabled={saving}
                          onChange={(e) => {
                            const label = e.target.value;
                            const autoName =
                              !field.name ||
                              field.name === slugifyFieldName(field.label) ||
                              /^field_\d+$/.test(field.name);
                            patchField(field.id, {
                              label,
                              ...(autoName ? { name: slugifyFieldName(label) || field.name } : {}),
                            });
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Name (key)</Label>
                        <Input
                          className="mt-1 h-8 font-mono text-xs"
                          value={field.name}
                          disabled={saving}
                          onChange={(e) =>
                            patchField(field.id, {
                              name: e.target.value.toLowerCase().replace(/\s+/g, '_'),
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div>
                        <Label className="text-[10px]">Type</Label>
                        <Combobox
                          className="mt-1"
                          value={field.type}
                          disabled={saving}
                          onChange={(type) => patchField(field.id, { type })}
                          options={FIELD_TYPE_OPTIONS}
                        />
                      </div>
                      <div className="flex h-9 items-center justify-between gap-2 rounded-md border px-3 sm:min-w-[120px]">
                        <span className="text-xs">Required</span>
                        <Switch
                          checked={field.required}
                          disabled={saving}
                          onCheckedChange={(required) => patchField(field.id, { required })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </DialogBody>
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!canWrite || saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save form'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

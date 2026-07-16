import { useEffect, useState } from 'react';
import { Building } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
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

type OrgProfileResponse = {
  partnerProfile?: {
    legalName?: string | null;
    displayName?: string | null;
    bio?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    website?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    profileJson?: Record<string, unknown> | null;
  } | null;
};

type FormState = {
  legalName: string;
  displayName: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  city: string;
  region: string;
  country: string;
  addressLine1: string;
};

function emptyForm(): FormState {
  return {
    legalName: '',
    displayName: '',
    description: '',
    contactEmail: '',
    contactPhone: '',
    website: '',
    city: '',
    region: '',
    country: '',
    addressLine1: '',
  };
}

export function OrganizationProfileForm() {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<OrgProfileResponse>('/commerce/profile')
      .then((org) => {
        const p = org.partnerProfile;
        const json = (p?.profileJson || {}) as Record<string, unknown>;
        setForm({
          legalName: p?.legalName || '',
          displayName: p?.displayName || '',
          description: p?.bio || '',
          contactEmail: p?.contactEmail || '',
          contactPhone: p?.contactPhone || '',
          website: p?.website || '',
          city: p?.city || '',
          region: p?.region || '',
          country: p?.country || '',
          addressLine1: typeof json.addressLine1 === 'string' ? json.addressLine1 : '',
        });
      })
      .catch((e) => reportError(e, 'Could not load profile'))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      await api('/commerce/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          legalName: form.legalName || null,
          displayName: form.displayName || null,
          description: form.description || null,
          contactEmail: form.contactEmail || null,
          contactPhone: form.contactPhone || null,
          website: form.website || null,
          city: form.city || null,
          region: form.region || null,
          country: form.country || null,
          addressLine1: form.addressLine1 || null,
        }),
      });
      toastSuccess('Profile saved');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading profile…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Building className="size-5 text-primary" />
        <div>
          <h2 className="text-sm font-semibold">Organization profile</h2>
          <p className="text-xs text-muted-foreground">
            Public-facing details shown to partners and customers.
          </p>
        </div>
      </div>
      <Card>
        <CardContent className="space-y-3 pt-4">
          <FormGrid>
            <FormField label="Legal name">
              <Input value={form.legalName} onChange={(e) => set('legalName', e.target.value)} />
            </FormField>
            <FormField label="Display name">
              <Input value={form.displayName} onChange={(e) => set('displayName', e.target.value)} />
            </FormField>
          </FormGrid>
          <FormField label="Description">
            <Input
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="A short description of your business"
            />
          </FormField>
          <FormGrid>
            <FormField label="Contact email">
              <Input
                type="email"
                value={form.contactEmail}
                onChange={(e) => set('contactEmail', e.target.value)}
              />
            </FormField>
            <FormField label="Contact phone">
              <Input value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
            </FormField>
          </FormGrid>
          <FormField label="Website">
            <Input value={form.website} onChange={(e) => set('website', e.target.value)} />
          </FormField>
          <FormField label="Address line 1">
            <Input value={form.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} />
          </FormField>
          <FormGrid>
            <FormField label="City">
              <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
            </FormField>
            <FormField label="Region">
              <Input value={form.region} onChange={(e) => set('region', e.target.value)} />
            </FormField>
          </FormGrid>
          <FormField label="Country">
            <Input value={form.country} onChange={(e) => set('country', e.target.value)} />
          </FormField>
          <Can anyOf={CAP.orgProfileWrite}>
            <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </Button>
          </Can>
        </CardContent>
      </Card>
    </div>
  );
}

export default OrganizationProfileForm;

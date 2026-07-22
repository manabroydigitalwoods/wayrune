import { useEffect, useState } from 'react';
import { Building } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  FormGrid,
  Input,
  SimpleFormField as FormField,
  Skeleton,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { Can } from '../Can';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { PlaceSinglePicker } from '../places/PlacePicker';
import type { PlaceRef } from '../../lib/placeRefs';

type OrgProfileResponse = {
  partnerProfile?: {
    placeId?: string | null;
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
  placeId: string | null;
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
    placeId: null,
    city: '',
    region: '',
    country: '',
    addressLine1: '',
  };
}

function linkedLocationLabel(form: FormState): string {
  const bits = [form.city, form.region, form.country].map((s) => s.trim()).filter(Boolean);
  return bits.join(' · ') || 'Catalog location';
}

export function OrganizationProfileForm() {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** After Clear linked location — next save must send placeId: null. */
  const [clearPlaceOnSave, setClearPlaceOnSave] = useState(false);

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
          placeId: p?.placeId || null,
          city: p?.city || '',
          region: p?.region || '',
          country: p?.country || '',
          addressLine1: typeof json.addressLine1 === 'string' ? json.addressLine1 : '',
        });
        setClearPlaceOnSave(false);
      })
      .catch((e) => reportError(e, 'Could not load profile'))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onPlaceChange(ref: PlaceRef | null) {
    if (!ref?.placeId) {
      // Clear linked location → ID and derived snapshots together.
      setClearPlaceOnSave(true);
      setForm((f) => ({
        ...f,
        placeId: null,
        city: '',
        region: '',
        country: '',
      }));
      return;
    }
    setClearPlaceOnSave(false);
    setForm((f) => ({
      ...f,
      placeId: ref.placeId,
      // Optimistic display; API re-derives authoritative snapshots on save.
      city: ref.name || f.city,
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const linked = Boolean(form.placeId);
      const payload: Record<string, unknown> = {
        legalName: form.legalName || null,
        displayName: form.displayName || null,
        description: form.description || null,
        contactEmail: form.contactEmail || null,
        contactPhone: form.contactPhone || null,
        website: form.website || null,
        addressLine1: form.addressLine1 || null,
      };
      if (linked) {
        payload.placeId = form.placeId;
      } else {
        if (clearPlaceOnSave) payload.placeId = null;
        payload.city = form.city || null;
        payload.region = form.region || null;
        payload.country = form.country || null;
      }
      const saved = await api<OrgProfileResponse>('/commerce/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const p = saved.partnerProfile;
      if (p) {
        setForm((f) => ({
          ...f,
          placeId: p.placeId || null,
          city: p.city || '',
          region: p.region || '',
          country: p.country || '',
        }));
      }
      setClearPlaceOnSave(false);
      toastSuccess('Profile saved');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-2" role="status" aria-busy="true">
        <span className="sr-only">Loading</span>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  const linked = Boolean(form.placeId);
  const placeValue: PlaceRef | null = form.placeId
    ? {
        placeId: form.placeId,
        name: form.city || form.region || form.country || form.placeId,
      }
    : null;

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

          <div className="space-y-2" data-testid="org-profile-location">
            <p className="text-xs font-medium text-foreground">
              {linked ? 'Catalog-linked location' : 'Custom location'}
            </p>
            {linked ? (
              <p className="text-[11px] text-muted-foreground" data-testid="org-profile-linked-summary">
                {linkedLocationLabel(form)}
                <span className="block">City, region, and country are derived from the Places catalog.</span>
              </p>
            ) : null}
            <PlaceSinglePicker
              label={linked ? 'Change location' : 'Link to Places catalog'}
              purpose="destination"
              value={placeValue}
              onChange={onPlaceChange}
              placeholder="Select city or region…"
              // Intentionally no onCreateNew — org HQ is catalog-only when linked.
            />
            {!linked ? (
              <FormGrid>
                <FormField label="City">
                  <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
                </FormField>
                <FormField label="Region">
                  <Input value={form.region} onChange={(e) => set('region', e.target.value)} />
                </FormField>
                <FormField label="Country">
                  <Input value={form.country} onChange={(e) => set('country', e.target.value)} />
                </FormField>
              </FormGrid>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onPlaceChange(null)}
              >
                Clear linked location
              </Button>
            )}
          </div>

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

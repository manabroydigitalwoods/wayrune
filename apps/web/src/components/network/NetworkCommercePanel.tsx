import { useCallback, useEffect, useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Combobox,
  FormGrid,
  Input,
  PriceField,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toastError,
  toastSuccess,
  formatCurrency,
} from '@wayrune/ui';
import { api } from '../../api';
import { Can } from '../Can';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';

type Relationship = { id: string; partner: { id: string; name: string } };
type NegotiatedRate = {
  id: string;
  serviceType: string;
  amount: number | string;
  currency: string;
  productRef?: string | null;
  partner?: { id: string; name: string } | null;
};
type Settlement = { id: string; counterpartyOrgId: string; amount: number | string; currency: string };
type Rating = { id: string; targetOrganizationId: string; score: number; note?: string | null };

const SERVICE_TYPES = [
  { value: 'STAY', label: 'Stay' },
  { value: 'MEAL', label: 'Meal' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'ACTIVITY', label: 'Activity' },
  { value: 'GUIDE', label: 'Guide' },
  { value: 'OTHER', label: 'Other' },
];

const SERVICE_TYPE_SET = new Set(SERVICE_TYPES.map((s) => s.value));

const SCORE_OPTIONS = ['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }));

const RATES_CSV_TEMPLATE =
  'partner,serviceType,amount,currency,productRef,effectiveFrom,effectiveUntil,notes\nDesert Camp Jaisalmer,STAY,4500,INR,Deluxe Tent,2026-04-01,2026-09-30,\n';

function partnerName(relationships: Relationship[], orgId: string) {
  return relationships.find((r) => r.partner.id === orgId)?.partner.name || orgId;
}

export function NetworkCommercePanel({ relationships }: { relationships: Relationship[] }) {
  const [rates, setRates] = useState<NegotiatedRate[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);

  const [relationshipId, setRelationshipId] = useState('');
  const [serviceType, setServiceType] = useState('STAY');
  const [rateAmount, setRateAmount] = useState('');
  const [counterpartyOrgId, setCounterpartyOrgId] = useState('');
  const [settlementAmount, setSettlementAmount] = useState('');
  const [targetOrganizationId, setTargetOrganizationId] = useState('');
  const [score, setScore] = useState('5');
  const [note, setNote] = useState('');
  const [importText, setImportText] = useState(RATES_CSV_TEMPLATE);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, s, rt] = await Promise.all([
        api<NegotiatedRate[]>('/commerce/negotiated-rates'),
        api<Settlement[]>('/commerce/settlements'),
        api<Rating[]>('/commerce/ratings'),
      ]);
      setRates(r);
      setSettlements(s);
      setRatings(rt);
    } catch (e) {
      reportError(e, 'Could not load network commerce data');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(path: string, body: unknown, successMsg: string, failMsg: string) {
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) });
      toastSuccess(successMsg);
      await load();
      return true;
    } catch (e) {
      toastError(e instanceof Error ? e.message : failMsg);
      return false;
    }
  }

  const partnerOptions = relationships.map((r) => ({ value: r.partner.id, label: r.partner.name }));
  const relationshipOptions = relationships.map((r) => ({ value: r.id, label: r.partner.name }));

  async function createRate() {
    if (!relationshipId || !rateAmount) return toastError('Pick a relationship and amount');
    const ok = await submit(
      '/commerce/negotiated-rates',
      { relationshipId, serviceType, amount: Number(rateAmount) },
      'Negotiated rate saved',
      'Could not save rate',
    );
    if (ok) setRateAmount('');
  }

  async function importRatesCsv() {
    const lines = importText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      toastError('Paste a header row plus at least one data row');
      return;
    }
    const headers = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
    const partnerIdx = headers.indexOf('partner');
    const relationshipIdx = headers.indexOf('relationshipid');
    const serviceIdx = headers.indexOf('servicetype');
    const amountIdx = headers.indexOf('amount');
    const currencyIdx = headers.indexOf('currency');
    const productIdx = headers.indexOf('productref');
    const fromIdx = headers.indexOf('effectivefrom');
    const untilIdx = headers.indexOf('effectiveuntil');
    const notesIdx = headers.indexOf('notes');

    if (serviceIdx < 0 || amountIdx < 0) {
      toastError('CSV must include serviceType and amount columns');
      return;
    }
    if (partnerIdx < 0 && relationshipIdx < 0) {
      toastError('CSV must include partner or relationshipId');
      return;
    }

    const rows = lines
      .slice(1)
      .map((line) => {
        const cols = line.split(',').map((c) => c.trim());
        const serviceRaw = (cols[serviceIdx] || '').toUpperCase();
        const amount = Number(cols[amountIdx]);
        if (!SERVICE_TYPE_SET.has(serviceRaw) || Number.isNaN(amount)) return null;
        const currencyRaw = currencyIdx >= 0 ? (cols[currencyIdx] || '').toUpperCase() : '';
        return {
          partner: partnerIdx >= 0 ? cols[partnerIdx] || undefined : undefined,
          relationshipId:
            relationshipIdx >= 0 ? cols[relationshipIdx] || undefined : undefined,
          serviceType: serviceRaw as
            | 'STAY'
            | 'MEAL'
            | 'TRANSFER'
            | 'ACTIVITY'
            | 'GUIDE'
            | 'OTHER',
          amount,
          currency: currencyRaw.length === 3 ? currencyRaw : undefined,
          productRef: productIdx >= 0 ? cols[productIdx] || undefined : undefined,
          effectiveFrom: fromIdx >= 0 ? cols[fromIdx] || undefined : undefined,
          effectiveUntil: untilIdx >= 0 ? cols[untilIdx] || undefined : undefined,
          notes: notesIdx >= 0 ? cols[notesIdx] || undefined : undefined,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (!rows.length) {
      toastError('No valid rows found');
      return;
    }

    setImporting(true);
    try {
      const res = await api<{ imported: number; skipped: number }>(
        '/commerce/negotiated-rates/import/csv',
        { method: 'POST', body: JSON.stringify({ rows }) },
      );
      toastSuccess(`Imported ${res.imported}, skipped ${res.skipped}`);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  async function createSettlement() {
    if (!counterpartyOrgId || !settlementAmount) return toastError('Pick a partner and amount');
    const ok = await submit(
      '/commerce/settlements',
      { counterpartyOrgId, amount: Number(settlementAmount) },
      'Settlement recorded',
      'Could not record settlement',
    );
    if (ok) setSettlementAmount('');
  }

  async function createRating() {
    if (!targetOrganizationId) return toastError('Pick a partner to rate');
    const ok = await submit(
      '/commerce/ratings',
      { targetOrganizationId, score: Number(score), note: note.trim() || null },
      'Rating submitted',
      'Could not submit rating',
    );
    if (ok) setNote('');
  }

  return (
    <Tabs defaultValue="rates">
      <TabsList>
        <TabsTrigger value="rates">Negotiated rates</TabsTrigger>
        <TabsTrigger value="settlements">Settlements</TabsTrigger>
        <TabsTrigger value="ratings">Ratings</TabsTrigger>
      </TabsList>

      <TabsContent value="rates">
        <div className="space-y-4">
          <Can anyOf={CAP.networkWrite}>
          <Card>
            <CardContent className="space-y-3 pt-4">
              <FormGrid>
                <FormField label="Relationship">
                  <Combobox
                    options={relationshipOptions}
                    value={relationshipId}
                    onChange={setRelationshipId}
                    placeholder="Select partner"
                    searchable
                  />
                </FormField>
                <FormField label="Service type">
                  <SuggestionChips
                    aria-label="Service type"
                    allowDeselect={false}
                    options={SERVICE_TYPES}
                    value={serviceType}
                    onChange={setServiceType}
                  />
                </FormField>
              </FormGrid>
              <FormField label="Amount">
                <PriceField value={rateAmount} onChange={setRateAmount} />
              </FormField>
              <Button type="button" size="sm" onClick={() => void createRate()}>
                <Plus className="size-4" />
                Add rate
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-4">
              <div>
                <h4 className="text-sm font-medium">Import rates (CSV)</h4>
                <p className="text-xs text-muted-foreground">
                  Columns: partner (or relationshipId), serviceType, amount, optional currency,
                  productRef, effectiveFrom, effectiveUntil, notes. Partner must match a Network
                  relationship name.
                </p>
              </div>
              <FormField label="CSV">
                <textarea
                  className="min-h-[8rem] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
              </FormField>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={importing}
                onClick={() => void importRatesCsv()}
              >
                <Upload className="size-4" />
                {importing ? 'Importing…' : 'Import CSV'}
              </Button>
            </CardContent>
          </Card>
          </Can>

          <ul className="space-y-2">
            {rates.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm glass-row"
              >
                <div>
                  <span>
                    {SERVICE_TYPES.find((s) => s.value === r.serviceType)?.label || r.serviceType}
                  </span>
                  {r.partner?.name ? (
                    <span className="ml-1.5 text-xs text-muted-foreground">{r.partner.name}</span>
                  ) : null}
                  {r.productRef ? (
                    <span className="ml-1.5 text-xs text-muted-foreground">· {r.productRef}</span>
                  ) : null}
                </div>
                <span className="tabular-nums text-muted-foreground">
                  {formatCurrency(r.amount, { currency: r.currency, maximumFractionDigits: 0 })}
                </span>
              </li>
            ))}
            {!rates.length ? (
              <li className="text-sm text-muted-foreground">No negotiated rates yet.</li>
            ) : null}
          </ul>
        </div>
      </TabsContent>

      <TabsContent value="settlements">
        <div className="space-y-4">
          <Can anyOf={CAP.settlementCreate}>
          <Card>
            <CardContent className="space-y-3 pt-4">
              <FormField label="Partner">
                <Combobox
                  options={partnerOptions}
                  value={counterpartyOrgId}
                  onChange={setCounterpartyOrgId}
                  placeholder="Select partner"
                  searchable
                />
              </FormField>
              <FormField label="Amount">
                <PriceField value={settlementAmount} onChange={setSettlementAmount} />
              </FormField>
              <Button type="button" size="sm" onClick={() => void createSettlement()}>
                <Plus className="size-4" />
                Record settlement
              </Button>
            </CardContent>
          </Card>
          </Can>
          <ul className="space-y-2">
            {settlements.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm glass-row"
              >
                <span>{partnerName(relationships, s.counterpartyOrgId)}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatCurrency(s.amount, { currency: s.currency, maximumFractionDigits: 0 })}
                </span>
              </li>
            ))}
            {!settlements.length ? (
              <li className="text-sm text-muted-foreground">No settlements yet.</li>
            ) : null}
          </ul>
        </div>
      </TabsContent>

      <TabsContent value="ratings">
        <div className="space-y-4">
          <Can anyOf={CAP.networkWrite}>
          <Card>
            <CardContent className="space-y-3 pt-4">
              <FormGrid>
                <FormField label="Partner">
                  <Combobox
                    options={partnerOptions}
                    value={targetOrganizationId}
                    onChange={setTargetOrganizationId}
                    placeholder="Select partner"
                    searchable
                  />
                </FormField>
                <FormField label="Score (1-5)">
                  <SuggestionChips
                    aria-label="Score"
                    allowDeselect={false}
                    options={SCORE_OPTIONS}
                    value={score}
                    onChange={setScore}
                  />
                </FormField>
              </FormGrid>
              <FormField label="Note">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
              </FormField>
              <Button type="button" size="sm" onClick={() => void createRating()}>
                <Plus className="size-4" />
                Submit rating
              </Button>
            </CardContent>
          </Card>
          </Can>
          <ul className="space-y-2">
            {ratings.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm glass-row"
              >
                <div>
                  <span>{partnerName(relationships, r.targetOrganizationId)}</span>
                  {r.note ? <span className="ml-1.5 text-xs text-muted-foreground">{r.note}</span> : null}
                </div>
                <StatusBadge value="confirmed" label={`${r.score} / 5`} showIcon={false} tone="success" />
              </li>
            ))}
            {!ratings.length ? <li className="text-sm text-muted-foreground">No ratings yet.</li> : null}
          </ul>
        </div>
      </TabsContent>
    </Tabs>
  );
}

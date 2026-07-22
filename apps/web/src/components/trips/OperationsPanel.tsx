import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CircleSlash, Network } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Combobox,
  ConfirmDialog,
  DatePicker,
  FormGrid,
  Input,
  PriceField,
  NumberField,
  RecordSheet,
  SimpleFormField as FormField,
  Skeleton,
  StatusBadge,
  SuggestionChips,
  cn,
  formatCurrency,
  toastError,
  toastSuccess,
  toastWarning,
} from '@wayrune/ui';
import { api, apiBlob } from '../../api';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
import { Can } from '../Can';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { usePermissions } from '../../lib/permissions';
import {
  BOOKING_SERVICE_STATUS_OPTIONS,
  resolveBookingServiceStatus,
} from '../../lib/bookingServiceStatus';
import {
  latestPartnerConfirmationByBookingId,
  partnerConfirmationFilesBatchPath,
  partnerConfirmationFilesPath,
  type PartnerConfirmationDoc,
} from '../../lib/partnerConfirmationDocs';
import { allotmentConfirmToastCue } from '../../lib/allotmentConfirmToast';
import {
  opsBookingConfirmDescription,
  opsBookingConfirmPlaceholder,
  opsConfirmCueFromBooking,
  partnerInboundServiceCue,
  partnerInboundTypeLabel,
  transferCapacityConfirmToastCue,
} from '../../lib/partnerInboundConfirmCopy';

type Booking = {
  id: string;
  type: string;
  title: string;
  status: string;
  confirmationRef?: string | null;
  voucherNote?: string | null;
  costAmount?: string | number | null;
  confirmedAmount?: string | number | null;
  quotedAmount?: string | number | null;
  requiredQuantity?: string | number | null;
  supplierId?: string | null;
  quotationLineId?: string | null;
  serviceRequestId?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  travellerRequirementsJson?: Record<string, unknown> | null;
  supplier?: { id: string; name: string; phone?: string | null } | null;
  invoices?: Array<{ id: string; invoiceNumber: string; status: string }> | null;
};

type CancelPreview = {
  bookingId: string;
  tripId: string;
  title: string;
  policySource: 'quote_line' | 'supplier_contract' | 'none';
  applicablePolicySnapshotJson: unknown | null;
  baseAmount: number;
  currency: string;
  serviceStartAt: string | null;
  nightCount: number;
  evaluation: {
    applicableRule: {
      beforeHours: number;
      chargeType: string;
      chargeValue: number;
    } | null;
    customerCharge: number;
    expectedRefund: number;
    supplierPenalty: number;
    agencyAbsorption: number;
    humanExplanation: string[];
  };
  openCase?: CancellationCaseRow | null;
};

type CancellationCaseRow = {
  id: string;
  approvalStatus: string;
  executionStatus: string;
  calculatedCharges?: string | number | null;
  expectedRefund?: string | number | null;
  currency: string;
  reason?: string | null;
};

/** Matches runtime: payable is created on confirm; voucher is the last demo step. */
const HOTEL_CHAIN_STEPS = [
  { key: 'quote', label: 'Quote' },
  { key: 'enquiry', label: 'Enquiry' },
  { key: 'confirmed', label: 'Confirm' },
  { key: 'payable', label: 'Payable' },
  { key: 'voucher', label: 'Voucher' },
] as const;

function hotelChainStepIndex(b: Booking): number {
  if (b.status === 'cancelled' || b.status === 'rejected') return -1;
  const invoices = (b.invoices || []).filter((i) => i.status !== 'cancelled');
  const hasInvoice = invoices.length > 0;
  const payableSettled = hasInvoice && invoices.every((i) => i.status === 'paid');
  const vouchered = Boolean(b.voucherNote?.trim());

  // Quote → Enquiry → Confirm → Payable → Voucher
  if (vouchered && (!hasInvoice || payableSettled)) return HOTEL_CHAIN_STEPS.length;
  if (payableSettled) return 4;
  if (hasInvoice) return 3;
  // Confirmed but payable missing — surface Payable as the blocked next step
  if (b.status === 'confirmed') return 3;
  if (b.status === 'sent') return 2;
  if (b.status === 'requested' || b.serviceRequestId || b.quotationLineId) return 1;
  return 0;
}

function HotelChainPipeline({ booking }: { booking: Booking }) {
  const current = hotelChainStepIndex(booking);
  if (current < 0) return null;
  return (
    <div
      className="flex flex-nowrap items-center gap-x-1 overflow-x-auto text-[10px] leading-none whitespace-nowrap"
      aria-label="Hotel booking pipeline"
    >
      {HOTEL_CHAIN_STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <span key={step.key} className="inline-flex shrink-0 items-center gap-1">
            {i > 0 ? <span className="text-muted-foreground/50">→</span> : null}
            <span
              className={
                active
                  ? 'font-semibold text-foreground'
                  : done
                    ? 'text-muted-foreground'
                    : 'text-muted-foreground/45'
              }
            >
              {done ? '✓ ' : active ? '● ' : ''}
              {step.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

type Readiness = {
  items: Array<{ id: string; label: string; done: boolean }>;
  allDone: boolean;
};

type Supplier = {
  id: string;
  name: string;
  type?: string | null;
  linkedAssetId?: string | null;
  linkedOrganizationId?: string | null;
  linkedOrganization?: { id: string; name: string; kind: string } | null;
};

type FleetUnit = {
  id: string;
  name: string;
  plateNumber?: string | null;
  seats?: number | null;
  isActive?: boolean;
};

type RoomProduct = {
  id: string;
  name: string;
  isActive?: boolean;
};

type NetworkPartner = {
  organizationId: string;
  name: string;
  kind: string;
  status: string;
  city?: string | null;
  localSupplierId?: string | null;
};

const BOOKING_TYPES = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'activity', label: 'Activity' },
  { value: 'flight_ref', label: 'Flight ref' },
  { value: 'other', label: 'Other' },
];

const BOOKING_STATUSES = [...BOOKING_SERVICE_STATUS_OPTIONS];

function emptyBookingForm() {
  return {
    type: 'hotel',
    title: '',
    supplierId: '',
    supplierName: '',
    confirmationRef: '',
    voucherNote: '',
    costAmount: '',
    rooms: '1',
    roomProductId: '',
    status: 'pending',
    startAt: '',
    endAt: '',
    driverSupplierId: '',
    vehicleLabel: '',
    fleetUnitId: '',
  };
}

function hotelRoomsFromBooking(booking: Booking): string {
  const fromRequired = Number(booking.requiredQuantity);
  if (Number.isFinite(fromRequired) && fromRequired >= 1) {
    return String(Math.floor(fromRequired));
  }
  const fromJson = Number(booking.travellerRequirementsJson?.rooms);
  if (Number.isFinite(fromJson) && fromJson >= 1) {
    return String(Math.floor(fromJson));
  }
  return '1';
}

function hotelRoomProductIdFromBooking(booking: Booking): string {
  const json = booking.travellerRequirementsJson;
  const root =
    json && typeof json === 'object' && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : {};
  return typeof root.roomProductId === 'string' ? root.roomProductId.trim() : '';
}

function transferAssignmentFromBooking(booking: Booking) {
  const json = booking.travellerRequirementsJson;
  const root =
    json && typeof json === 'object' && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : {};
  return {
    driverSupplierId:
      typeof root.driverSupplierId === 'string' ? root.driverSupplierId : '',
    vehicleLabel: typeof root.vehicleLabel === 'string' ? root.vehicleLabel : '',
    fleetUnitId: typeof root.fleetUnitId === 'string' ? root.fleetUnitId : '',
  };
}

function fleetUnitLabel(u: FleetUnit): string {
  const plate = u.plateNumber?.trim();
  return plate ? `${u.name} · ${plate}` : u.name;
}

export function OperationsPanel({
  tripId,
  status,
  onChanged,
  onOpenFinance,
  focusBookingId,
}: {
  tripId: string;
  status: string;
  onChanged: () => Promise<void> | void;
  onOpenFinance?: () => void;
  /** Scroll/highlight this booking (from Next action deep-link). */
  focusBookingId?: string | null;
}) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [networkPartners, setNetworkPartners] = useState<NetworkPartner[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyBookingForm);
  const [fleetUnits, setFleetUnits] = useState<FleetUnit[]>([]);
  const [roomProducts, setRoomProducts] = useState<RoomProduct[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [networkPick, setNetworkPick] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelPreview, setCancelPreview] = useState<CancelPreview | null>(null);
  const [cancelCase, setCancelCase] = useState<CancellationCaseRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelPreviewLoading, setCancelPreviewLoading] = useState(false);
  const [cancelAction, setCancelAction] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Booking | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [linkingSrId, setLinkingSrId] = useState<string | null>(null);
  const [materializing, setMaterializing] = useState(false);
  const [voucheringId, setVoucheringId] = useState<string | null>(null);
  const [downloadingVoucherId, setDownloadingVoucherId] = useState<string | null>(
    null,
  );
  const [sendingEnquiryId, setSendingEnquiryId] = useState<string | null>(null);
  const [enquiryMarkSentId, setEnquiryMarkSentId] = useState<string | null>(null);
  const [markingEnquirySentId, setMarkingEnquirySentId] = useState<string | null>(
    null,
  );
  const [sendingVouchers, setSendingVouchers] = useState(false);
  const [vouchersWaMarkPending, setVouchersWaMarkPending] = useState(false);
  const [vouchersWaMarkBookingIds, setVouchersWaMarkBookingIds] = useState<
    string[]
  >([]);
  const [markingVouchersSent, setMarkingVouchersSent] = useState(false);
  const [emailingVouchers, setEmailingVouchers] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Booking | null>(null);
  const [confirmRef, setConfirmRef] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [partnerConfirmDocs, setPartnerConfirmDocs] = useState<
    PartnerConfirmationDoc[]
  >([]);
  const [partnerConfirmDocsLoading, setPartnerConfirmDocsLoading] = useState(false);
  const [partnerConfirmByBookingId, setPartnerConfirmByBookingId] = useState<
    Map<string, PartnerConfirmationDoc>
  >(() => new Map());
  const [downloadingPartnerConfirmId, setDownloadingPartnerConfirmId] = useState<
    string | null
  >(null);
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.tripWrite);

  useEffect(() => {
    const id = focusBookingId?.trim();
    if (!id || !bookings.some((b) => b.id === id)) return;
    const el = document.getElementById(`ops-booking-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusBookingId, bookings]);

  async function loadPartnerConfirmIndex(bookingIds: string[]) {
    if (!bookingIds.length) {
      setPartnerConfirmByBookingId(new Map());
      return;
    }
    try {
      const docs = await api<PartnerConfirmationDoc[]>(
        partnerConfirmationFilesBatchPath(bookingIds),
      );
      setPartnerConfirmByBookingId(
        latestPartnerConfirmationByBookingId(Array.isArray(docs) ? docs : []),
      );
    } catch {
      setPartnerConfirmByBookingId(new Map());
    }
  }

  async function load() {
    try {
      const [b, r, s] = await Promise.all([
        api<Booking[]>(`/trips/${tripId}/bookings`),
        api<Readiness>(`/trips/${tripId}/readiness`),
        api<Supplier[]>('/suppliers'),
      ]);
      setBookings(b);
      setReadiness(r);
      setSuppliers(Array.isArray(s) ? s : []);
      void loadPartnerConfirmIndex(b.map((row) => row.id));
      try {
        const partners = await api<NetworkPartner[]>('/network/followed-partners');
        setNetworkPartners(Array.isArray(partners) ? partners : []);
      } catch {
        setNetworkPartners([]);
      }
    } catch (e) {
      reportError(e, 'Could not load operations');
    }
  }

  useEffect(() => {
    void load();
  }, [tripId]);

  const openBookings = useMemo(
    () => bookings.filter((b) => b.status !== 'confirmed' && b.status !== 'cancelled').length,
    [bookings],
  );
  const openHotelEnquiries = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.type === 'hotel' &&
          b.status !== 'confirmed' &&
          b.status !== 'cancelled',
      ).length,
    [bookings],
  );
  const readinessDone = readiness?.items.filter((i) => i.done).length || 0;
  const readinessTotal = readiness?.items.length || 0;
  const driverSuppliers = useMemo(
    () =>
      suppliers.filter((s) => {
        const t = (s.type || '').toLowerCase();
        return t === 'driver' || t === 'car_rental' || t === 'fleet';
      }),
    [suppliers],
  );

  const selectedDriverAssetId = useMemo(() => {
    if (!form.driverSupplierId) return null;
    return (
      driverSuppliers.find((s) => s.id === form.driverSupplierId)?.linkedAssetId ||
      null
    );
  }, [driverSuppliers, form.driverSupplierId]);

  const selectedHotelAssetId = useMemo(() => {
    if (form.type !== 'hotel' || !form.supplierId) return null;
    return (
      suppliers.find((s) => s.id === form.supplierId)?.linkedAssetId || null
    );
  }, [form.type, form.supplierId, suppliers]);

  useEffect(() => {
    if (!selectedDriverAssetId) {
      setFleetUnits([]);
      return;
    }
    let cancelled = false;
    api<FleetUnit[]>(`/inventory/assets/${selectedDriverAssetId}/fleet`)
      .then((units) => {
        if (cancelled) return;
        setFleetUnits(
          (Array.isArray(units) ? units : []).filter((u) => u.isActive !== false),
        );
      })
      .catch(() => {
        if (!cancelled) setFleetUnits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDriverAssetId]);

  useEffect(() => {
    if (!selectedHotelAssetId) {
      setRoomProducts([]);
      return;
    }
    let cancelled = false;
    api<RoomProduct[]>(`/inventory/assets/${selectedHotelAssetId}/rooms`)
      .then((rooms) => {
        if (cancelled) return;
        setRoomProducts(
          (Array.isArray(rooms) ? rooms : []).filter((r) => r.isActive !== false),
        );
      })
      .catch(() => {
        if (!cancelled) setRoomProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedHotelAssetId]);

  const quoteSourcedHotels = useMemo(
    () => bookings.filter((b) => b.type === 'hotel' && Boolean(b.quotationLineId)),
    [bookings],
  );
  const voucherEligibleBookings = useMemo(
    () =>
      bookings.filter(
        (b) =>
          (b.type === 'hotel' ||
            b.type === 'transfer' ||
            b.type === 'activity') &&
          b.status === 'confirmed' &&
          Boolean(b.voucherNote?.trim()),
      ),
    [bookings],
  );

  async function materializeFromQuote() {
    setMaterializing(true);
    try {
      const res = await api<{
        created: number;
        skipped: number;
        allotmentHolds?: number;
        warnings?: string[];
        hotel?: { warnings?: string[]; allotmentHolds?: number };
        transfer?: { warnings?: string[] };
        activity?: { warnings?: string[] };
      }>(`/trips/${tripId}/bookings/from-accepted-quote`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const holds = res.allotmentHolds ?? res.hotel?.allotmentHolds ?? 0;
      const warnings =
        res.warnings ||
        [
          ...(res.hotel?.warnings || []),
          ...(res.transfer?.warnings || []),
          ...(res.activity?.warnings || []),
        ];
      let msg = res.created
        ? `Created ${res.created} booking${res.created === 1 ? '' : 's'} from quote`
        : res.skipped
          ? 'Bookings already linked to the accepted quote'
          : 'No hotel/transfer/activity lines with suppliers on the accepted quote';
      if (holds > 0) {
        msg = `${msg} · ${holds} allotment hold${holds === 1 ? '' : 's'}`;
      }
      if (warnings.length) {
        toastWarning(`${msg} · ${warnings[0]}${warnings.length > 1 ? '…' : ''}`);
      } else {
        toastSuccess(msg);
      }
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create bookings from quote');
    } finally {
      setMaterializing(false);
    }
  }

  async function resolveSupplierId(): Promise<string | null> {
    if (networkPick) {
      const partner = networkPartners.find((p) => p.organizationId === networkPick);
      if (partner?.localSupplierId) return partner.localSupplierId;
      const created = await api<{ id: string }>('/network/suppliers', {
        method: 'POST',
        body: JSON.stringify({ partnerOrganizationId: networkPick }),
      });
      return created.id;
    }
    if (form.supplierId) return form.supplierId;
    if (!form.supplierName.trim()) return null;
    const existing = suppliers.find(
      (s) => s.name.toLowerCase() === form.supplierName.trim().toLowerCase(),
    );
    if (existing) return existing.id;
    const created = await api<{ id: string }>('/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: form.supplierName.trim(), type: form.type }),
    });
    return created.id;
  }

  async function saveNewBooking() {
    if (!form.title.trim()) {
      toastError('Enter a booking title');
      return;
    }
    setSubmitting(true);
    try {
      const supplierId = await resolveSupplierId();
      await api(`/trips/${tripId}/bookings`, {
        method: 'POST',
        body: JSON.stringify({
          type: form.type,
          title: form.title.trim(),
          supplierId,
          costAmount: form.costAmount ? Number(form.costAmount) : null,
          ...(form.type === 'transfer'
            ? {
                startAt: form.startAt || null,
                endAt: form.endAt || null,
                driverSupplierId: form.driverSupplierId || null,
                vehicleLabel: form.vehicleLabel.trim() || null,
                fleetUnitId: form.fleetUnitId || null,
              }
            : {}),
        }),
      });
      toastSuccess('Booking added');
      setAddOpen(false);
      setForm(emptyBookingForm());
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add booking');
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(booking: Booking) {
    const assignment = transferAssignmentFromBooking(booking);
    setEditingId(booking.id);
    setForm({
      type: booking.type,
      title: booking.title,
      supplierId: booking.supplierId || booking.supplier?.id || '',
      supplierName: '',
      confirmationRef: booking.confirmationRef || '',
      voucherNote: booking.voucherNote || '',
      costAmount: booking.costAmount != null ? String(Number(booking.costAmount)) : '',
      rooms: hotelRoomsFromBooking(booking),
      roomProductId: hotelRoomProductIdFromBooking(booking),
      status: booking.status,
      startAt: booking.startAt ? booking.startAt.slice(0, 10) : '',
      endAt: booking.endAt ? booking.endAt.slice(0, 10) : '',
      driverSupplierId: assignment.driverSupplierId,
      vehicleLabel: assignment.vehicleLabel,
      fleetUnitId: assignment.fleetUnitId,
    });
    setPartnerConfirmDocs([]);
    setEditOpen(true);
    void loadPartnerConfirmDocs(booking.id);
  }

  async function loadPartnerConfirmDocs(bookingId: string) {
    setPartnerConfirmDocsLoading(true);
    try {
      const docs = await api<PartnerConfirmationDoc[]>(
        partnerConfirmationFilesPath(bookingId),
      );
      setPartnerConfirmDocs(Array.isArray(docs) ? docs : []);
    } catch {
      setPartnerConfirmDocs([]);
    } finally {
      setPartnerConfirmDocsLoading(false);
    }
  }

  async function downloadPartnerConfirmation(doc: PartnerConfirmationDoc) {
    setDownloadingPartnerConfirmId(doc.id);
    try {
      const blob = await apiBlob(`/files/${doc.id}/content`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name || `partner-confirmation-${doc.id.slice(-8)}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toastSuccess('Partner confirmation downloaded');
    } catch (e) {
      toastError(
        e instanceof Error ? e.message : 'Could not download partner confirmation',
      );
    } finally {
      setDownloadingPartnerConfirmId(null);
    }
  }

  async function saveEditBooking() {
    if (!editingId || !form.title.trim()) {
      toastError('Enter a booking title');
      return;
    }
    setSubmitting(true);
    try {
      let supplierId = form.supplierId || null;
      if (!supplierId && form.supplierName.trim()) {
        supplierId = await resolveSupplierId();
      }
      const res = await api<{
        driverJobSync?: {
          ok: boolean;
          skipped?: string;
          failed?: string;
          softConflict?: boolean;
          allocationId?: string;
        };
        allotmentUpgraded?: boolean;
        allotmentQuantityResynced?: boolean;
        allotmentDatesResynced?: boolean;
        allotmentAssetRebound?: boolean;
        allotmentRoomProductRematched?: boolean;
        allotmentFleetWindowResynced?: boolean;
        allotmentOrphanReleased?: boolean;
        allotmentSyncFailed?: string;
      }>(`/trips/${tripId}/bookings/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: form.title.trim(),
          type: form.type,
          status: form.status,
          confirmationRef: form.confirmationRef.trim() || null,
          voucherNote: form.voucherNote.trim() || null,
          supplierId,
          costAmount: form.costAmount ? Number(form.costAmount) : null,
          ...(form.type === 'hotel'
            ? {
                requiredQuantity: Math.max(
                  1,
                  Math.floor(Number(form.rooms)) || 1,
                ),
                roomProductId: form.roomProductId.trim() || null,
              }
            : {}),
          ...(form.type === 'transfer'
            ? {
                startAt: form.startAt || null,
                endAt: form.endAt || null,
                driverSupplierId: form.driverSupplierId || null,
                vehicleLabel: form.vehicleLabel.trim() || null,
                fleetUnitId: form.fleetUnitId || null,
              }
            : {}),
        }),
      });
      const sync = res.driverJobSync;
      const allotmentCue = allotmentConfirmToastCue(res);
      if (sync && !sync.ok) {
        toastWarning(
          sync.failed
            ? `Saved · driver job sync failed: ${sync.failed}${allotmentCue}`
            : `Saved · driver job not synced (${sync.skipped || 'skipped'})${allotmentCue}`,
        );
      } else if (sync?.softConflict) {
        toastWarning(
          `Saved · partner fleet has another duty in this window (soft conflict)${allotmentCue}`,
        );
      } else if (res.allotmentSyncFailed) {
        toastWarning(`Booking updated${allotmentCue}`);
      } else {
        toastSuccess(
          sync?.allocationId
            ? `Booking updated · partner hold synced${allotmentCue}`
            : `Booking updated${allotmentCue}`,
        );
      }
      setEditOpen(false);
      setEditingId(null);
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update booking');
    } finally {
      setSubmitting(false);
    }
  }

  async function quickConfirm(booking: Booking) {
    setConfirmTarget(booking);
    setConfirmRef(booking.confirmationRef || '');
  }

  async function submitConfirm() {
    if (!confirmTarget) return;
    const trimmed = confirmRef.trim();
    if (!trimmed) {
      toastError('Confirmation reference is required');
      return;
    }
    setConfirming(true);
    try {
      const booking = confirmTarget;
      const confirmedAmount =
        booking.confirmedAmount != null
          ? Number(booking.confirmedAmount)
          : booking.costAmount != null
            ? Number(booking.costAmount)
            : booking.quotedAmount != null
              ? Number(booking.quotedAmount)
              : null;
      const res = await api<{
        payable?: { created: boolean; invoiceId: string | null; reason: string | null };
        allotmentUpgraded?: boolean;
        allotmentQuantityResynced?: boolean;
        allotmentDatesResynced?: boolean;
        allotmentAssetRebound?: boolean;
        allotmentRoomProductRematched?: boolean;
        allotmentFleetWindowResynced?: boolean;
        allotmentOrphanReleased?: boolean;
        allotmentSyncFailed?: string;
      }>(`/trips/${tripId}/bookings/${booking.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'confirmed',
          confirmationRef: trimmed,
          ...(confirmedAmount != null && Number.isFinite(confirmedAmount)
            ? { confirmedAmount }
            : {}),
        }),
      });
      setConfirmTarget(null);
      const allotmentCue = allotmentConfirmToastCue(res);
      const capacityCue = transferCapacityConfirmToastCue(
        opsConfirmCueFromBooking(booking),
      );
      const softCues = `${allotmentCue}${capacityCue}`;
      const softWarn =
        Boolean(res.allotmentSyncFailed) || Boolean(capacityCue);
      if (softWarn) {
        toastWarning(
          res.payable?.created
            ? `Booking confirmed · supplier payable scheduled${softCues}`
            : res.payable?.reason
              ? `Booking confirmed · payable not created — ${res.payable.reason}${softCues}`
              : `Booking confirmed${softCues}`,
        );
      } else if (res.payable?.created) {
        toastSuccess(
          `Booking confirmed · supplier payable scheduled in Finance${softCues}`,
        );
      } else if (res.payable?.reason) {
        toastWarning(
          `Booking confirmed · payable not created — ${res.payable.reason}${softCues}`,
        );
      } else {
        toastSuccess(`Booking confirmed${softCues}`);
      }
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not confirm booking');
    } finally {
      setConfirming(false);
    }
  }

  async function markVouchered(booking: Booking) {
    setVoucheringId(booking.id);
    try {
      await api(`/trips/${tripId}/bookings/${booking.id}/mark-vouchered`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      toastSuccess('Marked vouchered');
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not mark vouchered');
    } finally {
      setVoucheringId(null);
    }
  }

  async function downloadVoucherPdf(booking: Booking) {
    setDownloadingVoucherId(booking.id);
    try {
      const res = await api<{ documentId: string; fileName?: string }>(
        `/trips/${tripId}/bookings/${booking.id}/voucher-pdf`,
        { method: 'POST' },
      );
      const blob = await apiBlob(`/files/${res.documentId}/content`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.fileName ||
        `voucher-${booking.confirmationRef || booking.id.slice(-8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toastSuccess(
        booking.type === 'transfer'
          ? 'Transfer voucher PDF downloaded'
          : booking.type === 'activity'
            ? 'Activity voucher PDF downloaded'
            : 'Hotel voucher PDF downloaded',
      );
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not generate voucher PDF');
    } finally {
      setDownloadingVoucherId(null);
    }
  }

  async function sendEnquiryWhatsapp(booking: Booking) {
    if (!booking.supplier?.phone?.trim()) {
      toastError('Add a phone number on the supplier before sending enquiry');
      return;
    }
    setSendingEnquiryId(booking.id);
    try {
      const res = await api<{
        sent?: boolean;
        cloudConfigured?: boolean;
        fallbackWaMeUrl?: string;
        demo?: boolean;
        message?: string;
        requiresMarkSent?: boolean;
      }>(`/trips/${tripId}/bookings/${booking.id}/send-enquiry-whatsapp`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.sent) {
        toastSuccess(
          res.demo
            ? 'Enquiry marked sent (WhatsApp demo mode)'
            : 'Enquiry sent on WhatsApp',
        );
        setEnquiryMarkSentId(null);
        await load();
        await onChanged();
        return;
      }
      if (res.fallbackWaMeUrl) {
        window.open(res.fallbackWaMeUrl, '_blank', 'noopener,noreferrer');
        setEnquiryMarkSentId(booking.id);
        toastWarning(
          res.message ||
            'Opened WhatsApp — mark enquiry as sent after you send the message',
        );
        return;
      }
      toastError('Could not send enquiry on WhatsApp');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not send enquiry');
    } finally {
      setSendingEnquiryId(null);
    }
  }

  async function markEnquirySent(booking: Booking) {
    setMarkingEnquirySentId(booking.id);
    try {
      await api(`/trips/${tripId}/bookings/${booking.id}/mark-enquiry-sent`, {
        method: 'POST',
      });
      toastSuccess('Enquiry marked as sent');
      setEnquiryMarkSentId(null);
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not mark enquiry sent');
    } finally {
      setMarkingEnquirySentId(null);
    }
  }

  async function sendVouchersWhatsapp() {
    if (!voucherEligibleBookings.length) {
      toastError('Mark at least one booking vouchered before sending');
      return;
    }
    setSendingVouchers(true);
    try {
      const res = await api<{
        sent?: boolean;
        cloudConfigured?: boolean;
        fallbackWaMeUrl?: string;
        demo?: boolean;
        message?: string;
        voucherCount?: number;
        pdfAttachedCount?: number;
        pdfFailedCount?: number;
        pdfSkipped?: number;
        bookingIds?: string[];
      }>(`/trips/${tripId}/send-vouchers-whatsapp`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const n = res.voucherCount ?? voucherEligibleBookings.length;
      const pdfs = res.pdfAttachedCount ?? 0;
      const pdfFail = res.pdfFailedCount ?? 0;
      const pdfSkip = res.pdfSkipped ?? 0;
      if (res.sent) {
        setVouchersWaMarkPending(false);
        setVouchersWaMarkBookingIds([]);
        const pdfBit =
          pdfs > 0
            ? ` · ${pdfs} PDF${pdfs === 1 ? '' : 's'} attached`
            : res.demo
              ? ' · PDFs generated (demo)'
              : '';
        const warnBit =
          pdfFail > 0
            ? ` · ${pdfFail} PDF failed`
            : pdfSkip > 0
              ? ` · ${pdfSkip} PDF skipped (cap)`
              : '';
        toastSuccess(
          res.demo
            ? `Voucher summary marked sent (WhatsApp demo mode) · ${n} voucher${n === 1 ? '' : 's'}${pdfBit}${warnBit}`
            : `Vouchers sent on WhatsApp · ${n} voucher${n === 1 ? '' : 's'}${pdfBit}${warnBit}`,
        );
        return;
      }
      if (res.fallbackWaMeUrl) {
        window.open(res.fallbackWaMeUrl, '_blank', 'noopener,noreferrer');
        setVouchersWaMarkPending(true);
        setVouchersWaMarkBookingIds(
          Array.isArray(res.bookingIds) ? res.bookingIds : [],
        );
        toastWarning(
          res.message ||
            'Opened WhatsApp with the voucher summary — mark as sent after you send it (PDF attach needs Cloud API)',
        );
        return;
      }
      toastError('Could not send vouchers on WhatsApp');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not send vouchers');
    } finally {
      setSendingVouchers(false);
    }
  }

  async function markVouchersWhatsappSent() {
    setMarkingVouchersSent(true);
    try {
      const res = await api<{
        marked?: boolean;
        voucherCount?: number;
      }>(`/trips/${tripId}/mark-vouchers-whatsapp-sent`, {
        method: 'POST',
        body: JSON.stringify({
          channel: 'whatsapp',
          ...(vouchersWaMarkBookingIds.length
            ? { bookingIds: vouchersWaMarkBookingIds }
            : {}),
        }),
      });
      const n = res.voucherCount ?? vouchersWaMarkBookingIds.length;
      setVouchersWaMarkPending(false);
      setVouchersWaMarkBookingIds([]);
      toastSuccess(
        `Voucher WhatsApp marked sent · ${n || voucherEligibleBookings.length} voucher${
          (n || voucherEligibleBookings.length) === 1 ? '' : 's'
        }`,
      );
    } catch (e) {
      toastError(
        e instanceof Error ? e.message : 'Could not mark vouchers as sent',
      );
    } finally {
      setMarkingVouchersSent(false);
    }
  }

  async function sendVouchersEmail() {
    if (!voucherEligibleBookings.length) {
      toastError('Mark at least one booking vouchered before sending');
      return;
    }
    setEmailingVouchers(true);
    try {
      const res = await api<{
        queued?: boolean;
        toEmail?: string;
        voucherCount?: number;
        pdfAttachedCount?: number;
        pdfFailedCount?: number;
        pdfSkipped?: number;
      }>(`/trips/${tripId}/send-vouchers-email`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const n = res.voucherCount ?? voucherEligibleBookings.length;
      const pdfs = res.pdfAttachedCount ?? 0;
      const pdfFail = res.pdfFailedCount ?? 0;
      const pdfSkip = res.pdfSkipped ?? 0;
      const warnBit =
        pdfFail > 0
          ? ` · ${pdfFail} PDF failed`
          : pdfSkip > 0
            ? ` · ${pdfSkip} PDF skipped (cap)`
            : '';
      toastSuccess(
        `Voucher email queued to ${res.toEmail || 'customer'} · ${n} voucher${
          n === 1 ? '' : 's'
        } · ${pdfs} PDF${pdfs === 1 ? '' : 's'}${warnBit}`,
      );
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not email vouchers');
    } finally {
      setEmailingVouchers(false);
    }
  }

  async function openCancelSheet(booking: Booking) {
    setCancelTarget(booking);
    setCancelReason('');
    setCancelPreview(null);
    setCancelCase(null);
    setCancelPreviewLoading(true);
    try {
      const preview = await api<CancelPreview>(
        `/commerce/trips/${tripId}/bookings/${booking.id}/cancellation-preview`,
      );
      setCancelPreview(preview);
      setCancelCase(preview.openCase ?? null);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not load cancel preview');
    } finally {
      setCancelPreviewLoading(false);
    }
  }

  function closeCancelSheet() {
    setCancelTarget(null);
    setCancelPreview(null);
    setCancelCase(null);
    setCancelReason('');
    setCancelAction(null);
  }

  async function createCancellationCaseFromPreview() {
    if (!cancelTarget || !cancelPreview) return;
    setCancelAction('create');
    try {
      const created = await api<CancellationCaseRow>('/commerce/cancellations', {
        method: 'POST',
        body: JSON.stringify({
          tripId,
          scope: 'booking_component',
          reason: cancelReason.trim() || undefined,
          affectedEntitiesJson: [
            { type: 'booking_component', id: cancelTarget.id },
          ],
          applicablePolicySnapshotJson:
            cancelPreview.applicablePolicySnapshotJson ?? undefined,
          serviceStartAt: cancelPreview.serviceStartAt ?? undefined,
          baseAmount: cancelPreview.baseAmount,
          currency: cancelPreview.currency,
          idempotencyKey: `cancel:${cancelTarget.id}:${new Date()
            .toISOString()
            .slice(0, 10)}`,
        }),
      });
      if (created.approvalStatus === 'draft') {
        const requested = await api<CancellationCaseRow>(
          `/commerce/cancellations/${created.id}/request`,
          { method: 'POST' },
        );
        setCancelCase(requested);
      } else {
        setCancelCase(created);
      }
      toastSuccess('Cancellation case requested');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create cancellation case');
    } finally {
      setCancelAction(null);
    }
  }

  async function requestExistingCase() {
    if (!cancelCase) return;
    setCancelAction('request');
    try {
      const updated = await api<CancellationCaseRow>(
        `/commerce/cancellations/${cancelCase.id}/request`,
        { method: 'POST' },
      );
      setCancelCase(updated);
      toastSuccess('Submitted for approval');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not request approval');
    } finally {
      setCancelAction(null);
    }
  }

  async function approveExistingCase() {
    if (!cancelCase) return;
    setCancelAction('approve');
    try {
      const updated = await api<CancellationCaseRow>(
        `/commerce/cancellations/${cancelCase.id}/approve`,
        { method: 'POST' },
      );
      setCancelCase(updated);
      toastSuccess('Cancellation approved');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not approve');
    } finally {
      setCancelAction(null);
    }
  }

  async function applyCaseAndCancelBooking() {
    if (!cancelTarget || !cancelCase) return;
    setCancelAction('apply');
    try {
      if (cancelCase.approvalStatus !== 'approved') {
        await api(`/commerce/cancellations/${cancelCase.id}/approve`, {
          method: 'POST',
        });
      }
      const applied = await api<{
        creditNoteId?: string | null;
        creditNoteAmount?: number | null;
        creditNoteAllocatedToDocumentId?: string | null;
        creditNoteAllocatedAmount?: number | null;
        currency?: string;
      }>(`/commerce/cancellations/${cancelCase.id}/apply`, {
        method: 'POST',
      });
      // Ops cascade (payments/invoices) — apply already cancels booking_component
      try {
        await api(`/trips/${tripId}/bookings/${cancelTarget.id}/cancel`, {
          method: 'POST',
        });
      } catch {
        /* booking may already be cancelled by commerce apply */
      }
      const refund =
        applied.creditNoteAmount != null && applied.creditNoteAmount > 0
          ? applied.creditNoteAmount
          : null;
      const allocated =
        applied.creditNoteAllocatedToDocumentId &&
        applied.creditNoteAllocatedAmount != null &&
        applied.creditNoteAllocatedAmount > 0;
      toastSuccess(
        refund != null
          ? allocated
            ? `Cancellation applied · booking cancelled · credit note allocated (${formatCurrency(
                applied.creditNoteAllocatedAmount!,
                applied.currency || 'INR',
              )} to receivable) — settle cash refund in Changes if due`
            : `Cancellation applied · booking cancelled · credit note drafted (${formatCurrency(
                refund,
                applied.currency || 'INR',
              )}) — settle in Changes when receivable exists`
          : 'Cancellation applied · booking cancelled',
      );
      closeCancelSheet();
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not apply cancellation');
    } finally {
      setCancelAction(null);
    }
  }

  async function confirmCancelBooking() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await api<{
        cascaded?: { cancelledPayments: number; cancelledInvoices: number };
      }>(`/trips/${tripId}/bookings/${cancelTarget.id}/cancel`, { method: 'POST' });
      const payments = res.cascaded?.cancelledPayments ?? 0;
      const invoices = res.cascaded?.cancelledInvoices ?? 0;
      const extra =
        payments || invoices
          ? ` · cleared ${payments} unpaid payment${payments === 1 ? '' : 's'}, ${invoices} open invoice${invoices === 1 ? '' : 's'}`
          : '';
      toastSuccess(`Booking cancelled without policy case${extra}`);
      closeCancelSheet();
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not cancel booking');
    } finally {
      setCancelling(false);
    }
  }

  async function confirmDeleteBooking() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/trips/${tripId}/bookings/${deleteTarget.id}`, { method: 'DELETE' });
      toastSuccess('Booking deleted');
      setDeleteTarget(null);
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not delete booking');
    } finally {
      setDeleting(false);
    }
  }

  async function linkCommerceRequest(booking: Booking) {
    setLinkingSrId(booking.id);
    try {
      await api(`/commerce/bookings/${booking.id}/ensure-service-request`, {
        method: 'POST',
      });
      toastSuccess('Commerce service request linked');
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not link commerce request');
    } finally {
      setLinkingSrId(null);
    }
  }

  async function negotiateExtraSupplier(booking: Booking) {
    setLinkingSrId(booking.id);
    try {
      await api(`/commerce/bookings/${booking.id}/ensure-service-request`, {
        method: 'POST',
      });
      await api(`/commerce/bookings/${booking.id}/negotiate`, {
        method: 'POST',
        body: JSON.stringify({
          supplierId: booking.supplierId || undefined,
          notes: 'Additional RFQ',
        }),
      });
      toastSuccess('Extra supplier RFQ created');
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create RFQ');
    } finally {
      setLinkingSrId(null);
    }
  }

  async function toggleItem(itemId: string, done: boolean) {
    try {
      await api(`/trips/${tripId}/readiness/${itemId}`, {
        method: 'POST',
        body: JSON.stringify({ done }),
      });
      await load();
      await onChanged();
      if (done) toastSuccess('Checklist updated');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update checklist');
    }
  }

  const confirmCue = confirmTarget
    ? opsConfirmCueFromBooking(confirmTarget)
    : null;
  const confirmServiceCue = confirmTarget
    ? partnerInboundServiceCue(confirmTarget.type, confirmCue)
    : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-sm">
            <div className="text-muted-foreground">Bookings open</div>
            <div className="text-lg font-semibold tabular-nums">
              {openBookings}
              <span className="text-sm font-normal text-muted-foreground">
                {' '}
                / {bookings.length}
              </span>
            </div>
            {openHotelEnquiries > 0 ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {openHotelEnquiries} hotel enquir
                {openHotelEnquiries === 1 ? 'y' : 'ies'} open
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-sm">
            <div className="text-muted-foreground">Readiness</div>
            <div className="text-lg font-semibold tabular-nums">
              {readinessDone}
              <span className="text-sm font-normal text-muted-foreground">
                {' '}
                / {readinessTotal || '—'}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-sm">
            <div className="text-muted-foreground">Trip status</div>
            <div className="mt-1">
              <StatusBadge value={status} showIcon size="md" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <strong className="text-sm">Booking components</strong>
                <p className="text-xs text-muted-foreground">
                  Quote → enquiry → confirm (schedules payable) → mark vouchered. Pipeline shows
                  on every hotel booking from an accepted quote.
                </p>
                {vouchersWaMarkPending ? (
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                    WhatsApp opened with the voucher summary — mark as sent after you send it so
                    the trip timeline stays accurate.
                  </p>
                ) : null}
              </div>
              {bookings.length ? (
                <Can anyOf={CAP.tripWrite}>
                  <div className="flex flex-wrap gap-2">
                    {voucherEligibleBookings.length ? (
                      <>
                        {vouchersWaMarkPending ? (
                          <Button
                            size="sm"
                            variant="default"
                            disabled={markingVouchersSent}
                            onClick={() => void markVouchersWhatsappSent()}
                          >
                            {markingVouchersSent ? '…' : 'Mark vouchers sent'}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={sendingVouchers}
                            onClick={() => void sendVouchersWhatsapp()}
                          >
                            {sendingVouchers
                              ? '…'
                              : `WhatsApp vouchers${
                                  voucherEligibleBookings.length > 1
                                    ? ` (${voucherEligibleBookings.length})`
                                    : ''
                                }`}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={emailingVouchers || vouchersWaMarkPending}
                          onClick={() => void sendVouchersEmail()}
                        >
                          {emailingVouchers
                            ? '…'
                            : `Email vouchers${
                                voucherEligibleBookings.length > 1
                                  ? ` (${voucherEligibleBookings.length})`
                                  : ''
                              }`}
                        </Button>
                      </>
                    ) : null}
                    {!quoteSourcedHotels.length ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={materializing}
                        onClick={() => void materializeFromQuote()}
                      >
                        {materializing ? 'Linking…' : 'From accepted quote'}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      onClick={() => {
                        setForm(emptyBookingForm());
                        setNetworkPick('');
                        setAddOpen(true);
                      }}
                    >
                      Add booking
                    </Button>
                  </div>
                </Can>
              ) : null}
            </div>
            <ul className="space-y-2">
              {bookings.map((b) => {
                const serviceStatus = resolveBookingServiceStatus(b);
                return (
                <li
                  key={b.id}
                  id={`ops-booking-${b.id}`}
                  className={cn(
                    'space-y-2 rounded-xl border px-3 py-2.5 text-sm glass-row',
                    focusBookingId === b.id &&
                      'border-primary/50 ring-2 ring-primary/20',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium leading-snug">{b.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <StatusBadge
                          value={b.type}
                          label={BOOKING_TYPES.find((t) => t.value === b.type)?.label || b.type}
                          showIcon={false}
                        />
                        {b.quotationLineId ? (
                          <StatusBadge value="from_quote" label="From quote" showIcon={false} />
                        ) : null}
                        {b.supplier && !b.title.includes(b.supplier.name) ? (
                          <span>· {b.supplier.name}</span>
                        ) : null}
                        {b.confirmationRef ? <span>· {b.confirmationRef}</span> : null}
                        {partnerConfirmByBookingId.has(b.id) ? (
                          <StatusBadge
                            value="partner_confirmation"
                            label="Partner file"
                            showIcon={false}
                          />
                        ) : null}
                        {b.costAmount != null && b.costAmount !== '' ? (
                          <span>
                            ·{' '}
                            {formatCurrency(b.costAmount, {
                              maximumFractionDigits: 0,
                            })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <StatusBadge
                      className="shrink-0"
                      value={serviceStatus.key}
                      label={serviceStatus.label}
                    />
                  </div>
                  {(b.type === 'hotel' ||
                    b.type === 'transfer' ||
                    b.type === 'activity') &&
                  b.quotationLineId ? (
                    <HotelChainPipeline booking={b} />
                  ) : null}
                  <div className="flex flex-wrap items-center gap-1.5">
                      {partnerConfirmByBookingId.get(b.id) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            downloadingPartnerConfirmId ===
                            partnerConfirmByBookingId.get(b.id)!.id
                          }
                          onClick={() =>
                            void downloadPartnerConfirmation(
                              partnerConfirmByBookingId.get(b.id)!,
                            )
                          }
                        >
                          {downloadingPartnerConfirmId ===
                          partnerConfirmByBookingId.get(b.id)!.id
                            ? '…'
                            : 'Partner file'}
                        </Button>
                      ) : null}
                  {canWrite ? (
                    <>
                      {b.status !== 'cancelled' ? (
                        <Button size="sm" variant="secondary" onClick={() => openEdit(b)}>
                          Edit
                        </Button>
                      ) : null}
                      {(b.type === 'hotel' ||
                        b.type === 'transfer' ||
                        b.type === 'activity') &&
                      b.status !== 'confirmed' &&
                      b.status !== 'cancelled' &&
                      b.status !== 'rejected' ? (
                        enquiryMarkSentId === b.id ? (
                          <Button
                            size="sm"
                            variant="default"
                            disabled={markingEnquirySentId === b.id}
                            onClick={() => void markEnquirySent(b)}
                          >
                            {markingEnquirySentId === b.id ? '…' : 'Mark enquiry sent'}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={sendingEnquiryId === b.id}
                            onClick={() => void sendEnquiryWhatsapp(b)}
                          >
                            {sendingEnquiryId === b.id ? '…' : 'Send enquiry'}
                          </Button>
                        )
                      ) : null}
                      {b.status !== 'confirmed' && b.status !== 'cancelled' ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void quickConfirm(b)}
                          >
                            Confirm
                          </Button>
                          {!b.quotationLineId ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={linkingSrId === b.id}
                                onClick={() => void linkCommerceRequest(b)}
                              >
                                {linkingSrId === b.id ? 'Linking…' : 'Link commerce request'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={linkingSrId === b.id}
                                onClick={() => void negotiateExtraSupplier(b)}
                              >
                                Add RFQ
                              </Button>
                            </>
                          ) : null}
                        </>
                      ) : null}
                      {b.status === 'confirmed' && !b.voucherNote?.trim() ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={voucheringId === b.id}
                          onClick={() => void markVouchered(b)}
                        >
                          {voucheringId === b.id ? '…' : 'Mark vouchered'}
                        </Button>
                      ) : null}
                      {(b.type === 'hotel' ||
                        b.type === 'transfer' ||
                        b.type === 'activity') &&
                      b.status === 'confirmed' &&
                      b.voucherNote?.trim() ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={downloadingVoucherId === b.id}
                          onClick={() => void downloadVoucherPdf(b)}
                        >
                          {downloadingVoucherId === b.id
                            ? '…'
                            : 'Download voucher'}
                        </Button>
                      ) : null}
                      {b.status === 'confirmed' && b.invoices?.length && onOpenFinance ? (
                        <Button size="sm" variant="ghost" onClick={() => onOpenFinance()}>
                          View payable
                        </Button>
                      ) : null}
                      {b.status !== 'cancelled' ? (
                        <Button size="sm" variant="outline" onClick={() => void openCancelSheet(b)}>
                          Cancel
                        </Button>
                      ) : null}
                      {b.status === 'pending' || b.status === 'requested' ? (
                        <Button size="sm" variant="outline" onClick={() => setDeleteTarget(b)}>
                          Delete
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                  </div>
                </li>
                );
              })}
              {!bookings.length ? (
                <div className="rounded-xl border border-dashed px-4 py-6 text-center glass-well">
                  <p className="text-sm font-medium">No bookings yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    After a quote is accepted, hotel lines appear here automatically — or create
                    from the accepted quote / add manually.
                  </p>
                  <Can anyOf={CAP.tripWrite}>
                    <div className="mt-3 flex flex-wrap justify-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={materializing}
                        onClick={() => void materializeFromQuote()}
                      >
                        {materializing ? 'Linking…' : 'Create from accepted quote'}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setForm(emptyBookingForm());
                          setAddOpen(true);
                        }}
                      >
                        Add first booking
                      </Button>
                    </div>
                  </Can>
                </div>
              ) : null}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <strong className="text-sm">Readiness checklist</strong>
                <p className="text-xs text-muted-foreground">
                  Completing all items moves the trip to Ready to travel.
                </p>
              </div>
              {readiness?.allDone ? (
                <StatusBadge value="ready_to_travel" label="Complete" tone="success" />
              ) : (
                <StatusBadge
                  value="pending"
                  label={`${readinessDone}/${readinessTotal || 0}`}
                  tone="warn"
                />
              )}
            </div>
            <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border glass-row">
              {(readiness?.items || []).map((item) => {
                const isBalance = /customer balance/i.test(item.label);
                const isBookings = /bookings confirmed/i.test(item.label);
                return (
                  <li key={item.id} className="px-3 py-2.5">
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                      <Checkbox
                        className="mt-0.5"
                        checked={item.done}
                        disabled={!canWrite}
                        onCheckedChange={(checked) =>
                          void toggleItem(item.id, checked === true)
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className={item.done ? 'text-muted-foreground line-through' : ''}>
                          {item.label}
                        </span>
                        {isBalance && !item.done ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Check collections on{' '}
                            <Link
                              className="text-primary hover:underline"
                              to={`/trips/${tripId}?tab=finance`}
                            >
                              Finance
                            </Link>
                            .
                          </span>
                        ) : null}
                        {isBookings && !item.done && openBookings > 0 ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {openBookings} booking{openBookings === 1 ? '' : 's'} still open.
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <RecordSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add booking"
        description="Track a supplier booking component for this trip."
        submitLabel="Add booking"
        submitting={submitting}
        onSubmit={saveNewBooking}
      >
        <FormField label="Type">
          <SuggestionChips
            aria-label="Booking type"
            allowDeselect={false}
            options={BOOKING_TYPES}
            value={form.type}
            onChange={(type) => setForm((f) => ({ ...f, type }))}
          />
        </FormField>
        <FormField label="Title" required>
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Hotel Taj check-in"
          />
        </FormField>
        <FormField label="From network (followed)">
          <Combobox
            options={[
              { value: '', label: 'None', icon: CircleSlash },
              ...networkPartners.map((p) => ({
                value: p.organizationId,
                label: `${p.name}${p.city ? ` · ${p.city}` : ''}`,
                description: p.kind.replace(/_/g, ' '),
                icon: Network,
              })),
            ]}
            value={networkPick}
            onChange={(value) => {
              setNetworkPick(value);
              if (value) {
                setForm((f) => ({ ...f, supplierId: '', supplierName: '' }));
              }
            }}
            placeholder="None"
            searchable
            searchPlaceholder="Search network partner…"
          />
        </FormField>
        <FormField label="Existing supplier">
          <Combobox
            options={[
              { value: '', label: 'None / create new below', icon: CircleSlash },
              ...suppliers.map((s) => ({
                value: s.id,
                label: s.name,
                description: s.linkedOrganization ? 'Network linked' : undefined,
                icon: Building2,
              })),
            ]}
            value={form.supplierId}
            disabled={Boolean(networkPick)}
            onChange={(supplierId) => {
              setNetworkPick('');
              setForm((f) => ({ ...f, supplierId, supplierName: '' }));
            }}
            placeholder="None / create new below"
            searchable
            searchPlaceholder="Search supplier…"
          />
        </FormField>
        {!form.supplierId && !networkPick ? (
          <FormField label="Or new supplier name">
            <Input
              value={form.supplierName}
              onChange={(e) => setForm((f) => ({ ...f, supplierName: e.target.value }))}
              placeholder="Creates supplier if new"
            />
          </FormField>
        ) : null}
        <FormField label="Est. cost (optional)">
          <PriceField
            value={form.costAmount}
            onChange={(costAmount) => setForm((f) => ({ ...f, costAmount }))}
            placeholder="0"
          />
        </FormField>
        {form.type === 'transfer' ? (
          <>
            <FormField label="Movement date">
              <DatePicker
                value={parseDateInput(form.startAt)}
                onChange={(d) =>
                  setForm((f) => ({ ...f, startAt: formatDateInput(d) }))
                }
              />
            </FormField>
            <FormField label="End date (optional)">
              <DatePicker
                value={parseDateInput(form.endAt)}
                onChange={(d) =>
                  setForm((f) => ({ ...f, endAt: formatDateInput(d) }))
                }
              />
            </FormField>
            <FormField label="Assigned driver / fleet">
              <Combobox
                options={[
                  { value: '', label: 'Unassigned', icon: CircleSlash },
                  ...driverSuppliers.map((s) => ({
                    value: s.id,
                    label: s.name,
                    description: s.type || undefined,
                    icon: Building2,
                  })),
                ]}
                value={form.driverSupplierId}
                onChange={(driverSupplierId) =>
                  setForm((f) => ({
                    ...f,
                    driverSupplierId,
                    fleetUnitId: '',
                  }))
                }
                placeholder="Unassigned"
                searchable
                searchPlaceholder="Search driver or fleet…"
              />
            </FormField>
            {selectedDriverAssetId ? (
              <FormField
                label="Fleet unit"
                description="Pick a plate from the linked fleet. Conflicts show on the Movement board."
              >
                <Combobox
                  options={[
                    { value: '', label: 'No unit', icon: CircleSlash },
                    ...fleetUnits.map((u) => ({
                      value: u.id,
                      label: fleetUnitLabel(u),
                      description: u.seats != null ? `${u.seats} seats` : undefined,
                      icon: Building2,
                    })),
                  ]}
                  value={form.fleetUnitId}
                  onChange={(fleetUnitId) => {
                    const unit = fleetUnits.find((u) => u.id === fleetUnitId);
                    setForm((f) => ({
                      ...f,
                      fleetUnitId,
                      vehicleLabel: unit
                        ? fleetUnitLabel(unit)
                        : f.vehicleLabel,
                    }));
                  }}
                  placeholder="No unit"
                  searchable
                  searchPlaceholder="Search vehicle…"
                />
              </FormField>
            ) : null}
            <FormField label="Vehicle label (optional)">
              <Input
                value={form.vehicleLabel}
                onChange={(e) =>
                  setForm((f) => ({ ...f, vehicleLabel: e.target.value }))
                }
                placeholder="e.g. Innova · WB-02-AB-1234"
              />
            </FormField>
          </>
        ) : null}
      </RecordSheet>

      <RecordSheet
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditingId(null);
            setPartnerConfirmDocs([]);
          }
        }}
        title="Edit booking"
        description="Update confirmation details and service status (unrequested → enquiry → confirmed / cancelled). Derived labels like payment pending / voucher pending appear on the list after confirm."
        submitLabel="Save booking"
        submitting={submitting}
        onSubmit={saveEditBooking}
      >
        <FormField label="Type">
          <SuggestionChips
            aria-label="Booking type"
            allowDeselect={false}
            options={BOOKING_TYPES}
            value={form.type}
            onChange={(type) => setForm((f) => ({ ...f, type }))}
          />
        </FormField>
        <FormField label="Title" required>
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </FormField>
        <FormField label="Status">
          <SuggestionChips
            aria-label="Booking status"
            allowDeselect={false}
            options={BOOKING_STATUSES}
            value={form.status}
            onChange={(status) => setForm((f) => ({ ...f, status }))}
          />
        </FormField>
        <FormGrid>
          <FormField label="Confirmation ref">
            <Input
              value={form.confirmationRef}
              onChange={(e) => setForm((f) => ({ ...f, confirmationRef: e.target.value }))}
              placeholder="PNR / hotel conf #"
            />
          </FormField>
          <FormField label="Est. cost">
            <PriceField
              value={form.costAmount}
              onChange={(costAmount) => setForm((f) => ({ ...f, costAmount }))}
              placeholder="0"
            />
          </FormField>
        </FormGrid>
        {form.type === 'hotel' ? (
          <FormField
            label="Rooms"
            description="Synced to allotment quantity when confirmed (if capacity allows)."
          >
            <NumberField
              value={form.rooms}
              onChange={(rooms) => setForm((f) => ({ ...f, rooms }))}
              min={1}
              max={50}
              placeholder="1"
            />
          </FormField>
        ) : null}
        <FormField label="Supplier">
          <Combobox
            options={[
              { value: '', label: 'None', icon: CircleSlash },
              ...suppliers.map((s) => ({
                value: s.id,
                label: s.name,
                icon: Building2,
              })),
            ]}
            value={form.supplierId}
            onChange={(supplierId) =>
              setForm((f) => ({
                ...f,
                supplierId,
                roomProductId: '',
              }))
            }
            placeholder="None"
            searchable
            searchPlaceholder="Search supplier…"
          />
        </FormField>
        {form.type === 'hotel' && selectedHotelAssetId ? (
          <FormField
            label="Room product"
            description="Synced to allotment when confirmed/requested (if capacity allows)."
          >
            <Combobox
              options={[
                { value: '', label: 'Any / auto', icon: CircleSlash },
                ...roomProducts.map((r) => ({
                  value: r.id,
                  label: r.name,
                  icon: Building2,
                })),
              ]}
              value={form.roomProductId}
              onChange={(roomProductId) =>
                setForm((f) => ({ ...f, roomProductId }))
              }
              placeholder="Any / auto"
              searchable
              searchPlaceholder="Search room product…"
            />
          </FormField>
        ) : null}
        {form.type === 'transfer' ? (
          <>
            <FormGrid>
              <FormField label="Movement date">
                <DatePicker
                  value={parseDateInput(form.startAt)}
                  onChange={(d) =>
                    setForm((f) => ({ ...f, startAt: formatDateInput(d) }))
                  }
                />
              </FormField>
              <FormField label="End date (optional)">
                <DatePicker
                  value={parseDateInput(form.endAt)}
                  onChange={(d) =>
                    setForm((f) => ({ ...f, endAt: formatDateInput(d) }))
                  }
                />
              </FormField>
            </FormGrid>
            <FormField label="Assigned driver / fleet">
              <Combobox
                options={[
                  { value: '', label: 'Unassigned', icon: CircleSlash },
                  ...driverSuppliers.map((s) => ({
                    value: s.id,
                    label: s.name,
                    description: s.type || undefined,
                    icon: Building2,
                  })),
                ]}
                value={form.driverSupplierId}
                onChange={(driverSupplierId) =>
                  setForm((f) => ({
                    ...f,
                    driverSupplierId,
                    fleetUnitId: '',
                  }))
                }
                placeholder="Unassigned"
                searchable
                searchPlaceholder="Search driver or fleet…"
              />
            </FormField>
            {selectedDriverAssetId ? (
              <FormField
                label="Fleet unit"
                description="Pick a plate from the linked fleet. Conflicts show on the Movement board."
              >
                <Combobox
                  options={[
                    { value: '', label: 'No unit', icon: CircleSlash },
                    ...fleetUnits.map((u) => ({
                      value: u.id,
                      label: fleetUnitLabel(u),
                      description: u.seats != null ? `${u.seats} seats` : undefined,
                      icon: Building2,
                    })),
                  ]}
                  value={form.fleetUnitId}
                  onChange={(fleetUnitId) => {
                    const unit = fleetUnits.find((u) => u.id === fleetUnitId);
                    setForm((f) => ({
                      ...f,
                      fleetUnitId,
                      vehicleLabel: unit
                        ? fleetUnitLabel(unit)
                        : f.vehicleLabel,
                    }));
                  }}
                  placeholder="No unit"
                  searchable
                  searchPlaceholder="Search vehicle…"
                />
              </FormField>
            ) : null}
            <FormField label="Vehicle label (optional)">
              <Input
                value={form.vehicleLabel}
                onChange={(e) =>
                  setForm((f) => ({ ...f, vehicleLabel: e.target.value }))
                }
                placeholder="e.g. Innova · WB-02-AB-1234"
              />
            </FormField>
          </>
        ) : null}
        <FormField
          label="Partner confirmation"
          description="Files the supplier attached when confirming inbound (agency copy)."
        >
          {partnerConfirmDocsLoading ? (
            <div className="space-y-1.5" role="status" aria-busy="true">
              <span className="sr-only">Loading</span>
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-8 w-5/6 rounded-lg" />
            </div>
          ) : partnerConfirmDocs.length ? (
            <ul className="space-y-1.5">
              {partnerConfirmDocs.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate">{doc.name}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0"
                    disabled={downloadingPartnerConfirmId === doc.id}
                    onClick={() => void downloadPartnerConfirmation(doc)}
                  >
                    {downloadingPartnerConfirmId === doc.id ? '…' : 'Download'}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No partner confirmation file yet.
            </p>
          )}
        </FormField>
        <FormField
          label="Internal voucher note"
          description="Marks the booking vouchered for ops. Use Download voucher for the customer PDF."
        >
          <Input
            value={form.voucherNote}
            onChange={(e) => setForm((f) => ({ ...f, voucherNote: e.target.value }))}
            placeholder="Issued / pending details"
          />
        </FormField>
      </RecordSheet>

      <RecordSheet
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) closeCancelSheet();
        }}
        title={cancelTarget ? `Cancel “${cancelTarget.title}”` : 'Cancel booking'}
        description="Preview cancellation fees from the quote stamp or supplier contract, then request approval before applying."
        hideFooter
        size="wide"
      >
        {cancelPreviewLoading ? (
          <div className="space-y-2" role="status" aria-busy="true">
            <span className="sr-only">Loading</span>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : cancelPreview ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  value={
                    cancelPreview.policySource === 'none'
                      ? 'draft'
                      : cancelPreview.policySource === 'quote_line'
                        ? 'confirmed'
                        : 'requested'
                  }
                  label={
                    cancelPreview.policySource === 'quote_line'
                      ? 'Quote policy'
                      : cancelPreview.policySource === 'supplier_contract'
                        ? 'Contract policy'
                        : 'No policy'
                  }
                />
                <span className="text-muted-foreground">
                  Base{' '}
                  {formatCurrency(
                    cancelPreview.baseAmount,
                    cancelPreview.currency,
                  )}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Customer charge
                  </div>
                  <div className="font-medium">
                    {formatCurrency(
                      cancelPreview.evaluation.customerCharge,
                      cancelPreview.currency,
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Expected refund
                  </div>
                  <div className="font-medium">
                    {formatCurrency(
                      cancelPreview.evaluation.expectedRefund,
                      cancelPreview.currency,
                    )}
                  </div>
                </div>
              </div>
              {cancelPreview.evaluation.humanExplanation.length ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                  {cancelPreview.evaluation.humanExplanation.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            {cancelCase ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Case</span>
                <StatusBadge value={cancelCase.approvalStatus} />
                <StatusBadge
                  value={cancelCase.executionStatus}
                  label={`exec: ${cancelCase.executionStatus}`}
                />
              </div>
            ) : (
              <FormField label="Reason (optional)">
                <Input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Guest requested / date change / …"
                />
              </FormField>
            )}

            <div className="flex flex-wrap gap-2">
              {!cancelCase ? (
                <Button
                  disabled={Boolean(cancelAction)}
                  onClick={() => void createCancellationCaseFromPreview()}
                >
                  {cancelAction === 'create' ? '…' : 'Request cancellation'}
                </Button>
              ) : null}
              {cancelCase?.approvalStatus === 'draft' ? (
                <Button
                  disabled={Boolean(cancelAction)}
                  onClick={() => void requestExistingCase()}
                >
                  {cancelAction === 'request' ? '…' : 'Submit for approval'}
                </Button>
              ) : null}
              {cancelCase?.approvalStatus === 'awaiting_approval' ? (
                <Button
                  disabled={Boolean(cancelAction)}
                  onClick={() => void approveExistingCase()}
                >
                  {cancelAction === 'approve' ? '…' : 'Approve'}
                </Button>
              ) : null}
              {cancelCase &&
              (cancelCase.approvalStatus === 'approved' ||
                cancelCase.approvalStatus === 'awaiting_approval') &&
              cancelCase.executionStatus === 'pending' ? (
                <Button
                  variant="secondary"
                  disabled={Boolean(cancelAction)}
                  onClick={() => void applyCaseAndCancelBooking()}
                >
                  {cancelAction === 'apply' ? '…' : 'Apply & cancel booking'}
                </Button>
              ) : null}
              <Button
                variant="outline"
                disabled={cancelling || Boolean(cancelAction)}
                onClick={() => void confirmCancelBooking()}
              >
                {cancelling ? '…' : 'Cancel without policy case'}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Could not load a fee preview. You can still cancel without a policy
            case.
          </p>
        )}
      </RecordSheet>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={deleteTarget ? `Delete “${deleteTarget.title}”?` : 'Delete booking?'}
        description="This permanently removes the booking. Confirmed or finance-linked bookings must be cancelled instead."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={() => void confirmDeleteBooking()}
      />

      <RecordSheet
        open={Boolean(confirmTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmTarget(null);
            setConfirmRef('');
          }
        }}
        title={confirmTarget ? `Confirm “${confirmTarget.title}”?` : 'Confirm booking'}
        description={
          confirmTarget
            ? opsBookingConfirmDescription(confirmTarget.type)
            : opsBookingConfirmDescription('hotel')
        }
        submitLabel="Confirm booking"
        submitting={confirming}
        onSubmit={() => void submitConfirm()}
      >
        <FormField label="Confirmation reference" required>
          <Input
            value={confirmRef}
            onChange={(e) => setConfirmRef(e.target.value)}
            placeholder={
              confirmTarget
                ? opsBookingConfirmPlaceholder(confirmTarget.type)
                : opsBookingConfirmPlaceholder('hotel')
            }
            autoFocus
          />
        </FormField>
        {confirmTarget?.type === 'transfer' && confirmCue?.capacityNote ? (
          <div
            className={
              confirmCue.capacityWarn
                ? 'rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100'
                : 'rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground'
            }
          >
            {confirmCue.capacityNote}
            {confirmCue.capacityWarn
              ? ' Confirm still allowed — raise vehicles if needed.'
              : ''}
          </div>
        ) : null}
        {confirmTarget ? (
          <p className="text-xs text-muted-foreground">
            <StatusBadge
              value={confirmTarget.type}
              label={partnerInboundTypeLabel(confirmTarget.type)}
              showIcon={false}
              className="mr-1.5 align-middle"
            />
            {confirmServiceCue}
          </p>
        ) : null}
        {confirmTarget?.costAmount != null && confirmTarget.costAmount !== '' ? (
          <p className="text-xs text-muted-foreground">
            Payable amount ≈{' '}
            {formatCurrency(confirmTarget.confirmedAmount ?? confirmTarget.costAmount, {
              maximumFractionDigits: 0,
            })}
            {onOpenFinance ? (
              <>
                {' '}
                · after confirm, open{' '}
                <button
                  type="button"
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={() => onOpenFinance()}
                >
                  Finance
                </button>
              </>
            ) : null}
          </p>
        ) : null}
      </RecordSheet>
    </div>
  );
}

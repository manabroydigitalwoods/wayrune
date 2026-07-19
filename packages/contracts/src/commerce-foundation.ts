/**
 * Multi-Organization Commerce Foundation — canonical shared contracts.
 * Source of truth for lifecycles, vocabularies, money/time, and AI-ready data rules.
 * Vertical extensions compose on these primitives; do not fork per org kind.
 */
import { z } from 'zod';
import { blankToNull, blankToUndefined, RequiredText } from './fields';

// ─── Visibility & provenance ───────────────────────────────────────────

export const VisibilityScopeSchema = z.enum([
  'private',
  'transaction',
  'public_portfolio',
  'platform',
]);

export const ProvenanceSourceTypeSchema = z.enum([
  'PLATFORM',
  'ORGANIZATION',
  'PARTNER',
  'CUSTOMER',
  'EMPLOYEE',
  'IMPORT',
  'SYSTEM',
  'AI',
]);

export const ProvenanceSchema = z.object({
  sourceType: ProvenanceSourceTypeSchema,
  sourceId: z.string().nullable().optional(),
  capturedAt: z.string().datetime().optional(),
  verifiedAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  createdBy: z.string().nullable().optional(),
});

/** Immutable commercial/policy capture at confirm time. */
export const CommercialSnapshotSchema = z.object({
  sourceProductId: z.string().nullable().optional(),
  productName: z.string().optional(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  currency: z.string().length(3).optional(),
  taxes: z.unknown().optional(),
  inclusions: z.array(z.string()).optional(),
  policyText: z.string().optional(),
  cancellationTerms: z.unknown().optional(),
  guestCount: z.number().int().optional(),
  mealPlan: z.string().nullable().optional(),
  capturedAt: z.string().datetime(),
});

// ─── Money & time ──────────────────────────────────────────────────────

export const MoneyAmountSchema = z.object({
  amount: z.number(),
  currency: z.string().length(3),
});

export const TimeBoundsSchema = z.object({
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  timezone: z.string().optional(),
  durationMinutes: z.number().int().nonnegative().nullable().optional(),
});

// ─── Multi-status (kept separate on purpose) ───────────────────────────

export const PlanningStatusSchema = z.enum([
  'draft',
  'suggested',
  'selected',
  'quoted',
  'approved',
  'rejected',
]);

export const AvailabilityStatusSchema = z.enum([
  'unknown',
  'available',
  'held',
  'reserved',
  'blocked',
  'sold_out',
]);

export const ReservationStatusSchema = z.enum([
  'draft',
  'requested',
  'tentative',
  'held',
  'confirmed',
  'in_service',
  'completed',
  'cancelled',
  'expired',
  'rejected',
  'no_show',
]);

export const PaymentStatusSchema = z.enum([
  'none',
  'scheduled',
  'partial',
  'paid',
  'overdue',
  'refunded',
  'cancelled',
]);

export const OperationsStatusSchema = z.enum([
  'not_started',
  'ready',
  'in_progress',
  'blocked',
  'completed',
  'failed',
]);

// ─── Controlled vocabularies ───────────────────────────────────────────

export const DietaryTypeSchema = z.enum([
  'VEGETARIAN',
  'NON_VEGETARIAN',
  'VEGAN',
  'JAIN',
  'HALAL',
  'GLUTEN_FREE',
  'OTHER',
]);

export const MealPlanSchema = z.enum([
  'ROOM_ONLY',
  'BREAKFAST',
  'HALF_BOARD',
  'FULL_BOARD',
  'ALL_INCLUSIVE',
  'CUSTOM',
]);

export const ReservationSourceSchema = z.enum([
  'walk_in',
  'phone',
  'website',
  'agency',
  'agency_inbound',
  'ota',
  'corporate',
  'network',
  'manual',
  'other',
]);

export const IncidentCategorySchema = z.enum([
  'driver_late',
  'room_unavailable',
  'meal_issue',
  'vehicle_breakdown',
  'permit',
  'supplier_no_show',
  'traveller_emergency',
  'weather',
  'other',
]);

export const IncidentSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const CancelReasonSchema = z.enum([
  'customer_request',
  'supplier_unavailable',
  'force_majeure',
  'no_show',
  'payment_failure',
  'duplicate',
  'other',
]);

export const LeadLostReasonSchema = z.enum([
  'price',
  'competitor',
  'dates_unavailable',
  'no_response',
  'not_ready',
  'other',
]);

export const PartyContextRoleSchema = z.enum([
  'traveller',
  'guest',
  'diner',
  'supplier',
  'agency',
  'corporate_client',
  'driver',
  'property_owner',
  'contact',
]);

export const ServiceTypeSchema = z.enum([
  'STAY',
  'MEAL',
  'TRANSFER',
  'ACTIVITY',
  'GUIDE',
  'OTHER',
]);

export const PolicyTypeSchema = z.enum([
  'cancellation',
  'refund',
  'no_show',
  'child',
  'extra_guest',
  'check_in_out',
  'pet',
  'meal',
  'damage',
  'date_modification',
  'advance_payment',
  'house_rules',
  'other',
]);

export const DocumentTypeSchema = z.enum([
  'proposal',
  'quotation',
  'invoice',
  'receipt',
  'voucher',
  'confirmation',
  'cancellation_note',
  'guest_registration',
  'menu',
  'rate_sheet',
  'contract',
  'supplier_agreement',
  'identity',
  'permit',
  'waiver',
  'other',
]);

export const DomainEventTypeSchema = z.enum([
  'LeadCreated',
  'InquiryQualified',
  'TripCreated',
  'ProposalSent',
  'ProposalApproved',
  'ServiceRequested',
  'AvailabilityHeld',
  'ReservationConfirmed',
  'ReservationCancelled',
  'PaymentReceived',
  'GuestCheckedIn',
  'RoomMarkedReady',
  'MealServiceCompleted',
  'IncidentReported',
  'TripCompleted',
  'TripClosed',
  'ReviewSubmitted',
  'PolicyAttached',
  'ConversationMessagePosted',
]);

// ─── Availability bucket (generic) ─────────────────────────────────────

export const AvailabilityBucketSchema = z.object({
  organizationId: z.string().min(1),
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  capacity: z.number().int().nonnegative(),
  held: z.number().int().nonnegative().default(0),
  reserved: z.number().int().nonnegative().default(0),
  blocked: z.number().int().nonnegative().default(0),
  available: z.number().int().optional(),
  status: AvailabilityStatusSchema.optional(),
});

// ─── Policy ────────────────────────────────────────────────────────────

export const CancellationRuleSchema = z.object({
  beforeHours: z.number().int().nonnegative(),
  chargeType: z.enum(['PERCENTAGE', 'FIXED', 'NIGHTS']),
  chargeValue: z.number().nonnegative(),
});

export const PolicyRulesSchema = z
  .object({
    rules: z.array(CancellationRuleSchema).optional(),
    noShowChargePercentage: z.number().min(0).max(100).optional(),
    /** Guest-facing summary (also mirrored to cancellationTerms when set from Contracts UI). */
    text: z.string().max(500).optional(),
    minStayNights: z.number().int().positive().optional(),
    maxStayNights: z.number().int().positive().optional(),
    closedToArrival: z.boolean().optional(),
    closedToDeparture: z.boolean().optional(),
    advancePurchaseDays: z.number().int().nonnegative().optional(),
    custom: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const CreatePolicySchema = z.object({
  name: RequiredText('Policy name'),
  policyType: PolicyTypeSchema,
  rulesJson: PolicyRulesSchema.optional(),
  textBody: z.preprocess(blankToNull, z.string().nullable()).optional(),
  isDefault: z.boolean().optional(),
  effectiveFrom: z.preprocess(blankToNull, z.string().nullable()).optional(),
  effectiveUntil: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const UpdatePolicySchema = CreatePolicySchema.partial();

export const AttachPolicySchema = z.object({
  policyId: z.string().min(1),
  entityType: RequiredText('Entity type'),
  entityId: z.string().min(1),
});

// ─── Service request (commerce spine) ──────────────────────────────────

export const ServiceRequestStatusSchema = z.enum([
  'required',
  'drafted',
  'sent',
  'acknowledged',
  'available',
  'held',
  'confirmed',
  'rejected',
  'expired',
  'cancelled',
]);

export const CreateServiceRequestSchema = z.object({
  sellerOrganizationId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  supplierId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  partnerAssetId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  serviceType: ServiceTypeSchema,
  sourceEntityType: z.preprocess(blankToNull, z.string().nullable()).optional(),
  sourceEntityId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  tripId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  bookingComponentId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  quotationLineId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  serviceStartAt: z.preprocess(blankToNull, z.string().nullable()).optional(),
  serviceEndAt: z.preprocess(blankToNull, z.string().nullable()).optional(),
  quantity: z.number().positive().optional(),
  adults: z.number().int().nonnegative().optional(),
  children: z.number().int().nonnegative().optional(),
  requirementsJson: z.record(z.unknown()).optional(),
  quotedAmount: z.number().nonnegative().nullable().optional(),
  currency: z.string().length(3).optional(),
  title: RequiredText('Title'),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const UpdateServiceRequestSchema = z.object({
  status: ServiceRequestStatusSchema.optional(),
  agreedAmount: z.number().nonnegative().nullable().optional(),
  quotedAmount: z.number().nonnegative().nullable().optional(),
  confirmationRef: z.preprocess(blankToNull, z.string().nullable()).optional(),
  reservationId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  reservationType: z.preprocess(blankToNull, z.string().nullable()).optional(),
  policySnapshotJson: z.unknown().optional(),
  rateSnapshotJson: z.unknown().optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  rejectReason: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

// ─── Commercial money docs ─────────────────────────────────────────────

export const CommercialDocumentTypeSchema = z.enum([
  'invoice',
  'credit_note',
  'receipt',
  'proforma',
]);

export const CreateCommercialDocumentSchema = z.object({
  docType: CommercialDocumentTypeSchema.default('invoice'),
  direction: z.enum(['receivable', 'payable']),
  counterpartyPartyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  counterpartyOrgId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  supplierId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  linkedEntityType: z.preprocess(blankToNull, z.string().nullable()).optional(),
  linkedEntityId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  tripId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  serviceRequestId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  documentNumber: z.preprocess(blankToUndefined, z.string().optional()),
  label: RequiredText('Label'),
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  taxAmount: z.number().nonnegative().optional(),
  dueAt: z.preprocess(blankToNull, z.string().nullable()).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  lines: z
    .array(
      z.object({
        description: RequiredText('Description'),
        quantity: z.number().positive().default(1),
        unitAmount: z.number(),
        taxAmount: z.number().nonnegative().optional(),
      }),
    )
    .optional(),
});

export const CreatePaymentRecordSchema = z.object({
  commercialDocumentId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  direction: z.enum(['inbound', 'outbound']),
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  method: z.preprocess(blankToNull, z.string().nullable()).optional(),
  reference: z.preprocess(blankToNull, z.string().nullable()).optional(),
  paidAt: z.preprocess(blankToNull, z.string().nullable()).optional(),
  linkedEntityType: z.preprocess(blankToNull, z.string().nullable()).optional(),
  linkedEntityId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  tripId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

// ─── Conversation ──────────────────────────────────────────────────────

export const CreateConversationSchema = z.object({
  subject: RequiredText('Subject'),
  linkedEntityType: z.preprocess(blankToNull, z.string().nullable()).optional(),
  linkedEntityId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  counterpartyOrgId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  partyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  assignedUserId: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const PostMessageSchema = z.object({
  body: RequiredText('Message'),
  visibility: z.enum(['internal', 'customer', 'partner']).default('internal'),
  attachmentDocumentIds: z.array(z.string()).optional(),
});

// ─── Party extensions ──────────────────────────────────────────────────

export const UpdatePartySchema = z.object({
  type: z.enum(['individual', 'organization']).optional(),
  displayName: z.string().min(1).optional(),
  email: z.preprocess(blankToNull, z.string().nullable()).optional(),
  phone: z.preprocess(blankToNull, z.string().nullable()).optional(),
  taxId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  businessType: z.preprocess(blankToNull, z.string().nullable()).optional(),
  creditLimit: z.number().nonnegative().nullable().optional(),
  paymentTerms: z.preprocess(blankToNull, z.string().nullable()).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  metadataJson: z.record(z.unknown()).optional(),
});

export const CreatePartyContactSchema = z.object({
  fullName: RequiredText('Full name'),
  email: z.preprocess(blankToNull, z.string().nullable()).optional(),
  phone: z.preprocess(blankToNull, z.string().nullable()).optional(),
  title: z.preprocess(blankToNull, z.string().nullable()).optional(),
  isPrimary: z.boolean().optional(),
});

export const CreatePartyAddressSchema = z.object({
  label: z.string().default('primary'),
  line1: RequiredText('Address line 1'),
  line2: z.preprocess(blankToNull, z.string().nullable()).optional(),
  city: z.preprocess(blankToNull, z.string().nullable()).optional(),
  state: z.preprocess(blankToNull, z.string().nullable()).optional(),
  postalCode: z.preprocess(blankToNull, z.string().nullable()).optional(),
  country: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const AssignPartyRoleSchema = z.object({
  role: PartyContextRoleSchema,
  entityType: RequiredText('Entity type'),
  entityId: z.string().min(1),
});

// ─── Org profile (typed) ───────────────────────────────────────────────

export const OrganizationProfileSchema = z.object({
  legalName: z.preprocess(blankToNull, z.string().nullable()).optional(),
  displayName: z.preprocess(blankToNull, z.string().nullable()).optional(),
  description: z.preprocess(blankToNull, z.string().nullable()).optional(),
  logoUrl: z.preprocess(blankToNull, z.string().nullable()).optional(),
  coverImageUrls: z.array(z.string()).optional(),
  contactEmail: z.preprocess(blankToNull, z.string().nullable()).optional(),
  contactPhone: z.preprocess(blankToNull, z.string().nullable()).optional(),
  website: z.preprocess(blankToNull, z.string().nullable()).optional(),
  addressLine1: z.preprocess(blankToNull, z.string().nullable()).optional(),
  addressLine2: z.preprocess(blankToNull, z.string().nullable()).optional(),
  city: z.preprocess(blankToNull, z.string().nullable()).optional(),
  region: z.preprocess(blankToNull, z.string().nullable()).optional(),
  postalCode: z.preprocess(blankToNull, z.string().nullable()).optional(),
  country: z.preprocess(blankToNull, z.string().nullable()).optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  businessHoursJson: z.record(z.unknown()).optional(),
  languages: z.array(z.string()).optional(),
  taxDetailsJson: z.record(z.unknown()).optional(),
  bankDetailsJson: z.record(z.unknown()).optional(),
  licensesJson: z.array(z.unknown()).optional(),
  amenities: z.array(z.string()).optional(),
  socialLinksJson: z.record(z.string()).optional(),
  verificationStatus: z
    .enum(['unverified', 'pending', 'verified', 'rejected'])
    .optional(),
  policiesSummary: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const UpdateOrganizationProfileSchema = OrganizationProfileSchema;

// ─── Agency depth ──────────────────────────────────────────────────────

export const ContractBlackoutRangeSchema = z.object({
  /** Inclusive ISO date YYYY-MM-DD */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use YYYY-MM-DD'),
  /** Inclusive ISO date YYYY-MM-DD */
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use YYYY-MM-DD'),
});

/** Contract stop-sale window — optional roomProductId scopes to one room; null = property-wide. */
export const ContractStopSaleRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use YYYY-MM-DD'),
  roomProductId: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const CreateSupplierContractSchema = z.object({
  supplierId: z.string().min(1),
  title: RequiredText('Contract title'),
  status: z
    .enum(['draft', 'active', 'expired', 'terminated', 'superseded'])
    .default('draft'),
  versionNumber: z.number().int().positive().optional(),
  supersedesId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  effectiveFrom: z.preprocess(blankToNull, z.string().nullable()).optional(),
  effectiveUntil: z.preprocess(blankToNull, z.string().nullable()).optional(),
  creditLimit: z.number().nonnegative().nullable().optional(),
  paymentTerms: z.preprocess(blankToNull, z.string().nullable()).optional(),
  cancellationTerms: z.preprocess(blankToNull, z.string().nullable()).optional(),
  cancellationPolicyJson: PolicyRulesSchema.nullable().optional(),
  commissionPercent: z.number().min(0).max(100).nullable().optional(),
  preferred: z.boolean().optional(),
  blackoutJson: z.array(ContractBlackoutRangeSchema).optional(),
  stopSaleJson: z.array(ContractStopSaleRangeSchema).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const UpdateSupplierContractSchema = z.object({
  title: RequiredText('Contract title').optional(),
  status: z.enum(['draft', 'active', 'expired', 'terminated', 'superseded']).optional(),
  versionNumber: z.number().int().positive().optional(),
  supersedesId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  effectiveFrom: z.preprocess(blankToNull, z.string().nullable()).optional(),
  effectiveUntil: z.preprocess(blankToNull, z.string().nullable()).optional(),
  creditLimit: z.number().nonnegative().nullable().optional(),
  paymentTerms: z.preprocess(blankToNull, z.string().nullable()).optional(),
  cancellationTerms: z.preprocess(blankToNull, z.string().nullable()).optional(),
  cancellationPolicyJson: PolicyRulesSchema.nullable().optional(),
  commissionPercent: z.number().min(0).max(100).nullable().optional(),
  preferred: z.boolean().optional(),
  /** Pass [] to clear blackouts. */
  blackoutJson: z.array(ContractBlackoutRangeSchema).optional(),
  /** Pass [] to clear stop-sales. */
  stopSaleJson: z.array(ContractStopSaleRangeSchema).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const CloneSupplierContractVersionSchema = z.object({
  /** When true, duplicate hotel rate seasons onto the new draft version. Default true. */
  copyRates: z.boolean().optional(),
});

export const CreateTripChangeCaseSchema = z.object({
  tripId: z.string().min(1),
  changeType: z.enum([
    'hotel_replacement',
    'date_shift',
    'traveller_count',
    'vehicle_upgrade',
    'activity_removal',
    'extra_night',
    'other',
  ]),
  summary: RequiredText('Summary'),
  impactJson: z.record(z.unknown()).optional(),
  additionalAmount: z.number().nullable().optional(),
  currency: z.string().length(3).optional(),
});

export const UpdateTripChangeCaseSchema = z.object({
  status: z
    .enum([
      'requested',
      'impact_calculated',
      'awaiting_customer',
      'awaiting_supplier',
      'applied',
      'rejected',
    ])
    .optional(),
  impactJson: z.record(z.unknown()).optional(),
  additionalAmount: z.number().nullable().optional(),
  resolutionNote: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const CreateServiceIncidentSchema = z.object({
  tripId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  serviceRequestId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  supplierId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  severity: IncidentSeveritySchema.default('medium'),
  category: IncidentCategorySchema,
  title: RequiredText('Title'),
  description: z.preprocess(blankToNull, z.string().nullable()).optional(),
  reportedBy: z.preprocess(blankToNull, z.string().nullable()).optional(),
  travellerImpact: z.preprocess(blankToNull, z.string().nullable()).optional(),
  compensationAmount: z.number().nonnegative().nullable().optional(),
  currency: z.string().length(3).optional(),
});

export const UpdateServiceIncidentSchema = z.object({
  status: z.enum(['open', 'investigating', 'resolved', 'closed']).optional(),
  resolution: z.preprocess(blankToNull, z.string().nullable()).optional(),
  compensationAmount: z.number().nonnegative().nullable().optional(),
  assignedUserId: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const CloseTripSchema = z.object({
  reconciliationNote: z.preprocess(blankToNull, z.string().nullable()).optional(),
  suppliersSettled: z.boolean().optional(),
  feedbackRequested: z.boolean().optional(),
  closeReason: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

// ─── Stay OS extensions ────────────────────────────────────────────────

export const CreateAssetBuildingSchema = z.object({
  assetId: z.string().min(1),
  name: RequiredText('Building name'),
  floorsHint: z.number().int().positive().optional(),
});

export const CreateHousekeepingTaskSchema = z.object({
  assetId: z.string().min(1),
  roomUnitId: z.string().min(1),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  checklistJson: z.array(z.string()).optional(),
  assignedUserId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  dueAt: z.preprocess(blankToNull, z.string().nullable()).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const UpdateHousekeepingTaskSchema = z.object({
  status: z.enum(['pending', 'cleaning', 'inspected', 'ready', 'blocked']).optional(),
  assignedUserId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  inspectedByUserId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  reopenedReason: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const CreateMaintenanceWorkOrderSchema = z.object({
  assetId: z.string().min(1),
  roomUnitId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  title: RequiredText('Title'),
  description: z.preprocess(blankToNull, z.string().nullable()).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  estimatedCost: z.number().nonnegative().nullable().optional(),
  blockInventory: z.boolean().optional(),
  category: z.preprocess(blankToNull, z.string().nullable()).optional(),
  vendorName: z.preprocess(blankToNull, z.string().nullable()).optional(),
  downtimeFrom: z.preprocess(blankToNull, z.string().nullable()).optional(),
  downtimeTo: z.preprocess(blankToNull, z.string().nullable()).optional(),
  partsJson: z.array(z.record(z.unknown())).optional(),
  recurring: z.boolean().optional(),
});

export const UpdateMaintenanceWorkOrderSchema = z.object({
  status: z.enum(['open', 'assigned', 'in_progress', 'resolved', 'closed']).optional(),
  assignedTo: z.preprocess(blankToNull, z.string().nullable()).optional(),
  actualCost: z.number().nonnegative().nullable().optional(),
  resolution: z.preprocess(blankToNull, z.string().nullable()).optional(),
  category: z.preprocess(blankToNull, z.string().nullable()).optional(),
  vendorName: z.preprocess(blankToNull, z.string().nullable()).optional(),
  downtimeFrom: z.preprocess(blankToNull, z.string().nullable()).optional(),
  downtimeTo: z.preprocess(blankToNull, z.string().nullable()).optional(),
  partsJson: z.array(z.record(z.unknown())).optional(),
  recurring: z.boolean().optional(),
});

export const CreateFolioChargeSchema = z
  .object({
    stayReservationId: z.preprocess(blankToNull, z.string().nullable()).optional(),
    mealReservationId: z.preprocess(blankToNull, z.string().nullable()).optional(),
    description: RequiredText('Description'),
    amount: z.number(),
    taxAmount: z.number().nonnegative().optional(),
    category: z
      .enum(['room', 'meal', 'laundry', 'transport', 'extra_bed', 'damage', 'other'])
      .default('other'),
  })
  .superRefine((val, ctx) => {
    const stay = Boolean(val.stayReservationId);
    const meal = Boolean(val.mealReservationId);
    if (stay === meal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of stayReservationId or mealReservationId',
      });
    }
  });

// ─── Homestay / farmstay ───────────────────────────────────────────────

export const CreateExperienceProductSchema = z.object({
  assetId: z.string().min(1),
  title: RequiredText('Title'),
  category: z.preprocess(blankToNull, z.string().nullable()).optional(),
  durationMinutes: z.number().int().positive().optional(),
  capacity: z.number().int().positive().optional(),
  ageMin: z.number().int().nonnegative().nullable().optional(),
  ageMax: z.number().int().nonnegative().nullable().optional(),
  seasonalJson: z.record(z.unknown()).optional(),
  safetyJson: z.record(z.unknown()).optional(),
  price: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  instructorRequired: z.boolean().optional(),
  weatherDependent: z.boolean().optional(),
  description: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const CreateExperienceSlotSchema = z.object({
  experienceProductId: z.string().min(1),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  capacity: z.number().int().positive(),
});

// ─── Restaurant ────────────────────────────────────────────────────────

export const CreateMealPackageSchema = z.object({
  assetId: z.string().min(1),
  name: RequiredText('Package name'),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'buffet', 'packed', 'other']),
  pricePerPerson: z.number().nonnegative(),
  currency: z.string().length(3).optional(),
  minGuests: z.number().int().positive().optional(),
  maxGuests: z.number().int().positive().optional(),
  advanceNoticeHours: z.number().int().nonnegative().optional(),
  serviceWindow: z.preprocess(blankToNull, z.string().nullable()).optional(),
  itemsIncludedJson: z.array(z.string()).optional(),
  dietaryOptions: z.array(DietaryTypeSchema).optional(),
  description: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const CreateDiningCapacitySchema = z.object({
  assetId: z.string().min(1),
  serviceDate: z.string().min(1),
  slotStart: z.string().min(1),
  slotEnd: z.string().min(1),
  totalCapacity: z.number().int().positive(),
  zone: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const CreateMealReservationSchema = z.object({
  assetId: z.string().min(1),
  mealPackageId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  diningCapacityId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  serviceAt: z.string().min(1),
  guestCount: z.number().int().positive(),
  partyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  guestName: RequiredText('Guest / group name'),
  dietaryJson: z.record(z.unknown()).optional(),
  source: ReservationSourceSchema.optional(),
  rateAmount: z.number().nonnegative().nullable().optional(),
  currency: z.string().length(3).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  serviceRequestId: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const UpdateMealReservationSchema = z.object({
  status: z
    .enum([
      'requested',
      'tentative',
      'confirmed',
      'arrived',
      'seated',
      'served',
      'completed',
      'cancelled',
      'no_show',
    ])
    .optional(),
  preparationStatus: z.enum(['pending', 'prepping', 'ready', 'served']).optional(),
  guestCount: z.number().int().positive().optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

// ─── Restaurant OS 1.0 ─────────────────────────────────────────────────

export const CreateMealInquirySchema = z.object({
  assetId: z.string().min(1),
  partyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  contactName: RequiredText('Contact name'),
  contactPhone: z.preprocess(blankToNull, z.string().nullable()).optional(),
  contactEmail: z.preprocess(blankToNull, z.string().nullable()).optional(),
  guestCount: z.number().int().positive(),
  preferredServiceAt: z.preprocess(blankToNull, z.string().nullable()).optional(),
  mealPackageId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const QuoteMealInquirySchema = z.object({
  quotedAmount: z.number().nonnegative().optional(),
  mealPackageId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  currency: z.string().length(3).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const ConvertMealInquirySchema = z.object({
  serviceAt: z.string().min(1),
  diningCapacityId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  guestCount: z.number().int().positive().optional(),
  guestName: z.preprocess(blankToNull, z.string().nullable()).optional(),
  confirmImmediately: z.boolean().optional(),
});

export const ConfirmMealReservationSchema = z.object({
  expiresAt: z.string().optional(),
});

export type CreateMealInquiryInput = z.infer<typeof CreateMealInquirySchema>;
export type QuoteMealInquiryInput = z.infer<typeof QuoteMealInquirySchema>;
export type ConvertMealInquiryInput = z.infer<typeof ConvertMealInquirySchema>;

// ─── Experience / Farmstay OS 1.0 ───────────────────────────────────────

export const CreateExperienceReservationSchema = z.object({
  assetId: z.string().min(1),
  experienceSlotId: z.string().min(1),
  bookerName: RequiredText('Booker name'),
  bookerPhone: z.preprocess(blankToNull, z.string().nullable()).optional(),
  guestCount: z.number().int().positive(),
  partyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  rateAmount: z.number().nonnegative().nullable().optional(),
  currency: z.string().length(3).optional(),
  confirmImmediately: z.boolean().optional(),
  participants: z
    .array(
      z.object({
        fullName: RequiredText('Participant name'),
        age: z.number().int().nonnegative().optional(),
      }),
    )
    .optional(),
});

export const AddExperienceParticipantSchema = z.object({
  fullName: RequiredText('Participant name'),
  age: z.number().int().nonnegative().optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const AckExperienceWaiverSchema = z.object({
  waiverText: RequiredText('Waiver text'),
  participantId: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export type CreateExperienceReservationInput = z.infer<
  typeof CreateExperienceReservationSchema
>;
export type AddExperienceParticipantInput = z.infer<typeof AddExperienceParticipantSchema>;
export type AckExperienceWaiverInput = z.infer<typeof AckExperienceWaiverSchema>;

// ─── Mobility / Car rental OS 1.0 ───────────────────────────────────────

export const CreateAssetFleetRateSchema = z.object({
  assetId: z.string().min(1),
  name: RequiredText('Rate name'),
  amountPerDay: z.number().nonnegative(),
  depositAmount: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
});

export const CreateRentalReservationSchema = z.object({
  assetId: z.string().min(1),
  fleetUnitId: z.string().min(1),
  fleetRateId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  guestName: RequiredText('Guest name'),
  guestPhone: z.preprocess(blankToNull, z.string().nullable()).optional(),
  partyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  rateAmount: z.number().nonnegative().nullable().optional(),
  depositAmount: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  confirmImmediately: z.boolean().optional(),
});

export const RentalCheckoutSchema = z.object({
  checklist: z.record(z.union([z.boolean(), z.string()])).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const RentalReturnSchema = z.object({
  checklist: z.record(z.union([z.boolean(), z.string()])).optional(),
  damageNote: z.preprocess(blankToNull, z.string().nullable()).optional(),
  damageAmount: z.number().nonnegative().optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const RecordRentalPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.string().optional(),
  reference: z.string().optional(),
  /** Applied toward deposit vs rental charges. */
  toward: z.enum(['deposit', 'charges']).optional(),
});

export type CreateAssetFleetRateInput = z.infer<typeof CreateAssetFleetRateSchema>;
export type CreateRentalReservationInput = z.infer<typeof CreateRentalReservationSchema>;
export type RentalCheckoutInput = z.infer<typeof RentalCheckoutSchema>;
export type RentalReturnInput = z.infer<typeof RentalReturnSchema>;
export type RecordRentalPaymentInput = z.infer<typeof RecordRentalPaymentSchema>;

// ─── Mobility / Driver OS 1.0 ───────────────────────────────────────────

export const CreateDriverJobSchema = z.object({
  assetId: z.string().min(1),
  guestName: RequiredText('Guest name'),
  guestPhone: z.preprocess(blankToNull, z.string().nullable()).optional(),
  partyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  serviceRequestId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  /** Optional plate from this asset’s fleet units. */
  fleetUnitId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  pickupLocation: z.preprocess(blankToNull, z.string().nullable()).optional(),
  dropLocation: z.preprocess(blankToNull, z.string().nullable()).optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  rateAmount: z.number().nonnegative().nullable().optional(),
  currency: z.string().length(3).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  /** Assign immediately (skip offered). */
  assignImmediately: z.boolean().optional(),
});

export const CompleteDriverJobSchema = z.object({
  completionNote: z.preprocess(blankToNull, z.string().nullable()).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const RecordDriverPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.string().optional(),
  reference: z.string().optional(),
});

export type CreateDriverJobInput = z.infer<typeof CreateDriverJobSchema>;
export type CompleteDriverJobInput = z.infer<typeof CompleteDriverJobSchema>;
export type RecordDriverPaymentInput = z.infer<typeof RecordDriverPaymentSchema>;

// ─── Network ───────────────────────────────────────────────────────────

export const CreateNegotiatedRateSchema = z.object({
  relationshipId: z.string().min(1),
  serviceType: ServiceTypeSchema,
  partnerAssetId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  productRef: z.preprocess(blankToNull, z.string().nullable()).optional(),
  amount: z.number().nonnegative(),
  currency: z.string().length(3).optional(),
  effectiveFrom: z.preprocess(blankToNull, z.string().nullable()).optional(),
  effectiveUntil: z.preprocess(blankToNull, z.string().nullable()).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

/** Batch import for Agency Network negotiated rates (B-AGY-05). */
export const ImportNegotiatedRateCsvRowSchema = z.object({
  /** Partner organization display name (matched case-insensitively to a following relationship). */
  partner: z.preprocess(blankToNull, z.string().nullable()).optional(),
  relationshipId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  serviceType: ServiceTypeSchema,
  amount: z.number().nonnegative(),
  currency: z.string().length(3).optional(),
  productRef: z.preprocess(blankToNull, z.string().nullable()).optional(),
  effectiveFrom: z.preprocess(blankToNull, z.string().nullable()).optional(),
  effectiveUntil: z.preprocess(blankToNull, z.string().nullable()).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const ImportNegotiatedRateCsvSchema = z.object({
  rows: z.array(ImportNegotiatedRateCsvRowSchema).min(1).max(500),
});

export const CreatePartnerSettlementSchema = z.object({
  counterpartyOrgId: z.string().min(1),
  serviceRequestId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  commissionAmount: z.number().nonnegative().optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const CreatePartnerRatingSchema = z.object({
  targetOrganizationId: z.string().min(1),
  serviceRequestId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  score: z.number().int().min(1).max(5),
  note: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

/** PR checklist — AI-ready data rules (non-AI product work). */
export const AI_READY_DATA_RULES = [
  'Important facts are structured fields, not only prose',
  'Lifecycle uses explicit enums (planning/availability/reservation/payment/operations separate)',
  'Confirmed commercial records store immutable snapshots',
  'Rates/policies carry source, verifiedAt, expiresAt where applicable',
  'Entities link end-to-end (inquiry→trip→service request→reservation→invoice→payment)',
  'organizationId + visibilityScope on shared rows',
  'Domain events emitted with IDs, not full entity blobs',
  'Money always has currency; durations in minutes; geo as lat/lng',
] as const;

// ─── Commerce Integrity 1.0 ────────────────────────────────────────────

export const CreateServiceRequestItemSchema = z.object({
  serviceRequestId: z.string().min(1),
  bookingComponentId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  productRef: z.preprocess(blankToNull, z.string().nullable()).optional(),
  quantity: z.number().positive().optional(),
  requestedTermsJson: z.record(z.unknown()).optional(),
  offeredTermsJson: z.record(z.unknown()).optional(),
  agreedAmount: z.number().nonnegative().nullable().optional(),
  currency: z.string().length(3).optional(),
});

export const ConfirmServiceRequestItemSchema = z.object({
  itemId: z.string().min(1),
  rateSnapshotJson: z.unknown(),
  policySnapshotJson: z.unknown(),
  agreedAmount: z.number().nonnegative().optional(),
  confirmationRef: z.preprocess(blankToNull, z.string().nullable()).optional(),
  idempotencyKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
  /** When set, creates/links a hold then consumes it. */
  hold: z
    .object({
      resourceType: z.string().min(1),
      resourceId: z.string().min(1),
      quantity: z.number().positive().optional(),
      windowStart: z.preprocess(blankToNull, z.string().nullable()).optional(),
      windowEnd: z.preprocess(blankToNull, z.string().nullable()).optional(),
      expiresAt: z.string().min(1),
      idempotencyKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
    })
    .optional(),
});

export const CreateInventoryHoldSchema = z.object({
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  quantity: z.number().positive().optional(),
  windowStart: z.preprocess(blankToNull, z.string().nullable()).optional(),
  windowEnd: z.preprocess(blankToNull, z.string().nullable()).optional(),
  expiresAt: z.string().min(1),
  sourceServiceRequestItemId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  idempotencyKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const CreatePaymentAllocationSchema = z.object({
  paymentId: z.string().min(1),
  commercialDocumentId: z.string().min(1),
  amount: z.number().positive(),
});

export const CreateCancellationCaseSchema = z.object({
  tripId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  scope: RequiredText('Scope'),
  reason: z.preprocess(blankToNull, z.string().nullable()).optional(),
  affectedEntitiesJson: z.array(z.record(z.unknown())).optional(),
  applicablePolicySnapshotJson: z.unknown().optional(),
  serviceStartAt: z.preprocess(blankToNull, z.string().nullable()).optional(),
  baseAmount: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  idempotencyKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const ApplyCancellationCaseSchema = z.object({
  approve: z.boolean().optional(),
});

export const NegotiateServiceRequestSchema = z.object({
  bookingComponentId: z.string().min(1),
  sellerOrganizationId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  supplierId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  partnerAssetId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  title: z.preprocess(blankToUndefined, z.string().optional()),
  quotedAmount: z.number().nonnegative().nullable().optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

/** QR Guest Services — location types */
export const ServiceLocationTypeSchema = z.enum([
  'RESTAURANT_TABLE',
  'HOTEL_ROOM',
  'HOMESTAY_ROOM',
  'FARMSTAY_UNIT',
  'DINING_ZONE',
  'EVENT_AREA',
]);

export const CreateServiceLocationSchema = z.object({
  assetId: z.string().min(1),
  locationType: ServiceLocationTypeSchema,
  label: RequiredText('Label'),
  locationRef: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const UpdateServiceLocationSchema = z.object({
  label: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  status: z.enum(['active', 'disabled']).optional(),
  locationRef: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const ServiceOfferingModifierOptionSchema = z.object({
  id: z.string().min(1),
  name: RequiredText('Option name'),
  priceDelta: z.number().default(0),
});

export const ServiceOfferingModifierGroupSchema = z.object({
  id: z.string().min(1),
  name: RequiredText('Group name'),
  minSelect: z.number().int().min(0).max(20).default(0),
  maxSelect: z.number().int().min(1).max(20).default(1),
  options: z.array(ServiceOfferingModifierOptionSchema).min(1).max(40),
});

export const CreateServiceOfferingSchema = z.object({
  assetId: z.string().min(1),
  name: RequiredText('Name'),
  description: z.preprocess(blankToNull, z.string().nullable()).optional(),
  category: z.string().min(1).default('other'),
  kind: z
    .enum(['food', 'beverage', 'laundry', 'housekeeping', 'transport', 'maintenance', 'other'])
    .default('food'),
  unitPrice: z.number().nonnegative(),
  taxPercent: z.number().min(0).max(100).optional(),
  currency: z.string().length(3).optional(),
  dietaryLabels: z.array(z.string()).optional(),
  imageUrl: z.preprocess(blankToNull, z.string().nullable()).optional(),
  sortOrder: z.number().int().optional(),
  maxQuantity: z.number().int().positive().nullable().optional(),
  prepMinutes: z.number().int().positive().nullable().optional(),
  availableFrom: z.preprocess(blankToNull, z.string().nullable()).optional(),
  availableUntil: z.preprocess(blankToNull, z.string().nullable()).optional(),
  modifiers: z.array(ServiceOfferingModifierGroupSchema).max(20).optional(),
});

export const UpdateServiceOfferingSchema = CreateServiceOfferingSchema.omit({
  assetId: true,
})
  .partial()
  .extend({
    isActive: z.boolean().optional(),
    stopSell: z.boolean().optional(),
  });

export const OpenTableSessionSchema = z.object({
  serviceLocationId: z.string().min(1),
  guestCount: z.number().int().positive().max(100).optional(),
});

export const GuestOrderLineModifierSchema = z.object({
  groupId: z.string().min(1),
  optionId: z.string().min(1),
  name: z.string().min(1),
  priceDelta: z.number(),
});

export const PlaceGuestServiceOrderSchema = z.object({
  items: z
    .array(
      z.object({
        offeringId: z.string().min(1),
        quantity: z.number().int().positive().max(50),
        instructions: z.preprocess(blankToNull, z.string().nullable()).optional(),
        modifiers: z.array(GuestOrderLineModifierSchema).max(40).optional(),
      }),
    )
    .min(1)
    .max(40),
  customerNote: z.preprocess(blankToNull, z.string().nullable()).optional(),
  idempotencyKey: z.string().min(8).max(128),
  /** Required for hotel room QR when org.requireRoomPin !== false */
  roomPin: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const GuestSessionPaySchema = z.object({
  /** When mock/local — mark paid without Razorpay. */
  mock: z.boolean().optional(),
  tipAmount: z.number().nonnegative().max(100_000).optional(),
  razorpayPaymentId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  razorpayOrderId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  razorpaySignature: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const GuestPublicPayIntentSchema = z.object({
  tipAmount: z.number().nonnegative().max(100_000).optional(),
});

export const GuestOfferingRatingSchema = z.object({
  offeringId: z.string().min(1),
  serviceOrderId: z.string().min(1),
  stars: z.number().int().min(1).max(5),
  comment: z.preprocess(blankToNull, z.string().max(500).nullable()).optional(),
});

export const GuestQrFeedbackSchema = z.object({
  nps: z.number().int().min(0).max(10),
  stars: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string().min(1).max(40)).max(12).optional(),
  comment: z.preprocess(blankToNull, z.string().max(1000).nullable()).optional(),
});

export const GuestBookExperienceSchema = z.object({
  experienceSlotId: z.string().min(1),
  bookerName: RequiredText('Name'),
  bookerPhone: z.preprocess(blankToNull, z.string().nullable()).optional(),
  guestCount: z.number().int().positive().max(40).default(1),
  waiverAck: z.boolean().optional(),
});

/** Ordered menu sections for Guest Services catalogue (stored on PartnerAsset.profileJson). */
export const GuestMenuCategorySchema = z.object({
  key: z
    .string()
    .min(1)
    .max(48)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'Use letters, numbers, _ or -'),
  label: RequiredText('Category label'),
  emoji: z.preprocess(blankToNull, z.string().max(8).nullable()).optional(),
});

export const PutGuestMenuCategoriesSchema = z.object({
  categories: z.array(GuestMenuCategorySchema).max(40),
});

export const GuestMenuSpecialSchema = z.object({
  type: z.enum([
    'chef',
    'festival',
    'seasonal',
    'limited',
    'weekend',
    'rainy',
    'winter',
    'today',
  ]),
  title: RequiredText('Special title'),
  offeringId: z.string().min(1),
  blurb: z.preprocess(blankToNull, z.string().max(240).nullable()).optional(),
  until: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const GuestMenuComboSchema = z.object({
  id: z.string().min(1).max(64),
  name: RequiredText('Combo name'),
  offeringIds: z.array(z.string().min(1)).min(2).max(12),
  price: z.number().nonnegative(),
  currency: z.string().length(3).optional(),
  saveAmount: z.number().nonnegative().optional(),
});

/** Full guestMenu blob merge (categories optional if already set). */
export const PutGuestMenuConfigSchema = z.object({
  categories: z.array(GuestMenuCategorySchema).max(40).optional(),
  featuredOfferingIds: z.array(z.string().min(1)).max(40).optional(),
  specials: z.array(GuestMenuSpecialSchema).max(20).optional(),
  combos: z.array(GuestMenuComboSchema).max(20).optional(),
  upsellPairs: z.record(z.string(), z.array(z.string().min(1)).max(8)).optional(),
});

export const RenameGuestMenuCategorySchema = z.object({
  fromKey: z.string().min(1),
  toKey: z
    .string()
    .min(1)
    .max(48)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'Use letters, numbers, _ or -'),
  label: RequiredText('Category label'),
  emoji: z.preprocess(blankToNull, z.string().max(8).nullable()).optional(),
});

export type GuestMenuCategory = z.infer<typeof GuestMenuCategorySchema>;
export type PutGuestMenuCategoriesInput = z.infer<typeof PutGuestMenuCategoriesSchema>;
export type PutGuestMenuConfigInput = z.infer<typeof PutGuestMenuConfigSchema>;
export type RenameGuestMenuCategoryInput = z.infer<typeof RenameGuestMenuCategorySchema>;
export type GuestPublicPayIntentInput = z.infer<typeof GuestPublicPayIntentSchema>;
export type GuestOfferingRatingInput = z.infer<typeof GuestOfferingRatingSchema>;
export type GuestQrFeedbackInput = z.infer<typeof GuestQrFeedbackSchema>;
export type GuestBookExperienceInput = z.infer<typeof GuestBookExperienceSchema>;

export const UpdateServiceOrderStatusSchema = z.object({
  status: z.enum([
    'accepted',
    'preparing',
    'ready',
    'out_for_delivery',
    'served',
    'completed',
    'rejected',
    'cancelled',
  ]),
});

export const CreateGuestServiceRequestSchema = z.object({
  category: z
    .enum(['housekeeping', 'laundry', 'maintenance', 'front_desk', 'transport', 'other'])
    .default('housekeeping'),
  title: RequiredText('Title'),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  roomPin: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const UpdateGuestServiceRequestStatusSchema = z.object({
  status: z.enum(['accepted', 'in_progress', 'done', 'cancelled']),
});

export type CreateServiceLocationInput = z.infer<typeof CreateServiceLocationSchema>;
export type UpdateServiceLocationInput = z.infer<typeof UpdateServiceLocationSchema>;
export type CreateServiceOfferingInput = z.infer<typeof CreateServiceOfferingSchema>;
export type UpdateServiceOfferingInput = z.infer<typeof UpdateServiceOfferingSchema>;
export type OpenTableSessionInput = z.infer<typeof OpenTableSessionSchema>;
export type PlaceGuestServiceOrderInput = z.infer<typeof PlaceGuestServiceOrderSchema>;
export type UpdateServiceOrderStatusInput = z.infer<typeof UpdateServiceOrderStatusSchema>;
export type CreateGuestServiceRequestInput = z.infer<typeof CreateGuestServiceRequestSchema>;
export type UpdateGuestServiceRequestStatusInput = z.infer<
  typeof UpdateGuestServiceRequestStatusSchema
>;

export const IntegrityExitChecklist = [
  'Every commercial fact has one authoritative owner',
  'One booking requirement can negotiate with many suppliers via SR items',
  'Confirm links reservation and consumes inventory atomically',
  'Holds are atomic, expire, release, and are traceable',
  'Accepted customer promise remains snapshot-based',
  'Cancel/change cases use policy evaluation',
  'Payments allocate to documents',
  'Partner payloads are field-scoped',
  'Quoted/agreed/booked/delivered/invoiced/paid comparable per trip',
  'Confirm/payment/hold-expiry idempotent',
] as const;


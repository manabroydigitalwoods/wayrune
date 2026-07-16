import { z } from 'zod';
import {
  OptionalEmail,
  OptionalPhone,
  RequiredEmail,
  RequiredText,
  blankToNull,
  blankToUndefined,
  isValidPhone,
} from './fields';

export {
  OptionalEmail,
  OptionalPhone,
  RequiredEmail,
  RequiredText,
  fieldErrorsFromZod,
  parseWithFieldErrors,
  blankToNull,
  blankToUndefined,
  isValidPhone,
} from './fields';

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().optional(),
});

export const RegisterSchema = z.object({
  email: RequiredEmail,
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: RequiredText('Full name'),
  organizationName: RequiredText('Organization name'),
  organizationKind: z
    .enum([
      'travel_agency',
      'hotel',
      'homestay',
      'farmstay',
      'car_rental',
      'driver',
      'restaurant',
      'dmc',
      'other',
    ])
    .default('travel_agency'),
  city: z.preprocess(blankToUndefined, z.string().optional()),
  discoverable: z.boolean().optional(),
});

export const LoginSchema = z.object({
  email: RequiredEmail,
  password: RequiredText('Password'),
  organizationSlug: z.string().optional(),
});

export const SwitchOrganizationSchema = z.object({
  organizationId: z.string().min(1),
});

/** Add another Organization under the same user (agency ↔ hotel ↔ restaurant…). */
export const CreateAdditionalOrganizationSchema = z.object({
  name: RequiredText('Organization name'),
  kind: z.enum([
    'travel_agency',
    'hotel',
    'homestay',
    'farmstay',
    'car_rental',
    'driver',
    'restaurant',
    'dmc',
    'other',
  ]),
  city: z.preprocess(blankToNull, z.string().nullable()).optional(),
  placeId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  region: z.preprocess(blankToNull, z.string().nullable()).optional(),
  contactEmail: OptionalEmail,
  contactPhone: OptionalPhone,
  capacityHint: z.preprocess(blankToNull, z.string().nullable()).optional(),
  discoverable: z.boolean().optional(),
});

export const SupplierTypeSchema = z.enum([
  'hotel',
  'homestay',
  'farmstay',
  'car_rental',
  'driver',
  'restaurant',
  'dmc',
  'other',
  // legacy itinerary-ish labels still accepted
  'transfer',
  'activity',
  'flight_ref',
  'transport',
]);

export const PartnerAssetKindSchema = z.enum([
  'hotel',
  'homestay',
  'farmstay',
  'vehicle',
  'driver',
  'restaurant',
  'other',
]);

export const OrgKindSchema = z.enum([
  'travel_agency',
  'hotel',
  'homestay',
  'farmstay',
  'car_rental',
  'driver',
  'restaurant',
  'dmc',
  'other',
  'platform',
]);

export const OrgBrandingSchema = z
  .object({
    companyName: z.string().optional(),
    tagline: z.string().optional(),
    primaryColor: z.string().optional(),
    logoUrl: z.string().optional(),
    faviconUrl: z.string().optional(),
    previewFooter: z.string().optional(),
  })
  .partial();

export const OrgSettingsPayloadSchema = z
  .object({
    defaultTaxPercent: z.number().min(0).max(100).optional(),
    /** Applied as sell = cost × (1 + markup/100) when resolving rate cards. */
    defaultMarkupPercent: z.number().min(0).max(500).optional(),
    business: z
      .object({
        legalName: z.string().optional(),
        gstin: z.string().optional(),
        pan: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        pincode: z.string().optional(),
        phone: z.string().optional(),
        website: z.string().optional(),
        supportEmail: z.string().optional(),
      })
      .partial()
      .optional(),
    security: z
      .object({
        sessionTimeoutMinutes: z.number().int().min(15).max(10080).optional(),
        requireMfa: z.boolean().optional(),
        allowPasswordLogin: z.boolean().optional(),
        passwordMinLength: z.number().int().min(8).max(128).optional(),
      })
      .partial()
      .optional(),
    integrations: z
      .object({
        googleSsoEnabled: z.boolean().optional(),
        microsoftSsoEnabled: z.boolean().optional(),
        hubspotEnabled: z.boolean().optional(),
        webhookUrl: z.string().optional(),
        whatsapp: z
          .object({
            enabled: z.boolean().optional(),
            phoneNumberId: z.string().optional(),
            accessToken: z.string().optional(),
            verifyToken: z.string().optional(),
            appSecret: z.string().optional(),
          })
          .partial()
          .optional(),
        facebook: z
          .object({
            enabled: z.boolean().optional(),
            pageId: z.string().optional(),
            accessToken: z.string().optional(),
            verifyToken: z.string().optional(),
            appSecret: z.string().optional(),
            /** Instagram Business Account linked to this Page — enables IG DM ingest/reply. */
            instagramBusinessAccountId: z.string().optional(),
          })
          .partial()
          .optional(),
        emailIngest: z
          .object({
            enabled: z.boolean().optional(),
            sharedSecret: z.string().optional(),
          })
          .partial()
          .optional(),
        websiteIngest: z
          .object({
            sharedSecret: z.string().optional(),
          })
          .partial()
          .optional(),
        /** Public conversation widget embed (chat / form / enquiry / callback / WA). */
        conversationWidget: z
          .object({
            enabled: z.boolean().optional(),
            publicKey: z.string().optional(),
            brandName: z.string().optional(),
            primaryColor: z.string().optional(),
            whatsappNumber: z.string().optional(),
            defaultGreeting: z.string().optional(),
          })
          .partial()
          .optional(),
        hubspot: z
          .object({
            enabled: z.boolean().optional(),
            accessToken: z.string().optional(),
            portalId: z.string().optional(),
            stageMapJson: z.record(z.string(), z.string()).optional(),
            lastSyncAt: z.string().optional(),
          })
          .partial()
          .optional(),
      })
      .partial()
      .optional(),
    leads: z
      .object({
        autoAssign: z
          .object({
            mode: z.enum(['off', 'round_robin', 'rules']).optional(),
            memberIds: z.array(z.string()).optional(),
            cursor: z.number().int().min(0).optional(),
            /** `rules` mode: first matching rule (by channel/acquisitionKey) wins, then round-robins within its memberIds. */
            rules: z
              .array(
                z.object({
                  channel: z.string().optional(),
                  acquisitionKey: z.string().optional(),
                  memberIds: z.array(z.string()).default([]),
                  cursor: z.number().int().min(0).optional(),
                }),
              )
              .optional(),
          })
          .partial()
          .optional(),
      })
      .partial()
      .optional(),
    notifications: z
      .object({
        emailFromName: z.string().optional(),
        emailReplyTo: z.string().optional(),
        notifyOnLead: z.boolean().optional(),
        notifyOnQuoteAccept: z.boolean().optional(),
        notifyOnPayment: z.boolean().optional(),
        notifyOnIncident: z.boolean().optional(),
        notifyOnTask: z.boolean().optional(),
        notifyOnQuoteApproval: z.boolean().optional(),
        digestEnabled: z.boolean().optional(),
        digestCadence: z.enum(['daily', 'weekly']).optional(),
      })
      .partial()
      .optional(),
    privacy: z
      .object({
        privacyPolicyUrl: z.string().optional(),
        termsUrl: z.string().optional(),
        cookieBanner: z.boolean().optional(),
        dataRetentionDays: z.number().int().min(30).max(3650).optional(),
        marketingConsentDefault: z.boolean().optional(),
      })
      .partial()
      .optional(),
    itinerary: z
      .object({
        shareLinkDefaultDays: z.number().int().min(1).max(365).optional(),
        showAgencyFooter: z.boolean().optional(),
      })
      .partial()
      .optional(),
    display: z
      .object({
        /** UI date pattern: 14 Jul 2026 | 14/07/2026 | 07/14/2026 | 2026-07-14 */
        dateFormat: z
          .enum(['d_mmm_yyyy', 'dd_mm_yyyy', 'mm_dd_yyyy', 'yyyy_mm_dd'])
          .optional(),
        /** UI clock: 24h (14:30) or 12h (2:30 PM) */
        timeFormat: z.enum(['h24', 'h12']).optional(),
      })
      .partial()
      .optional(),
    /** QR Guest Services org controls (Phase 1). */
    guestServices: z
      .object({
        qrEnabled: z.boolean().optional(),
        acceptingOrders: z.boolean().optional(),
        /** Allow QR orders without a prior staff-open TableSession. */
        walkInQrEnabled: z.boolean().optional(),
        /** Require room PIN for hotel room-service orders (default true). */
        requireRoomPin: z.boolean().optional(),
        businessHoursFrom: z.string().optional(),
        businessHoursUntil: z.string().optional(),
        /** When true + provider configured, attempt GST IRN on guest_check docs. */
        eInvoiceEnabled: z.boolean().optional(),
      })
      .partial()
      .optional(),
  })
  .partial();

export const UpdateOrganizationSettingsSchema = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  currency: z.string().length(3).optional(),
  taxLabel: z.string().min(1).optional(),
  brandingJson: OrgBrandingSchema.optional(),
  settingsJson: OrgSettingsPayloadSchema.optional(),
});

/* ------------------------------------------------------------------ *
 * Administration maturity (P2): custom roles + member/scope assignment
 * ------------------------------------------------------------------ */

/** Create a custom (non-system) role, optionally cloning an existing role. */
export const CreateRoleSchema = z.object({
  name: RequiredText('Role name'),
  /** When set, seed permissions from this role (clamped to what you can grant). */
  cloneFromRoleId: z.string().min(1).optional(),
  permissions: z.array(z.string().min(1)).default([]),
});

/** Rename a custom role and/or replace its permission set. */
export const UpdateRoleSchema = z
  .object({
    name: z.string().min(1).optional(),
    permissions: z.array(z.string().min(1)).optional(),
  })
  .refine((v) => v.name !== undefined || v.permissions !== undefined, {
    message: 'Provide a name and/or permissions to update',
  });

export const AssignRoleSchema = z.object({ roleId: z.string().min(1) });

/** Replace a membership's property/branch scope assignments (empty = org-wide). */
export const SetPropertyScopesSchema = z.object({
  partnerAssetIds: z.array(z.string().min(1)),
});

/** Invite someone to join the current org with a preset role set. */
export const InviteMemberSchema = z.object({
  email: RequiredEmail,
  fullName: z.preprocess(blankToUndefined, z.string().optional()),
  roleIds: z.array(z.string().min(1)).min(1, 'Select at least one role'),
});

/**
 * Accept a member invite. `password`/`fullName` are only required when the
 * invitee has no account yet (the peek response flags `needsAccount`).
 */
export const AcceptInviteSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  fullName: z.preprocess(blankToUndefined, z.string().optional()),
});

export const CreateOrgRelationshipSchema = z.object({
  toOrganizationId: z.string().min(1),
  status: z.enum(['following', 'preferred', 'contracted', 'blocked']).default('following'),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  addToMySuppliers: z.boolean().optional(),
});

export const UpdateOrgRelationshipSchema = z.object({
  status: z.enum(['following', 'preferred', 'contracted', 'blocked']),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const UpdatePartnerProfileSchema = z.object({
  discoverable: z.boolean().optional(),
  city: z.preprocess(blankToNull, z.string().nullable()).optional(),
  region: z.preprocess(blankToNull, z.string().nullable()).optional(),
  country: z.preprocess(blankToNull, z.string().nullable()).optional(),
  bio: z.preprocess(blankToNull, z.string().nullable()).optional(),
  serviceTags: z.array(z.string()).optional(),
  contactEmail: z.preprocess(blankToNull, z.string().nullable()).optional(),
  contactPhone: z.preprocess(blankToNull, z.string().nullable()).optional(),
  capacityHint: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const AddNetworkSupplierSchema = z.object({
  partnerOrganizationId: z.string().min(1),
});

export const CreateSupplierInviteSchema = z.object({
  email: OptionalEmail,
  suggestedKind: z
    .enum(['hotel', 'homestay', 'farmstay', 'car_rental', 'driver', 'restaurant', 'dmc', 'other'])
    .optional(),
});

export const ClaimSupplierInviteSchema = z.object({
  /** When set, link the agency supplier to this partner asset (preferred). */
  assetId: z.string().min(1).optional(),
});

export const ConfirmInboundBookingSchema = z.object({
  status: z.enum(['confirmed', 'requested']),
  confirmationRef: z.preprocess(blankToNull, z.string().nullable()).optional(),
  /** Optional partner asset that fulfilled this inbound booking. */
  assetId: z.string().min(1).optional(),
});

export const CreatePartySchema = z.object({
  type: z.enum(['individual', 'organization']),
  displayName: RequiredText('Name'),
  email: OptionalEmail,
  phone: OptionalPhone,
  taxId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  businessType: z.preprocess(blankToNull, z.string().nullable()).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const ImportPartyCsvRowSchema = z.object({
  name: RequiredText('Name'),
  email: OptionalEmail,
  phone: OptionalPhone,
  type: z.enum(['individual', 'organization']).optional(),
});

export const ImportPartyCsvSchema = z.object({
  rows: z.array(ImportPartyCsvRowSchema).min(1).max(500),
});

export const CreateLeadSchema = z.object({
  title: RequiredText('Title'),
  contactName: z.preprocess(blankToNull, z.string().nullable()).optional(),
  email: OptionalEmail,
  phone: OptionalPhone,
  partyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  sourceKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
  /** Contact channel for this intake (phone, whatsapp, website…). */
  channel: z.preprocess(blankToNull, z.string().nullable()).optional(),
  campaignId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  tags: z.array(z.string()).optional(),
  followUpAt: z.string().datetime().optional().nullable(),
  ownerId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  idempotencyKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
  /** Values keyed by CustomFieldDefinition.key (entity=lead) — stored as-is in customFieldsJson. */
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateLeadStageSchema = z.object({
  stageKey: RequiredText('Stage'),
  note: z.preprocess(blankToNull, z.string().nullable()).optional(),
  lostReason: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const AssignLeadSchema = z.object({
  ownerId: RequiredText('Owner'),
});

export const UpdateLeadSchema = z.object({
  title: RequiredText('Title').optional(),
  contactName: z.preprocess(
    (v) => (v === undefined ? undefined : blankToNull(v)),
    z.string().nullable().optional(),
  ),
  /** Only update when the key is present — missing must not become null. */
  email: z.preprocess(
    (v) => (v === undefined ? undefined : blankToNull(v)),
    z.string().email('Enter a valid email').nullable().optional(),
  ),
  phone: z.preprocess(
    (v) => (v === undefined ? undefined : blankToNull(v)),
    z
      .string()
      .refine(isValidPhone, 'Enter a 10-digit phone number')
      .nullable()
      .optional(),
  ),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  followUpAt: z.string().datetime().optional().nullable(),
  partyId: z.preprocess(
    (v) => (v === undefined ? undefined : blankToNull(v)),
    z.string().nullable().optional(),
  ),
  campaignId: z.preprocess(
    (v) => (v === undefined ? undefined : blankToNull(v)),
    z.string().nullable().optional(),
  ),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export const CreateLeadActivitySchema = z.object({
  type: z.enum(['note', 'call', 'email']),
  body: RequiredText('Details'),
});

export const UpdateLeadActivitySchema = z.object({
  body: RequiredText('Details'),
});

export const PlaceRefSchema = z.object({
  placeId: z.string().nullable().optional(),
  name: z.string().min(1),
  kind: z.string().optional(),
});

/** Accept legacy plain strings or structured place refs. */
export const PlaceRefInputSchema = z.union([
  z.string().min(1).transform((name) => ({ placeId: null as string | null, name })),
  PlaceRefSchema,
]);

export const PlaceKindSchema = z.enum([
  'country',
  'region',
  'state',
  'city',
  'area',
  'landmark',
  'airport',
  'railway_station',
]);

export const CreatePlaceSchema = z.object({
  name: RequiredText('Place name'),
  kind: PlaceKindSchema.default('city'),
  parentId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  country: z.preprocess(blankToNull, z.string().nullable()).optional(),
  region: z.preprocess(blankToNull, z.string().nullable()).optional(),
  domesticOrIntl: z.enum(['domestic', 'international']).default('domestic'),
  subcategoryIds: z.array(z.string()).optional(),
  profile: z
    .object({
      description: z.string().optional(),
      imageUrls: z.array(z.string()).optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      openingHours: z.string().optional(),
      durationMin: z.number().int().optional(),
      bestTime: z.string().optional(),
      entryFee: z.string().optional(),
      suitabilityTags: z.array(z.string()).optional(),
      googleMapsUrl: z.string().optional(),
      googleRating: z.number().optional(),
      googleReviewCount: z.number().int().optional(),
      reviewSnippet: z.string().optional(),
      iataCode: z.string().optional(),
      icaoCode: z.string().optional(),
      stationCode: z.string().optional(),
      officialName: z.string().optional(),
      shortName: z.string().optional(),
    })
    .partial()
    .optional(),
});

export const UpdatePlaceSchema = z.object({
  name: z.string().min(1).optional(),
  kind: PlaceKindSchema.optional(),
  parentId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  country: z.preprocess(blankToNull, z.string().nullable()).optional(),
  region: z.preprocess(blankToNull, z.string().nullable()).optional(),
  domesticOrIntl: z.enum(['domestic', 'international']).optional(),
  isActive: z.boolean().optional(),
  subcategoryIds: z.array(z.string()).optional(),
  profile: z
    .object({
      description: z.string().optional(),
      imageUrls: z.array(z.string()).optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      openingHours: z.string().optional(),
      durationMin: z.number().int().optional(),
      bestTime: z.string().optional(),
      entryFee: z.string().optional(),
      suitabilityTags: z.array(z.string()).optional(),
      googleMapsUrl: z.string().optional(),
      googleRating: z.number().optional(),
      googleReviewCount: z.number().int().optional(),
      reviewSnippet: z.string().optional(),
      iataCode: z.string().optional(),
      icaoCode: z.string().optional(),
      stationCode: z.string().optional(),
      officialName: z.string().optional(),
      shortName: z.string().optional(),
    })
    .partial()
    .optional(),
});

export const CreatePlaceContributionSchema = z.object({
  kind: z.enum(['create', 'edit']).default('create'),
  placeId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  payloadJson: z.record(z.string(), z.unknown()),
});

export const ReviewPlaceContributionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reviewNote: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

/** Legacy itinerary item type `activity` normalizes to `sightseeing`. */
export const ItineraryItemTypeSchema = z.preprocess(
  (v) => (v === 'activity' ? 'sightseeing' : v),
  z.enum(['hotel', 'transfer', 'flight', 'sightseeing', 'meal', 'free_time', 'note']),
);

export const ItineraryBlockItemTypeSchema = z.preprocess(
  (v) => (v === 'activity' ? 'sightseeing' : v),
  z
    .enum([
      'hotel',
      'transfer',
      'flight',
      'sightseeing',
      'meal',
      'free_time',
      'note',
      'package_day',
      'package',
    ])
    .default('package'),
);

export const CreateItineraryBlockSchema = z.object({
  name: RequiredText('Template name'),
  itemType: ItineraryBlockItemTypeSchema,
  contentJson: z.record(z.string(), z.unknown()),
});

export const CreateSupplierSchema = z.object({
  name: RequiredText('Supplier name'),
  type: SupplierTypeSchema.optional(),
  email: OptionalEmail,
  phone: OptionalPhone,
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  placeId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  linkedAssetId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  profileJson: z.record(z.string(), z.unknown()).optional(),
});

export const CreatePartnerAssetSchema = z.object({
  name: RequiredText('Asset name'),
  assetKind: PartnerAssetKindSchema,
  placeId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  profileJson: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const UpdatePartnerAssetSchema = z.object({
  name: z.string().min(1).optional(),
  assetKind: PartnerAssetKindSchema.optional(),
  placeId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  profileJson: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const CreateAssetRoomProductSchema = z.object({
  assetId: z.string().min(1),
  name: RequiredText('Room name'),
  roomTypeKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
  maxOccupancy: z.number().int().min(1).max(50).optional(),
  bedConfig: z.preprocess(blankToNull, z.string().nullable()).optional(),
  baseQuantity: z.number().int().min(1).max(500).optional(),
  rateHint: z.number().nonnegative().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const UpdateAssetRoomProductSchema = CreateAssetRoomProductSchema.partial().omit({
  assetId: true,
});

export const CreateAssetAllotmentSchema = z.object({
  roomProductId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  availableCount: z.number().int().min(0).max(500),
  stopSell: z.boolean().optional(),
});

export const UpdateAssetAllotmentSchema = z.object({
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  availableCount: z.number().int().min(0).max(500).optional(),
  stopSell: z.boolean().optional(),
});

export const CreateAssetFleetUnitSchema = z.object({
  assetId: z.string().min(1),
  name: RequiredText('Vehicle name'),
  plateNumber: z.preprocess(blankToNull, z.string().nullable()).optional(),
  seats: z.number().int().min(1).max(100).nullable().optional(),
  vehicleTypeKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
  isActive: z.boolean().optional(),
});

export const UpdateAssetFleetUnitSchema = CreateAssetFleetUnitSchema.partial().omit({
  assetId: true,
});

export const CreateAssetCalendarBlockSchema = z.object({
  assetId: z.string().min(1),
  fleetUnitId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  kind: z.enum(['available', 'blocked', 'booked']).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const CreateAssetServiceOfferSchema = z.object({
  assetId: z.string().min(1),
  name: RequiredText('Offer name'),
  description: z.preprocess(blankToNull, z.string().nullable()).optional(),
  capacity: z.number().int().min(0).max(5000).nullable().optional(),
  serviceDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  serviceWindow: z.preprocess(blankToNull, z.string().nullable()).optional(),
  rateHint: z.number().nonnegative().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const UpdateAssetServiceOfferSchema = CreateAssetServiceOfferSchema.partial().omit({
  assetId: true,
});

export const InventoryAvailabilityQuerySchema = z.object({
  assetId: z.string().optional(),
  supplierId: z.string().optional(),
  from: z.string().min(1),
  to: z.string().min(1),
  guests: z.number().int().min(1).optional(),
});

export const RoomUnitStatusSchema = z.enum([
  'vacant_clean',
  'vacant_dirty',
  'occupied',
  'ooo',
]);

export const StayReservationStatusSchema = z.enum([
  'inquiry',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
  'no_show',
]);

export const StayReservationSourceSchema = z.enum([
  'agency_inbound',
  'manual',
  'walk_in',
]);

export const CreateAssetRoomUnitSchema = z.object({
  roomProductId: z.string().min(1),
  name: RequiredText('Unit name'),
  floor: z.preprocess(blankToNull, z.string().nullable()).optional(),
  status: RoomUnitStatusSchema.optional(),
  isActive: z.boolean().optional(),
});

export const UpdateAssetRoomUnitSchema = CreateAssetRoomUnitSchema.partial().omit({
  roomProductId: true,
});

export const CreateAssetRatePlanSchema = z.object({
  roomProductId: z.string().min(1),
  name: RequiredText('Rate plan name'),
  amount: z.number().nonnegative(),
  currency: z.string().length(3).optional(),
  startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  endDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  isActive: z.boolean().optional(),
  mealPlan: z.preprocess(blankToNull, z.string().nullable()).optional(),
  refundable: z.boolean().optional(),
  minStayNights: z.number().int().positive().nullable().optional(),
  maxStayNights: z.number().int().positive().nullable().optional(),
  closedToArrival: z.boolean().optional(),
  closedToDeparture: z.boolean().optional(),
  extraAdultAmount: z.number().nonnegative().nullable().optional(),
  childWithBedAmount: z.number().nonnegative().nullable().optional(),
  childWithoutBedAmount: z.number().nonnegative().nullable().optional(),
});

export const UpdateAssetRatePlanSchema = CreateAssetRatePlanSchema.partial().omit({
  roomProductId: true,
});

export const CreateStayReservationSchema = z.object({
  assetId: z.string().min(1),
  roomProductId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  roomUnitId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  checkIn: z.string().min(1),
  checkOut: z.string().min(1),
  guestName: RequiredText('Guest name'),
  guestPhone: z.preprocess(blankToNull, z.string().nullable()).optional(),
  guestEmail: z.preprocess(blankToNull, z.string().nullable()).optional(),
  partyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  source: StayReservationSourceSchema.optional(),
  status: StayReservationStatusSchema.optional(),
  rateAmount: z.number().nonnegative().nullable().optional(),
  currency: z.string().length(3).optional(),
  mealPlan: z.preprocess(blankToNull, z.string().nullable()).optional(),
  adults: z.number().int().positive().optional(),
  children: z.number().int().nonnegative().optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  confirmationRef: z.preprocess(blankToNull, z.string().nullable()).optional(),
  allocate: z.boolean().optional(),
  // Homestay / farmstay attributes
  inventoryMode: z.enum(['entire_home', 'private_room']).optional(),
  hostPresent: z.boolean().optional(),
  houseRulesAckAt: z.preprocess(blankToNull, z.string().nullable()).optional(),
  mealCutoffHours: z.number().int().nonnegative().nullable().optional(),
  flexibleCheckIn: z.boolean().optional(),
});

export const UpdateStayReservationSchema = z.object({
  roomProductId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  roomUnitId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  checkIn: z.string().min(1).optional(),
  checkOut: z.string().min(1).optional(),
  guestName: z.string().min(1).optional(),
  guestPhone: z.preprocess(blankToNull, z.string().nullable()).optional(),
  guestEmail: z.preprocess(blankToNull, z.string().nullable()).optional(),
  status: StayReservationStatusSchema.optional(),
  rateAmount: z.number().nonnegative().nullable().optional(),
  currency: z.string().length(3).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  confirmationRef: z.preprocess(blankToNull, z.string().nullable()).optional(),
  // Homestay / farmstay attributes
  inventoryMode: z.enum(['entire_home', 'private_room']).optional(),
  hostPresent: z.boolean().optional(),
  houseRulesAckAt: z.preprocess(blankToNull, z.string().nullable()).optional(),
  mealCutoffHours: z.number().int().nonnegative().nullable().optional(),
  flexibleCheckIn: z.boolean().optional(),
});

// ─── Stay OS Phase 1 — named modify ops & day-close ────────────────────

export const ExtendStaySchema = z.object({
  newCheckOut: z.string().min(1),
  note: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const EarlyDepartureSchema = z.object({
  newCheckOut: z.string().min(1),
  note: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const ChangeRoomProductSchema = z.object({
  roomProductId: z.string().min(1),
  note: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const MoveUnitSchema = z.object({
  roomUnitId: z.string().min(1),
  note: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const ChangeOccupancySchema = z.object({
  adults: z.number().int().positive().optional(),
  children: z.number().int().nonnegative().optional(),
});

export const ChangeMealPlanSchema = z.object({
  mealPlan: z.string().min(1),
});

export const PartialCancelRoomSchema = z.object({
  reason: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const CloseDaySchema = z.object({
  businessDate: z.string().min(1),
});

export const HomestayAttrsSchema = z.object({
  inventoryMode: z.enum(['entire_home', 'private_room']).optional(),
  hostPresent: z.boolean().optional(),
  /** Property house-rules text; when non-empty (or requireRulesAck), check-in requires ack. */
  houseRules: z.string().optional(),
  requireRulesAck: z.boolean().optional(),
  mealCutoffHours: z.number().int().nonnegative().nullable().optional(),
  flexibleCheckIn: z.boolean().optional(),
});

export const StayCheckInSchema = z.object({
  roomUnitId: z.string().min(1).optional(),
  houseRulesAck: z.boolean().optional(),
});

export const RecordStayPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.string().optional(),
  reference: z.string().optional(),
});

export const StayDashboardQuerySchema = z.object({
  assetId: z.string().min(1).optional(),
});

export const StayAvailabilityCalendarQuerySchema = z.object({
  assetId: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  roomProductId: z.string().min(1).optional(),
});

export const AllocateInventorySchema = z.object({
  assetId: z.string().min(1).optional(),
  supplierId: z.string().min(1).optional(),
  roomProductId: z.string().min(1).optional(),
  fleetUnitId: z.string().min(1).optional(),
  bookingComponentId: z.string().min(1).optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  quantity: z.number().int().min(1).max(50).optional(),
  status: z.enum(['hold', 'confirmed']).optional(),
  allowOverride: z.boolean().optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const EnsureShadowAssetSchema = z.object({
  supplierId: z.string().min(1),
});

export const CreatePlaceCategorySchema = z.object({
  name: RequiredText('Category name'),
});

export const CreatePlaceSubcategorySchema = z.object({
  categoryId: z.string().min(1),
  name: RequiredText('Subcategory name'),
});

/** @deprecated Use CreatePlaceSchema — places cover origin, destination, and stops. */
export const CreateDestinationSchema = CreatePlaceSchema;

export const CreateRoomTypeSchema = z.object({
  name: RequiredText('Room type'),
  description: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const CreateVehicleTypeSchema = z.object({
  name: RequiredText('Vehicle type'),
  description: z.preprocess(blankToNull, z.string().nullable()).optional(),
  seats: z.number().int().positive().optional(),
  profile: z
    .object({
      imageUrl: z.string().optional(),
      imageUrls: z.array(z.string()).optional(),
      suitabilityTags: z.array(z.string()).optional(),
    })
    .partial()
    .optional(),
});

export const CreateInquirySchema = z.object({
  partyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  leadId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  travelType: z.preprocess(blankToNull, z.string().nullable()).optional(),
  domesticOrIntl: z.enum(['domestic', 'international']).optional().nullable(),
  origin: z.preprocess(blankToNull, PlaceRefInputSchema.nullable()).optional(),
  destinations: z.array(PlaceRefInputSchema).optional(),
  stops: z.array(PlaceRefInputSchema).optional(),
  dateFlexible: z.boolean().optional(),
  startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  endDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  nights: z.number().int().optional().nullable(),
  adults: z.number().int().min(1, 'At least 1 adult is required').default(1),
  children: z.number().int().min(0).default(0),
  infants: z.number().int().min(0).default(0),
  budgetAmount: z.number().optional().nullable(),
  budgetCurrency: z.string().length(3).optional().nullable(),
  hotelCategory: z.preprocess(blankToNull, z.string().nullable()).optional(),
  meals: z.preprocess(blankToNull, z.string().nullable()).optional(),
  transportPref: z.preprocess(blankToNull, z.string().nullable()).optional(),
  flightsRequired: z.boolean().optional(),
  visaAssistance: z.boolean().optional(),
  insurance: z.boolean().optional(),
  interests: z.array(z.string()).optional(),
  roomRequirements: z.preprocess(blankToNull, z.string().nullable()).optional(),
  expectedCloseAt: z.preprocess(blankToNull, z.string().nullable()).optional(),
  specialRequirements: z.preprocess(blankToNull, z.string().nullable()).optional(),
  internalNotes: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

/** Partial update for agency inquiries — recomputes missing-field completeness on save. */
export const UpdateInquirySchema = CreateInquirySchema.partial();

/**
 * Manual inquiry status transition (open <-> qualified <-> lost). `converted`
 * is only reachable via /inquiries/:id/convert-to-trip, never this endpoint.
 * A reason is required when marking an inquiry lost so pipeline reporting
 * stays meaningful.
 */
export const UpdateInquiryStatusSchema = z
  .object({
    status: z.enum(['open', 'qualified', 'lost']),
    reason: z.preprocess(blankToUndefined, z.string().optional()),
  })
  .refine((v) => v.status !== 'lost' || Boolean(v.reason?.trim()), {
    message: 'Enter a reason for marking this inquiry lost',
    path: ['reason'],
  });

export const CreateTripSchema = z.object({
  title: RequiredText('Trip title'),
  inquiryId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  partyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  endDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  destinations: z.array(PlaceRefInputSchema).optional(),
});

/**
 * Unified "Travel Request" intake: capture a customer contact + trip basics in
 * one shot. The backend atomically resolves/creates the Party, and creates a
 * Lead + Inquiry. Reuses the inquiry travel fields plus a person block; either
 * link an existing `partyId` or provide a new `contact` (name required).
 */
export const CreateTravelRequestSchema = CreateInquirySchema.omit({
  partyId: true,
  leadId: true,
})
  .extend({
    partyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
    contact: z
      .object({
        name: z.preprocess(blankToUndefined, z.string().optional()),
        email: OptionalEmail,
        phone: OptionalPhone,
      })
      .optional(),
    sourceKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
    /** How this request arrived — phone, whatsapp, website, walk_in, etc. */
    channelKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
    /** Link an existing inbox Interaction when completing a travel request. */
    interactionId: z.preprocess(blankToNull, z.string().nullable()).optional(),
    /** Link to an EngagementConversation (UI: Conversation). */
    conversationId: z.preprocess(blankToNull, z.string().nullable()).optional(),
    /** Attribution from Meta/ads when converting an Inbox touch. */
    campaignId: z.preprocess(blankToNull, z.string().nullable()).optional(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  })
  .refine((v) => Boolean(v.partyId) || Boolean(v.contact?.name?.trim()), {
    message: 'Select an existing customer or enter a name',
    path: ['contact', 'name'],
  });

export type CreateTravelRequestInput = z.infer<typeof CreateTravelRequestSchema>;

/** Connector capability flags — UI must not assume every channel behaves the same. */
export const ConnectorCapabilitySchema = z.object({
  receive: z.boolean(),
  reply: z.boolean(),
  templates: z.boolean(),
  media: z.boolean(),
  readStatus: z.boolean(),
  buttons: z.boolean(),
  automation: z.boolean(),
});
export type ConnectorCapabilities = z.infer<typeof ConnectorCapabilitySchema>;

export const CONNECTOR_CAPABILITIES: Record<string, ConnectorCapabilities> = {
  whatsapp: {
    receive: true,
    reply: true,
    templates: true,
    media: true,
    readStatus: true,
    buttons: true,
    automation: true,
  },
  instagram: {
    receive: true,
    reply: true,
    templates: false,
    media: true,
    readStatus: false,
    buttons: false,
    automation: false,
  },
  facebook: {
    receive: true,
    reply: false,
    templates: false,
    media: false,
    readStatus: false,
    buttons: false,
    automation: true,
  },
  email: {
    receive: true,
    reply: true,
    templates: true,
    media: true,
    readStatus: false,
    buttons: false,
    automation: true,
  },
  website: {
    receive: true,
    reply: true,
    templates: false,
    media: true,
    readStatus: false,
    buttons: true,
    automation: true,
  },
  phone: {
    receive: true,
    reply: false,
    templates: false,
    media: false,
    readStatus: false,
    buttons: false,
    automation: false,
  },
  walk_in: {
    receive: true,
    reply: false,
    templates: false,
    media: false,
    readStatus: false,
    buttons: false,
    automation: false,
  },
  api: {
    receive: true,
    reply: false,
    templates: false,
    media: false,
    readStatus: false,
    buttons: false,
    automation: true,
  },
  import: {
    receive: true,
    reply: false,
    templates: false,
    media: false,
    readStatus: false,
    buttons: false,
    automation: false,
  },
};

export const ENGAGEMENT_CONVERSATION_STATUSES = ['open', 'waiting', 'closed'] as const;

export const UpdateEngagementConversationSchema = z.object({
  status: z.enum(ENGAGEMENT_CONVERSATION_STATUSES).optional(),
  assignedUserId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  subject: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const AssignEngagementConversationSchema = z.object({
  staffUserId: RequiredText('Staff'),
});

export const CreateEngagementAutomationRuleSchema = z.object({
  name: RequiredText('Name'),
  trigger: z.enum(['interaction.ingested', 'conversation.waiting', 'conversation.unread_sla']),
  channel: z.preprocess(blankToNull, z.string().nullable()).optional(),
  actionJson: z.record(z.string(), z.unknown()),
  isActive: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export const UpdateEngagementAutomationRuleSchema = z.object({
  name: RequiredText('Name').optional(),
  trigger: z.enum(['interaction.ingested', 'conversation.waiting', 'conversation.unread_sla']).optional(),
  channel: z.preprocess(blankToNull, z.string().nullable()).optional(),
  actionJson: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export const WidgetIngestSchema = z.object({
  organizationId: RequiredText('Organization'),
  publicKey: RequiredText('Public key'),
  mode: z.enum(['chat', 'contact', 'travel_enquiry', 'callback', 'whatsapp']),
  message: z.preprocess(blankToNull, z.string().nullable()).optional(),
  contactName: z.preprocess(blankToNull, z.string().nullable()).optional(),
  email: OptionalEmail,
  phone: OptionalPhone,
  destinations: z.preprocess(blankToNull, z.string().nullable()).optional(),
  idempotencyKey: RequiredText('Idempotency key'),
});

export const LogPhoneInteractionSchema = z.object({
  partyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  contactName: z.preprocess(blankToNull, z.string().nullable()).optional(),
  phone: OptionalPhone,
  summary: RequiredText('Notes'),
  direction: z.enum(['inbound', 'outbound', 'missed']).default('inbound'),
  conversationId: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const INTERACTION_CHANNELS = [
  'phone',
  'whatsapp',
  'website',
  'email',
  'walk_in',
  'import',
  'api',
  'facebook',
  'instagram',
] as const;

export const INTERACTION_OUTCOMES = [
  'pending',
  'created_travel_request',
  'attached_existing',
  'follow_up',
  'spam',
  'no_interest',
] as const;

export const CreateInteractionSchema = z.object({
  channel: z.enum(INTERACTION_CHANNELS),
  acquisitionSourceKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
  conversationId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  partyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  leadId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  inquiryId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  outcome: z.enum(INTERACTION_OUTCOMES).default('pending'),
  summary: z.preprocess(blankToNull, z.string().nullable()).optional(),
  occurredAt: z.string().datetime().optional(),
  unread: z.boolean().optional(),
  /** When set (including null), overrides default creator assignment. */
  staffUserId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  idempotencyKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
  rawPayloadJson: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateInteractionSchema = z.object({
  outcome: z.enum(INTERACTION_OUTCOMES).optional(),
  unread: z.boolean().optional(),
  summary: z.preprocess(blankToNull, z.string().nullable()).optional(),
  partyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  leadId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  inquiryId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  staffUserId: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const AssignInteractionSchema = z.object({
  staffUserId: RequiredText('Staff'),
});

export const CreateLeadSourceSchema = z.object({
  name: RequiredText('Name'),
  key: RequiredText('Key')
    .transform((s) => s.trim().toLowerCase().replace(/\s+/g, '_'))
    .refine((s) => /^[a-z0-9_]+$/.test(s), 'Use lowercase letters, numbers, and underscores'),
});

export const UpdateLeadSourceSchema = z.object({
  name: RequiredText('Name').optional(),
  isActive: z.boolean().optional(),
});

export const CreateCampaignSchema = z.object({
  name: RequiredText('Name'),
  externalId: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const UpdateCampaignSchema = z.object({
  name: RequiredText('Name').optional(),
  externalId: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const ReplyWhatsappSchema = z.object({
  text: RequiredText('Message'),
  to: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

/** Send an approved Meta WhatsApp template (required for first outbound msg / after the 24h session window). */
export const ReplyWhatsappTemplateSchema = z.object({
  templateId: RequiredText('Template'),
  to: z.preprocess(blankToNull, z.string().nullable()).optional(),
  bodyParameters: z.array(z.string()).optional(),
});

export const CreateWhatsAppTemplateSchema = z.object({
  name: RequiredText('Name'),
  metaTemplateName: RequiredText('Meta template name'),
  languageCode: RequiredText('Language code'),
  bodyPreview: z.preprocess(blankToNull, z.string().nullable()).optional(),
  variableCount: z.number().int().min(0).max(20).default(0),
});

export const UpdateWhatsAppTemplateSchema = z.object({
  name: RequiredText('Name').optional(),
  metaTemplateName: z.string().min(1).optional(),
  languageCode: z.string().min(1).optional(),
  bodyPreview: z.preprocess(blankToNull, z.string().nullable()).optional(),
  variableCount: z.number().int().min(0).max(20).optional(),
  isActive: z.boolean().optional(),
});

/** Reply via SMTP (worker) — threads onto the inbound message using its Message-ID. */
export const ReplyEmailSchema = z.object({
  text: RequiredText('Message'),
  html: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

/** Reply on an Instagram DM touch via the Meta Graph send API (same page token as Facebook). */
export const ReplyInstagramSchema = z.object({
  text: RequiredText('Message'),
});

export const CreatePipelineSchema = z.object({
  name: RequiredText('Name'),
  isDefault: z.boolean().optional(),
});

export const UpdatePipelineSchema = z.object({
  name: RequiredText('Name').optional(),
  isDefault: z.boolean().optional(),
});

export const CreatePipelineStageSchema = z.object({
  name: RequiredText('Name'),
  key: RequiredText('Key')
    .transform((s) => s.trim().toLowerCase().replace(/\s+/g, '_'))
    .refine((s) => /^[a-z0-9_]+$/.test(s), 'Use lowercase letters, numbers, and underscores'),
  position: z.number().int().min(0).optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
});

export const CustomFieldEntitySchema = z.enum(['lead', 'party']);
export const CustomFieldTypeSchema = z.enum(['text', 'number', 'boolean', 'select']);

export const CreateCustomFieldDefinitionSchema = z.object({
  entity: CustomFieldEntitySchema,
  key: RequiredText('Key')
    .transform((s) => s.trim().toLowerCase().replace(/\s+/g, '_'))
    .refine((s) => /^[a-z0-9_]+$/.test(s), 'Use lowercase letters, numbers, and underscores'),
  label: RequiredText('Label'),
  fieldType: CustomFieldTypeSchema.default('text'),
  optionsJson: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export const UpdateCustomFieldDefinitionSchema = z.object({
  label: RequiredText('Label').optional(),
  fieldType: CustomFieldTypeSchema.optional(),
  optionsJson: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const AssistToneSchema = z.enum(['friendly', 'formal', 'concise', 'persuasive']);

export const AssistRewriteSchema = z.object({
  text: RequiredText('Message'),
  tone: AssistToneSchema.optional(),
});

export const AssistSummarizeSchema = z
  .object({
    interactionIds: z.array(z.string().min(1)).optional(),
    partyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
    conversationId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  })
  .refine(
    (v) =>
      Boolean(v.interactionIds?.length) || Boolean(v.partyId) || Boolean(v.conversationId),
    {
      message: 'Provide interactionIds, partyId, or conversationId to summarize',
    },
  );

/** Dispose a pending Interaction with side effects (attach / follow-up task / dismiss). */
export const ResolveInteractionSchema = z
  .object({
    outcome: z.enum(['attached_existing', 'follow_up', 'spam', 'no_interest']),
    inquiryId: z.preprocess(blankToNull, z.string().nullable()).optional(),
    followUpAt: z.string().datetime().optional().nullable(),
    summary: z.preprocess(blankToNull, z.string().nullable()).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.outcome === 'attached_existing' && !v.inquiryId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select an inquiry to attach',
        path: ['inquiryId'],
      });
    }
  });

export type CreateInteractionInput = z.infer<typeof CreateInteractionSchema>;
export type UpdateInteractionInput = z.infer<typeof UpdateInteractionSchema>;
export type ResolveInteractionInput = z.infer<typeof ResolveInteractionSchema>;
export type UpdateEngagementConversationInput = z.infer<
  typeof UpdateEngagementConversationSchema
>;
export type CreateEngagementAutomationRuleInput = z.infer<
  typeof CreateEngagementAutomationRuleSchema
>;
export type UpdateEngagementAutomationRuleInput = z.infer<
  typeof UpdateEngagementAutomationRuleSchema
>;
export type WidgetIngestInput = z.infer<typeof WidgetIngestSchema>;
export type LogPhoneInteractionInput = z.infer<typeof LogPhoneInteractionSchema>;

export const UpdateTripDestinationsSchema = z.object({
  destinations: z.array(PlaceRefInputSchema),
});

export const CreateTravellerSchema = z.object({
  fullName: RequiredText('Full name'),
  type: z.enum(['adult', 'child', 'infant']).default('adult'),
  dateOfBirth: z.preprocess(blankToNull, z.string().nullable()).optional(),
  passportNumber: z.preprocess(blankToNull, z.string().nullable()).optional(),
  passportExpiry: z.preprocess(blankToNull, z.string().nullable()).optional(),
  nationality: z.preprocess(blankToNull, z.string().nullable()).optional(),
  email: OptionalEmail,
  phone: OptionalPhone,
  isLead: z.boolean().optional(),
});

export const ItineraryDayItemSchema = z.object({
  id: z.string(),
  type: ItineraryItemTypeSchema,
  title: RequiredText('Item title'),
  description: z.preprocess(blankToNull, z.string().nullable()).optional(),
  startTime: z.preprocess(blankToNull, z.string().nullable()).optional(),
  endTime: z.preprocess(blankToNull, z.string().nullable()).optional(),
  customerVisible: z.boolean().default(true),
  location: z
    .preprocess(
      (v) => (v === '' || v === undefined ? null : v),
      z.union([z.string(), PlaceRefSchema, z.null()]).optional(),
    )
    .optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  internalNotes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const ItineraryDaySchema = z.object({
  id: z.string(),
  dayNumber: z.number().int().min(1),
  title: z.string().optional(),
  date: z.preprocess(blankToNull, z.string().nullable()).optional(),
  /** Primary place for this day (multi-stop trips). */
  destination: z
    .preprocess(
      (v) => (v === '' || v === undefined ? null : v),
      z.union([z.string(), PlaceRefSchema, z.null()]).optional(),
    )
    .optional(),
  items: z.array(ItineraryDayItemSchema),
});

export const SaveItineraryVersionSchema = z.object({
  label: z.preprocess(blankToNull, z.string().nullable()).optional(),
  days: z.array(ItineraryDaySchema),
  /** Customer proposal / Trip Story meta (stored beside days in contentJson). */
  story: z
    .object({
      heroImageUrl: z.string().optional(),
      /** Emotional hero headline (e.g. "Escape to the Himalayas"). */
      headline: z.string().optional(),
      tagline: z.string().optional(),
      highlights: z.array(z.string()).optional(),
      bestTime: z.string().optional(),
      weatherNote: z.string().optional(),
      packingTips: z.array(z.string()).optional(),
      packingCategories: z
        .object({
          clothing: z.array(z.string()).optional(),
          electronics: z.array(z.string()).optional(),
          documents: z.array(z.string()).optional(),
          medicine: z.array(z.string()).optional(),
        })
        .partial()
        .optional(),
      faqs: z
        .array(
          z.object({
            question: z.string(),
            answer: z.string(),
          }),
        )
        .optional(),
      consultantNote: z.string().optional(),
      cancellationNote: z.string().optional(),
      /** Visual payment timeline on the customer proposal. */
      paymentSchedule: z
        .array(
          z.object({
            label: z.string(),
            percent: z.number().optional(),
            amountHint: z.string().optional(),
          }),
        )
        .optional(),
    })
    .partial()
    .optional(),
  expectedLock: z.number().int().optional(),
});

export const CreateItineraryShareSchema = z.object({
  versionId: z.string().min(1).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  /** Optional custom PIN (4–8 digits). Omitted → server generates a 6-digit PIN. */
  familyPin: z
    .string()
    .regex(/^\d{4,8}$/, 'Family PIN must be 4–8 digits')
    .optional(),
});

const FamilyPinField = z
  .string()
  .regex(/^\d{4,8}$/, 'Family PIN must be 4–8 digits');

/** Soft join for family co-viewers on a share link. */
export const ProposalFamilyJoinSchema = z.object({
  viewerKey: RequiredText('Viewer key'),
  displayName: RequiredText('Your name'),
  relationHint: z.preprocess(blankToNull, z.string().nullable()).optional(),
  pin: FamilyPinField.optional(),
});

export const ProposalFamilyReactSchema = z.object({
  viewerKey: RequiredText('Viewer key'),
  kind: z.enum(['love']).default('love'),
  pin: FamilyPinField.optional(),
});

export const ProposalFamilyMessageSchema = z.object({
  viewerKey: RequiredText('Viewer key'),
  body: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(1000, 'Message is too long (max 1000 characters)'),
  kind: z.enum(['comment', 'question']).default('comment'),
  pin: FamilyPinField.optional(),
});

export const ProposalFamilyAgencyReplySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Reply is required')
    .max(2000, 'Reply is too long (max 2000 characters)'),
  shareLinkId: z.string().min(1).optional(),
});

export const QuotationItemSchema = z.object({
  id: z.string(),
  description: RequiredText('Description'),
  quantity: z.number(),
  unitCost: z.number(),
  unitSell: z.number(),
  taxPercent: z.number().default(0),
  pricingUnit: z.enum(['per_person', 'per_room', 'per_service', 'package']).default('per_service'),
  /** Provenance when priced from agency rate directory. */
  rateKind: z.enum(['hotel', 'transfer']).optional(),
  rateId: z.string().optional(),
});

export const CreateSupplierHotelRateSchema = z.object({
  supplierId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  placeId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  roomType: z.preprocess(blankToNull, z.string().nullable()).optional(),
  unitCost: z.number().nonnegative(),
  currency: z.string().length(3).optional(),
  startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  endDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  isActive: z.boolean().optional(),
});

export const UpdateSupplierHotelRateSchema = z.object({
  supplierId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  placeId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  roomType: z.preprocess(blankToNull, z.string().nullable()).optional(),
  unitCost: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  endDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  isActive: z.boolean().optional(),
});

export const TransferFarePricingModeSchema = z.enum(['per_vehicle', 'per_adult']);

export const CreateTransferFareSchema = z.object({
  fromPlaceId: RequiredText('From place'),
  toPlaceId: RequiredText('To place'),
  vehicleTypeId: RequiredText('Vehicle type'),
  unitCost: z.number().nonnegative(),
  childUnitCost: z.number().nonnegative().nullable().optional(),
  infantUnitCost: z.number().nonnegative().nullable().optional(),
  pricingMode: TransferFarePricingModeSchema.optional(),
  currency: z.string().length(3).optional(),
  startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  endDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  isActive: z.boolean().optional(),
});

export const UpdateTransferFareSchema = z.object({
  fromPlaceId: z.string().min(1).optional(),
  toPlaceId: z.string().min(1).optional(),
  vehicleTypeId: z.string().min(1).optional(),
  unitCost: z.number().nonnegative().optional(),
  childUnitCost: z.number().nonnegative().nullable().optional(),
  infantUnitCost: z.number().nonnegative().nullable().optional(),
  pricingMode: TransferFarePricingModeSchema.optional(),
  currency: z.string().length(3).optional(),
  startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  endDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  isActive: z.boolean().optional(),
});

export const SuggestTransferFareSchema = z.object({
  fromPlaceId: RequiredText('From place'),
  toPlaceId: RequiredText('To place'),
  vehicleTypeId: RequiredText('Vehicle type'),
});

export const GenerateTransferFareMatrixSchema = z.object({
  clusterKey: z.string().min(1).optional(),
  placeIds: z.array(z.string().min(1)).min(2).max(40).optional(),
  vehicleTypeIds: z.array(z.string().min(1)).min(1).max(10),
  /** When false, return preview only. */
  commit: z.boolean().optional(),
  maxDistanceKm: z.number().positive().max(2000).optional(),
});

export const ResolveRatesItemSchema = z.object({
  itemId: z.string().min(1),
  type: z.string().min(1),
  /** ISO date for season matching (day date or trip start). */
  date: z.preprocess(blankToNull, z.string().nullable()).optional(),
  details: z
    .object({
      supplierId: z.string().optional(),
      placeId: z.string().optional(),
      roomType: z.string().optional(),
      nights: z.number().optional(),
      vehicleTypeId: z.string().optional(),
      fromPlaceId: z.string().optional(),
      toPlaceId: z.string().optional(),
    })
    .partial()
    .optional(),
});

export const ResolveRatesSchema = z.object({
  startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  adults: z.number().int().nonnegative().optional(),
  children: z.number().int().nonnegative().optional(),
  infants: z.number().int().nonnegative().optional(),
  items: z.array(ResolveRatesItemSchema).min(1).max(200),
});

export const SaveQuotationVersionSchema = z.object({
  label: z.preprocess(blankToNull, z.string().nullable()).optional(),
  currency: z.string().length(3).default('INR'),
  validUntil: z.preprocess(blankToNull, z.string().nullable()).optional(),
  items: z.array(QuotationItemSchema),
  inclusions: z.preprocess(blankToNull, z.string().nullable()).optional(),
  exclusions: z.preprocess(blankToNull, z.string().nullable()).optional(),
  terms: z.preprocess(blankToNull, z.string().nullable()).optional(),
  discountTotal: z.number().default(0),
  expectedLock: z.number().int().optional(),
});

export const CreateTaskSchema = z.object({
  title: RequiredText('Task'),
  description: z.preprocess(blankToNull, z.string().nullable()).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  dueAt: z.string().datetime().optional().nullable(),
  assigneeId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  entityType: z.preprocess(blankToNull, z.string().nullable()).optional(),
  entityId: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const PaymentMethodSchema = z.enum([
  'cash',
  'upi',
  'bank_transfer',
  'card',
  'cheque',
  'other',
]);

export const CreateTripPaymentSchema = z.object({
  direction: z.enum(['customer', 'supplier']),
  label: RequiredText('Label'),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().length(3).default('INR'),
  dueAt: z.preprocess(blankToNull, z.string().nullable()).optional(),
  method: PaymentMethodSchema.optional().nullable(),
  reference: z.preprocess(blankToNull, z.string().nullable()).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  supplierInvoiceId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  bookingComponentId: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const UpdateTripPaymentSchema = z.object({
  label: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  dueAt: z.preprocess(blankToNull, z.string().nullable()).optional(),
  method: PaymentMethodSchema.optional().nullable(),
  reference: z.preprocess(blankToNull, z.string().nullable()).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  supplierInvoiceId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  bookingComponentId: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const MarkPaymentPaidSchema = z.object({
  amountPaid: z.number().positive().optional(),
  method: PaymentMethodSchema.optional().nullable(),
  reference: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const CreateSupplierInvoiceSchema = z.object({
  supplierId: RequiredText('Supplier'),
  invoiceNumber: RequiredText('Invoice number'),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().length(3).default('INR'),
  dueAt: z.preprocess(blankToNull, z.string().nullable()).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  bookingComponentId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  createPaymentSchedule: z.boolean().optional().default(false),
});

export const UpdateSupplierInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  dueAt: z.preprocess(blankToNull, z.string().nullable()).optional(),
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  status: z.enum(['open', 'partial', 'paid', 'cancelled']).optional(),
  bookingComponentId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  supplierId: z.string().min(1).optional(),
});

export const RecordTripFeedbackSchema = z.object({
  score: z.number().int().min(0).max(10),
  note: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

/** Draft Living Proposal story from destinations (AI when configured). */
export const GenerateProposalStorySchema = z.object({
  placeIds: z.array(z.string().min(1)).min(1).max(12),
  placeNames: z.array(z.string()).optional(),
  startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  endDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  nights: z.number().int().min(1).max(60).optional(),
  tripTitle: z.preprocess(blankToNull, z.string().nullable()).optional(),
  /** Prefer OpenAI when key is set; otherwise catalog assembly. */
  preferAi: z.boolean().optional().default(true),
});

export const ProposalStoryDraftSchema = z.object({
  headline: z.string().optional(),
  tagline: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  bestTime: z.string().optional(),
  weatherNote: z.string().optional(),
  consultantNote: z.string().optional(),
  packingTips: z.array(z.string()).optional(),
  packingCategories: z
    .object({
      clothing: z.array(z.string()).optional(),
      electronics: z.array(z.string()).optional(),
      documents: z.array(z.string()).optional(),
      medicine: z.array(z.string()).optional(),
    })
    .optional(),
  heroImageUrl: z.string().optional(),
});

export const WebhookLeadSchema = z.object({
  title: RequiredText('Title'),
  contactName: z.preprocess(blankToUndefined, z.string().optional()),
  email: z.preprocess(blankToUndefined, z.string().email('Enter a valid email').optional()),
  phone: z.preprocess(
    blankToUndefined,
    z.string().refine(isValidPhone, 'Enter a 10-digit phone number').optional(),
  ),
  /** @deprecated Prefer channelKey + acquisitionKey/utm. Kept for backward compatibility. */
  sourceKey: z.string().default('website'),
  channelKey: z
    .enum(['website', 'whatsapp', 'facebook', 'email', 'api', 'instagram'])
    .optional(),
  acquisitionKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
  utm: z
    .object({
      source: z.preprocess(blankToUndefined, z.string().optional()),
      medium: z.preprocess(blankToUndefined, z.string().optional()),
      campaign: z.preprocess(blankToUndefined, z.string().optional()),
      content: z.preprocess(blankToUndefined, z.string().optional()),
      term: z.preprocess(blankToUndefined, z.string().optional()),
    })
    .optional(),
  idempotencyKey: RequiredText('Idempotency key'),
  customFields: z.record(z.unknown()).optional(),
});

export type WebhookLeadInput = z.infer<typeof WebhookLeadSchema>;

/** Map UTM / free-text acquisition into LeadSource-style keys. */
export function mapAcquisitionFromIngest(input: {
  acquisitionKey?: string | null;
  utm?: { source?: string };
  sourceKey?: string;
}): string | null {
  const explicit = input.acquisitionKey?.trim();
  if (explicit) return normalizeAcquisitionKey(explicit);

  const utmSource = input.utm?.source?.trim();
  if (utmSource) return normalizeAcquisitionKey(utmSource);

  // Legacy: sourceKey was often a marketing source (facebook) not a channel.
  const legacy = input.sourceKey?.trim();
  if (legacy && !['website', 'api', 'csv', 'phone', 'whatsapp', 'email', 'import'].includes(legacy)) {
    return normalizeAcquisitionKey(legacy);
  }
  return null;
}

export function normalizeAcquisitionKey(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '_');
  if (s === 'fb' || s === 'meta' || s.startsWith('facebook')) return 'facebook';
  if (s === 'ig' || s.startsWith('instagram')) return 'instagram';
  if (s === 'google' || s === 'google_ads' || s === 'adwords' || s === 'gclid') return 'google';
  if (s === 'friend' || s === 'referral' || s === 'referred') return 'referral';
  if (s === 'existing' || s === 'existing_customer' || s === 'repeat') return 'existing_customer';
  if (s === 'unknown' || s === 'direct' || s === '(direct)') return 'unknown';
  return s.slice(0, 64);
}

export function resolveIngestChannelKey(input: {
  channelKey?: string | null;
  sourceKey?: string;
}): 'website' | 'whatsapp' | 'facebook' | 'email' | 'api' | 'instagram' {
  const allowed = new Set([
    'website',
    'whatsapp',
    'facebook',
    'email',
    'api',
    'instagram',
  ] as const);
  if (input.channelKey && allowed.has(input.channelKey as 'website')) {
    return input.channelKey as 'website' | 'whatsapp' | 'facebook' | 'email' | 'api' | 'instagram';
  }
  const legacy = input.sourceKey?.trim().toLowerCase();
  if (legacy === 'whatsapp') return 'whatsapp';
  if (legacy === 'facebook' || legacy === 'fb') return 'facebook';
  if (legacy === 'email') return 'email';
  if (legacy === 'instagram' || legacy === 'ig') return 'instagram';
  if (legacy === 'api') return 'api';
  return 'website';
}

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateOrgRelationshipInput = z.infer<typeof CreateOrgRelationshipSchema>;
export type UpdateOrgRelationshipInput = z.infer<typeof UpdateOrgRelationshipSchema>;
export type UpdatePartnerProfileInput = z.infer<typeof UpdatePartnerProfileSchema>;
export type AddNetworkSupplierInput = z.infer<typeof AddNetworkSupplierSchema>;
export type CreateSupplierInviteInput = z.infer<typeof CreateSupplierInviteSchema>;
export type ConfirmInboundBookingInput = z.infer<typeof ConfirmInboundBookingSchema>;
export type CreateLeadInput = z.infer<typeof CreateLeadSchema>;
export type UpdateLeadInput = z.infer<typeof UpdateLeadSchema>;
export type CreateLeadSourceInput = z.infer<typeof CreateLeadSourceSchema>;
export type UpdateLeadSourceInput = z.infer<typeof UpdateLeadSourceSchema>;
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;
export type AssignInteractionInput = z.infer<typeof AssignInteractionSchema>;
export type ReplyWhatsappInput = z.infer<typeof ReplyWhatsappSchema>;
export type ReplyWhatsappTemplateInput = z.infer<typeof ReplyWhatsappTemplateSchema>;
export type CreateWhatsAppTemplateInput = z.infer<typeof CreateWhatsAppTemplateSchema>;
export type UpdateWhatsAppTemplateInput = z.infer<typeof UpdateWhatsAppTemplateSchema>;
export type ReplyEmailInput = z.infer<typeof ReplyEmailSchema>;
export type ReplyInstagramInput = z.infer<typeof ReplyInstagramSchema>;
export type CreatePipelineInput = z.infer<typeof CreatePipelineSchema>;
export type UpdatePipelineInput = z.infer<typeof UpdatePipelineSchema>;
export type CreatePipelineStageInput = z.infer<typeof CreatePipelineStageSchema>;
export type CreateCustomFieldDefinitionInput = z.infer<typeof CreateCustomFieldDefinitionSchema>;
export type UpdateCustomFieldDefinitionInput = z.infer<typeof UpdateCustomFieldDefinitionSchema>;
export type AssistRewriteInput = z.infer<typeof AssistRewriteSchema>;
export type AssistSummarizeInput = z.infer<typeof AssistSummarizeSchema>;
export type CreateLeadActivityInput = z.infer<typeof CreateLeadActivitySchema>;
export type UpdateLeadActivityInput = z.infer<typeof UpdateLeadActivitySchema>;
export type CreateDestinationInput = z.infer<typeof CreateDestinationSchema>;
export type CreatePlaceInput = z.infer<typeof CreatePlaceSchema>;
export type UpdatePlaceInput = z.infer<typeof UpdatePlaceSchema>;
export type PlaceRef = z.infer<typeof PlaceRefSchema>;
export type CreatePlaceCategoryInput = z.infer<typeof CreatePlaceCategorySchema>;
export type CreatePlaceSubcategoryInput = z.infer<typeof CreatePlaceSubcategorySchema>;
export type CreatePlaceContributionInput = z.infer<typeof CreatePlaceContributionSchema>;
export type ReviewPlaceContributionInput = z.infer<typeof ReviewPlaceContributionSchema>;
export type CreateItineraryBlockInput = z.infer<typeof CreateItineraryBlockSchema>;
export type SwitchOrganizationInput = z.infer<typeof SwitchOrganizationSchema>;
export type CreateAdditionalOrganizationInput = z.infer<
  typeof CreateAdditionalOrganizationSchema
>;
export type CreatePartnerAssetInput = z.infer<typeof CreatePartnerAssetSchema>;
export type UpdatePartnerAssetInput = z.infer<typeof UpdatePartnerAssetSchema>;
export type CreateAssetRoomProductInput = z.infer<typeof CreateAssetRoomProductSchema>;
export type UpdateAssetRoomProductInput = z.infer<typeof UpdateAssetRoomProductSchema>;
export type CreateAssetAllotmentInput = z.infer<typeof CreateAssetAllotmentSchema>;
export type UpdateAssetAllotmentInput = z.infer<typeof UpdateAssetAllotmentSchema>;
export type CreateAssetFleetUnitInput = z.infer<typeof CreateAssetFleetUnitSchema>;
export type UpdateAssetFleetUnitInput = z.infer<typeof UpdateAssetFleetUnitSchema>;
export type CreateAssetCalendarBlockInput = z.infer<typeof CreateAssetCalendarBlockSchema>;
export type CreateAssetServiceOfferInput = z.infer<typeof CreateAssetServiceOfferSchema>;
export type UpdateAssetServiceOfferInput = z.infer<typeof UpdateAssetServiceOfferSchema>;
export type InventoryAvailabilityQuery = z.infer<typeof InventoryAvailabilityQuerySchema>;
export type AllocateInventoryInput = z.infer<typeof AllocateInventorySchema>;
export type CreateAssetRoomUnitInput = z.infer<typeof CreateAssetRoomUnitSchema>;
export type UpdateAssetRoomUnitInput = z.infer<typeof UpdateAssetRoomUnitSchema>;
export type CreateAssetRatePlanInput = z.infer<typeof CreateAssetRatePlanSchema>;
export type UpdateAssetRatePlanInput = z.infer<typeof UpdateAssetRatePlanSchema>;
export type CreateStayReservationInput = z.infer<typeof CreateStayReservationSchema>;
export type UpdateStayReservationInput = z.infer<typeof UpdateStayReservationSchema>;
export type ExtendStayInput = z.infer<typeof ExtendStaySchema>;
export type EarlyDepartureInput = z.infer<typeof EarlyDepartureSchema>;
export type ChangeRoomProductInput = z.infer<typeof ChangeRoomProductSchema>;
export type MoveUnitInput = z.infer<typeof MoveUnitSchema>;
export type ChangeOccupancyInput = z.infer<typeof ChangeOccupancySchema>;
export type ChangeMealPlanInput = z.infer<typeof ChangeMealPlanSchema>;
export type PartialCancelRoomInput = z.infer<typeof PartialCancelRoomSchema>;
export type CloseDayInput = z.infer<typeof CloseDaySchema>;
export type HomestayAttrsInput = z.infer<typeof HomestayAttrsSchema>;
export type StayCheckInInput = z.infer<typeof StayCheckInSchema>;
export type RecordStayPaymentInput = z.infer<typeof RecordStayPaymentSchema>;
export type StayDashboardQuery = z.infer<typeof StayDashboardQuerySchema>;
export type StayAvailabilityCalendarQuery = z.infer<
  typeof StayAvailabilityCalendarQuerySchema
>;
export type EnsureShadowAssetInput = z.infer<typeof EnsureShadowAssetSchema>;
export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>;
export type UpdateTripDestinationsInput = z.infer<typeof UpdateTripDestinationsSchema>;
export type CreateRoomTypeInput = z.infer<typeof CreateRoomTypeSchema>;
export type CreateVehicleTypeInput = z.infer<typeof CreateVehicleTypeSchema>;
export type CreateInquiryInput = z.infer<typeof CreateInquirySchema>;
export type UpdateInquiryInput = z.infer<typeof UpdateInquirySchema>;
export type UpdateInquiryStatusInput = z.infer<typeof UpdateInquiryStatusSchema>;
export type CreateTripInput = z.infer<typeof CreateTripSchema>;
export type SaveItineraryVersionInput = z.infer<typeof SaveItineraryVersionSchema>;
export type CreateItineraryShareInput = z.infer<typeof CreateItineraryShareSchema>;
export type ProposalFamilyJoinInput = z.infer<typeof ProposalFamilyJoinSchema>;
export type ProposalFamilyReactInput = z.infer<typeof ProposalFamilyReactSchema>;
export type ProposalFamilyMessageInput = z.infer<typeof ProposalFamilyMessageSchema>;
export type ProposalFamilyAgencyReplyInput = z.infer<typeof ProposalFamilyAgencyReplySchema>;
export type UpdateOrganizationSettingsInput = z.infer<typeof UpdateOrganizationSettingsSchema>;
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
export type AssignRoleInput = z.infer<typeof AssignRoleSchema>;
export type SetPropertyScopesInput = z.infer<typeof SetPropertyScopesSchema>;
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
export type AcceptInviteInput = z.infer<typeof AcceptInviteSchema>;
export type SaveQuotationVersionInput = z.infer<typeof SaveQuotationVersionSchema>;
export type QuotationItem = z.infer<typeof QuotationItemSchema>;
export type CreateSupplierHotelRateInput = z.infer<typeof CreateSupplierHotelRateSchema>;
export type UpdateSupplierHotelRateInput = z.infer<typeof UpdateSupplierHotelRateSchema>;
export type CreateTransferFareInput = z.infer<typeof CreateTransferFareSchema>;
export type UpdateTransferFareInput = z.infer<typeof UpdateTransferFareSchema>;
export type SuggestTransferFareInput = z.infer<typeof SuggestTransferFareSchema>;
export type GenerateTransferFareMatrixInput = z.infer<
  typeof GenerateTransferFareMatrixSchema
>;
export type ResolveRatesInput = z.infer<typeof ResolveRatesSchema>;
export type ResolveRatesItemInput = z.infer<typeof ResolveRatesItemSchema>;
export type CreateTripPaymentInput = z.infer<typeof CreateTripPaymentSchema>;
export type UpdateTripPaymentInput = z.infer<typeof UpdateTripPaymentSchema>;
export type MarkPaymentPaidInput = z.infer<typeof MarkPaymentPaidSchema>;
export type CreateSupplierInvoiceInput = z.infer<typeof CreateSupplierInvoiceSchema>;
export type UpdateSupplierInvoiceInput = z.infer<typeof UpdateSupplierInvoiceSchema>;
export type RecordTripFeedbackInput = z.infer<typeof RecordTripFeedbackSchema>;
export type GenerateProposalStoryInput = z.infer<typeof GenerateProposalStorySchema>;
export type ProposalStoryDraft = z.infer<typeof ProposalStoryDraftSchema>;

export {
  parseIsoDateParts,
  climateSeasonFromMonth,
  tripWindowLabel,
  tripWindowHeadline,
  looksLikeIdealSeasonRange,
  resolveTripWindowDisplay,
  pickSeasonalKnowledgeBody,
  tripClimateSeason,
  type TripClimateSeason,
  type SeasonalKnowledgeItem,
} from './trip-season';

export * from './commerce-foundation';

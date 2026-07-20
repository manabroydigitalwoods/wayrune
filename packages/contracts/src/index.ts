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
import { InboxChatSettingsSchema } from './inbox-chat-settings';
import { tripTravelEndOnOrAfterStart } from './trip-travel-dates';

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
  'activity',
  'guide',
  // legacy itinerary-ish labels still accepted
  'transfer',
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
    /**
     * Trade / agent B2B markup % (travel_agency, reseller, dmc parties).
     * Omit → use defaultMarkupPercent for everyone.
     */
    agentMarkupPercent: z.number().min(0).max(500).optional(),
    /** Days from today for new / cloned / revised draft `validUntil` (1–365). */
    defaultQuoteValidityDays: z.number().int().min(1).max(365).optional(),
    /**
 * Hours after calendar expiry during which send keeps the existing validUntil
 * (no silent auto-extend). Past grace blocks send until the date is reset.
 * 0 = no grace (expired always blocks). Omit → 24.
 */
quoteValidityGraceHours: z.number().int().min(0).max(72).optional(),
    /**
     * Hours before an unread inbox thread counts as aging (dashboard strip + `/inbox?aging=1`).
     * Omit → 4.
     */
    inboxAgingHours: z.number().int().min(1).max(72).optional(),
    /**
     * Sales response SLA targets (optional). When set, dashboard Sales response
     * strip tones medians against these. Omit → no target tone (neutral).
     */
    /** Null clears a previously saved target (deep-merge). */
    firstTouchTargetHours: z.number().positive().max(168).nullable().optional(),
    leadToQuoteTargetHours: z.number().positive().max(720).nullable().optional(),
    fitBuildTargetMinutes: z.number().positive().max(1440).nullable().optional(),
    /**
     * Minimum acceptable margin % on sell for each priced line (0 = only block sell-below-cost).
     * Lines below this floor need `below_margin.approve` before send / approval request.
     */
    minMarginPercent: z.number().min(0).max(100).optional(),
    /**
     * Org FX table for quote lock: units of org book currency per 1 unit of foreign.
     * Keys are ISO 4217 codes (USD, EUR, AED, GBP, …). Used when Lock FX has no
     * manual rate. Refresh via POST /organizations/current/fx/refresh (Frankfurter).
     */
    fxRates: z.record(z.string(), z.number().positive()).optional(),
    /** Last live FX refresh metadata (Settings cue). */
    fxRatesMeta: z
      .object({
        fetchedAt: z.string(),
        source: z.literal('frankfurter'),
        asOf: z.string().optional(),
        baseCurrency: z.string().length(3).optional(),
        refreshed: z.array(z.string()).optional(),
        skipped: z.array(z.string()).optional(),
      })
      .optional(),
    business: z
      .object({
        legalName: z.string().optional(),
        gstin: z.string().optional(),
        pan: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        /** Tax place of supply (state/UT code or label) — display only in v1. */
        placeOfSupply: z.string().optional(),
        /**
         * Destination place of supply for display CGST/SGST/IGST split
         * (same → CGST+SGST, different → IGST). Does not change line tax %.
         */
        destinationPlaceOfSupply: z.string().optional(),
        pincode: z.string().optional(),
        phone: z.string().optional(),
        website: z.string().optional(),
        supportEmail: z.string().optional(),
        emergencyPhone: z.string().optional(),
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
        hubspotEnabled: z.boolean().optional(),
        webhookUrl: z.string().optional(),
        whatsapp: z
          .object({
            enabled: z.boolean().optional(),
            phoneNumberId: z.string().optional(),
            accessToken: z.string().optional(),
            verifyToken: z.string().optional(),
            appSecret: z.string().optional(),
            /**
             * WhatsAppTemplate.id used for cold quote Cloud sends when outside
             * the 24h session window. Falls back to name “Quote proposal” /
             * meta `quote_proposal` when unset.
             */
            quoteProposalTemplateId: z.string().optional(),
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
    /** Inbox → Chat channel defaults (accent, placement, availability). */
    inbox: z
      .object({
        chat: InboxChatSettingsSchema.optional(),
      })
      .partial()
      .optional(),
  })
  .partial()
  /** Keep forward-compatible keys (e.g. new inbox/chat fields) instead of silently stripping them. */
  .passthrough();

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

export const ConfirmInboundBookingSchema = z
  .object({
    status: z.enum(['confirmed', 'requested']),
    confirmationRef: z.preprocess(blankToNull, z.string().nullable()).optional(),
    /** Optional partner asset that fulfilled this inbound booking. */
    assetId: z.string().min(1).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'confirmed' && !String(v.confirmationRef || '').trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Confirmation reference is required',
        path: ['confirmationRef'],
      });
    }
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

export const UpdateSupplierSchema = z.object({
  name: z.string().min(1).optional(),
  type: SupplierTypeSchema.optional(),
  email: OptionalEmail,
  phone: OptionalPhone,
  notes: z.preprocess(blankToNull, z.string().nullable()).optional(),
  placeId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  linkedAssetId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  /** Replaces profileJson when provided (full profile save from type-specific UI). */
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
  customerFacingName: z.preprocess(blankToNull, z.string().nullable()).optional(),
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

export const UpdateInventoryAllocationSchema = z.object({
  status: z.enum(['confirmed', 'released']),
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

export const CreateTripSchema = z
  .object({
    title: RequiredText('Trip title'),
    inquiryId: z.preprocess(blankToNull, z.string().nullable()).optional(),
    partyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
    startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
    endDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
    destinations: z.array(PlaceRefInputSchema).optional(),
  })
  .refine((v) => tripTravelEndOnOrAfterStart(v.startDate, v.endDate), {
    message: 'Travel end must be on or after travel start',
    path: ['endDate'],
  });

/**
 * Atomic New-trip + package apply (`POST /trips/from-package`).
 * Rolls back the trip when template apply fails.
 */
export const CreateTripFromPackageSchema = z
  .object({
    title: RequiredText('Trip title'),
    partyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Travel start must be YYYY-MM-DD'),
    endDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
    destinations: z.array(PlaceRefInputSchema).optional(),
    templateId: RequiredText('Template'),
    adults: z.number().int().min(1, 'At least 1 adult').max(99).optional(),
    children: z.number().int().min(0).max(99).optional(),
    childAges: z.array(z.number().int().min(0).max(17)).max(99).optional(),
    childrenWithoutBed: z.number().int().min(0).max(99).optional(),
  })
  .refine((v) => tripTravelEndOnOrAfterStart(v.startDate, v.endDate), {
    message: 'Travel end must be on or after travel start',
    path: ['endDate'],
  });

/** Patch trip travel window (dates stay optional; end ≥ start when both set). */
export const UpdateTripDatesSchema = z
  .object({
    startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
    endDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
    /** When travel start changes, shift draft quote lines + story onto the new start (default on). */
    shiftQuoteDates: z.boolean().optional().default(true),
  })
  .refine((v) => tripTravelEndOnOrAfterStart(v.startDate, v.endDate), {
    message: 'Travel end must be on or after travel start',
    path: ['endDate'],
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
  google_business: {
    receive: true,
    reply: true,
    templates: false,
    media: false,
    readStatus: false,
    buttons: false,
    automation: true,
  },
};

export const GOOGLE_CONNECT_SCOPES = {
  /** Phase 1 — Business Profile (locations, reviews; messaging when API allows). */
  business: [
    'https://www.googleapis.com/auth/business.manage',
    'openid',
    'email',
    'profile',
  ],
  /** Phase 2 */
  calendar: ['https://www.googleapis.com/auth/calendar.events'],
  /** Phase 3 */
  drive: ['https://www.googleapis.com/auth/drive.file'],
  sheets: ['https://www.googleapis.com/auth/spreadsheets'],
} as const;

export const BindGoogleLocationsSchema = z.object({
  locations: z
    .array(
      z.object({
        name: RequiredText('Location resource name'),
        title: z.preprocess(blankToNull, z.string().nullable()).optional(),
        storeCode: z.preprocess(blankToNull, z.string().nullable()).optional(),
      }),
    )
    .min(1),
});

export const UpdateGoogleConnectionSettingsSchema = z.object({
  calendarId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  syncFollowUpsToCalendar: z.boolean().optional(),
  driveRootFolderId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  useDriveAsFileStorage: z.boolean().optional(),
});

export const GoogleBusinessIngestSchema = z.object({
  kind: z.enum(['message', 'review']),
  locationName: z.preprocess(blankToNull, z.string().nullable()).optional(),
  summary: RequiredText('Summary'),
  contactName: z.preprocess(blankToNull, z.string().nullable()).optional(),
  email: OptionalEmail.optional(),
  phone: OptionalPhone.optional(),
  rating: z.number().min(1).max(5).optional(),
  externalId: RequiredText('External id'),
  replyText: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const ReplyGoogleBusinessSchema = z.object({
  text: RequiredText('Reply'),
});

export const GoogleSheetsExportSchema = z.object({
  title: RequiredText('Sheet title').optional(),
  windowDays: z.number().int().min(1).max(365).default(30),
});

export const GoogleSheetsImportSchema = z.object({
  spreadsheetId: RequiredText('Spreadsheet id'),
  range: z.string().default('Sheet1!A2:G'),
});

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
  /** Presence form module key (e.g. travel_request) — lands on Interaction payload. */
  formKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
  /** PresenceChatWidget.id when known (Presence inject / embed data-widget). */
  widgetId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  siteId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  path: z.preprocess(blankToNull, z.string().nullable()).optional(),
  pageUrl: z.preprocess(blankToNull, z.string().nullable()).optional(),
  referrer: z.preprocess(blankToNull, z.string().nullable()).optional(),
  /** presence = auto-injected on Presence site; embed = external snippet. */
  source: z.enum(['presence', 'embed']).optional(),
});

export const PRESENCE_SITE_KINDS = ['marketing', 'landing'] as const;
export const PRESENCE_RECORD_STATUSES = ['draft', 'published', 'archived'] as const;

/** Catalog v2 design-token groups and component recipes (Sprint 1 foundation). */
export const PRESENCE_DESIGN_TOKEN_GROUPS = {
  brand: ['primary', 'secondary', 'accent', 'neutral', 'success', 'warning'],
  surfaces: ['background', 'foreground', 'muted', 'surface', 'surfaceMuted', 'border'],
  shape: ['radius'],
  hero: ['heroFrom', 'heroTo'],
  type: ['fontDisplay', 'fontHeading', 'fontBody', 'fontLabel'],
} as const;

export const PRESENCE_DESIGN_RECIPES = [
  'button.primary',
  'card.package',
  'header',
  'hero',
  'form',
  'sectionHeading',
] as const;

export const PRESENCE_CATALOG_THEME_FAMILIES = [
  'horizon',
  'atelier',
  'altitude',
  'wildlands',
  'marigold',
  'coastline',
  'meridian',
  'localist',
] as const;

export const PRESENCE_RENDERER_KEYS = [
  'hero',
  'rich_text',
  'gallery',
  'faq',
  'form',
  'widget_cta',
  'testimonials',
  'cta',
  'container',
  'two_column',
  'columns',
  'liquid',
  'js_module',
  /** Built ZIP package (HTML/CSS/JS) mounted in a sandbox iframe */
  'package',
  // Phase 1 — landing essentials
  'logo_cloud',
  'stats',
  'feature_grid',
  'feature_split',
  'pricing',
  'team',
  'logo_header_strip',
  'blog_cards',
  'contact_block',
  'newsletter',
  'divider',
  'embed',
  // Phase 2 — full-site
  'page_header',
  'tabs_content',
  'accordion',
  'timeline',
  'comparison_table',
  'image_text_list',
  'video_feature',
  'map_block',
  'footer_columns',
  'legal_text',
  'cards_carousel',
  'banner_slim',
  // Phase 3 — travel
  'destination_grid',
  'package_cards',
  'itinerary',
  'hotel_highlight',
  'trip_search_cta',
  'season_promo',
  'trust_badges',
  'enquiry_split',
  'gallery_masonry',
  'route_map',
  // Sprint 1 catalog keys (section.type / module.key — may alias to renderers above)
  'newsletter_form',
  'package_grid',
  'itinerary_timeline',
  'team_profiles',
  'whatsapp_cta',
  'split_content',
  'hero_search',
  'offer_banner',
  'trip_inquiry',
  'destination_showcase',
  'featured_package',
  'section_heading',
  'inclusions',
  'trip_facts',
] as const;
export const PRESENCE_MODULE_CATEGORIES = [
  'navigation',
  'hero',
  'layout',
  'content',
  'media',
  'travel',
  'social_proof',
  'conversion',
  'custom',
] as const;

const JsonRecord = z.record(z.unknown());
const JsonArray = z.array(z.unknown());
const PresenceStatusSchema = z.enum(PRESENCE_RECORD_STATUSES);
const PresenceSiteKindSchema = z.enum(PRESENCE_SITE_KINDS);
const PresenceRendererKeySchema = z.enum(PRESENCE_RENDERER_KEYS);
const PresenceModuleCategorySchema = z.enum(PRESENCE_MODULE_CATEGORIES);

/** Shared AI ranking hints for themes, components, and component variations. */
export const PresenceSuggestMetaSchema = z.object({
  orgKinds: z.array(z.string().min(1).max(64)).max(20).optional(),
  pageRoles: z.array(z.string().min(1).max(64)).max(20).optional(),
  siteKinds: z.array(z.string().min(1).max(64)).max(10).optional(),
  useCases: z.array(z.string().min(1).max(64)).max(20).optional(),
  moods: z.array(z.string().min(1).max(64)).max(20).optional(),
  keywords: z.array(z.string().min(1).max(64)).max(40).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  bestFor: z.array(z.string().min(1).max(64)).max(20).optional(),
});

export type PresenceSuggestMeta = z.infer<typeof PresenceSuggestMetaSchema>;

export const PresenceModuleVariationSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/, 'Variation key must be a lowercase slug'),
  name: RequiredText('Variation name'),
  description: z.string().max(1000).optional(),
  isDefault: z.boolean().optional(),
  defaultPropsJson: JsonRecord.optional(),
  previewJson: JsonRecord.nullable().optional(),
  suggestJson: PresenceSuggestMetaSchema.optional(),
});

export type PresenceModuleVariation = z.infer<typeof PresenceModuleVariationSchema>;

export const PresenceModuleSchemaFieldSchema = z.object({
  key: RequiredText('Field key'),
  label: RequiredText('Field label'),
  type: z.enum(['text', 'textarea', 'color', 'url', 'number', 'boolean', 'select', 'list']),
  required: z.boolean().optional(),
  helpText: z.preprocess(blankToNull, z.string().nullable()).optional(),
  options: z.array(z.object({ value: RequiredText('Option value'), label: RequiredText('Option label') })).optional(),
  defaultValue: z.unknown().optional(),
});

/** One-level menu item (dropdown children only; no deeper nesting in v1). */
const PresenceMenuItemLeafSchema = z.object({
  id: z.string().min(1).max(64),
  label: RequiredText('Label'),
  path: z.string().min(1).max(2048),
  type: z.enum(['page', 'custom']).optional(),
  pageId: z.string().min(1).max(64).optional(),
  openInNewTab: z.boolean().optional(),
  /** Curated Presence menu icon key (see presence-menu-icons). */
  icon: z.string().min(1).max(64).optional(),
});

export const PresenceMenuItemSchema = PresenceMenuItemLeafSchema.extend({
  children: z.array(PresenceMenuItemLeafSchema).max(20).optional(),
});

export const PresenceMenuSchema = z.object({
  id: z.string().min(1).max(64),
  name: RequiredText('Menu name'),
  items: z.array(PresenceMenuItemSchema).max(50),
});

/** Named menus keyed by slug (primary, footer, custom…). */
export const PresenceMenusJsonSchema = z.record(z.string().min(1).max(64), PresenceMenuSchema);

/** Theme location key → menu key in menusJson. */
export const PresenceMenuAssignmentsSchema = z.record(
  z.string().min(1).max(64),
  z.string().min(1).max(64),
);

/** Site-level SEO defaults (pages override via PresencePage.seoJson). */
export const PresenceSiteSeoSchema = z.object({
  titleSuffix: z.string().max(120).optional(),
  defaultDescription: z.string().max(500).optional(),
  defaultOgImage: z.string().max(2048).optional(),
  canonicalBase: z.string().max(2048).optional(),
  noindex: z.boolean().optional(),
  robots: z.string().max(200).optional(),
});

/** Analytics / third-party script IDs stored in site settingsJson.analytics. */
export const PresenceSiteAnalyticsSchema = z.object({
  googleAnalyticsId: z.string().max(64).optional(),
  googleTagManagerId: z.string().max(64).optional(),
  metaPixelId: z.string().max(64).optional(),
  customHeadHtml: z.string().max(10000).optional(),
});

/** Custom site variables (merged over org defaults). */
export const PresenceVariableMapSchema = z.record(
  z.string().min(1).max(80),
  z.union([z.string(), z.number(), z.boolean()]),
);
export type PresenceVariableMap = z.infer<typeof PresenceVariableMapSchema>;

/** Data source query attached to section props. */
export const PresenceDataSourceQuerySchema = z.object({
  source: z.string().min(1).max(120),
  filters: z.record(z.unknown()).optional(),
  sort: z
    .object({
      field: z.string().min(1).max(80),
      dir: z.enum(['asc', 'desc']).default('desc'),
    })
    .optional(),
  limit: z.number().int().min(1).max(100).optional(),
  fields: z.array(z.string().min(1).max(80)).max(40).optional(),
});
export type PresenceDataSourceQuery = z.infer<typeof PresenceDataSourceQuerySchema>;

/** Visitor context for personalization / A/B. */
export const PresenceVisitorContextSchema = z.object({
  country: z.string().max(8).optional(),
  device: z.enum(['desktop', 'mobile', 'tablet', 'unknown']).optional(),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(120).optional(),
  variantSeed: z.string().max(64).optional(),
});
export type PresenceVisitorContext = z.infer<typeof PresenceVisitorContextSchema>;

/** Simple personalization / schedule / A/B rule. */
export const PresenceContentRuleSchema = z.object({
  id: z.string().max(64).optional(),
  kind: z.enum(['schedule', 'personalize', 'ab']),
  when: z
    .object({
      publishAt: z.string().datetime().optional(),
      unpublishAt: z.string().datetime().optional(),
      countries: z.array(z.string().max(8)).optional(),
      devices: z.array(z.enum(['desktop', 'mobile', 'tablet'])).optional(),
      utmSource: z.array(z.string().max(120)).optional(),
    })
    .optional(),
  variantKey: z.string().max(40).optional(),
  trafficPercent: z.number().min(0).max(100).optional(),
  propsOverride: JsonRecord.optional(),
});
export type PresenceContentRule = z.infer<typeof PresenceContentRuleSchema>;

/** Structured Presence site settingsJson contract. */
export const PresenceSiteConversationWidgetSchema = z.object({
  widgetId: z.string().min(1).max(64).nullable().optional(),
  enabledOverride: z.boolean().nullable().optional(),
  /** @deprecated — use PresenceChatWidget.position */
  position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']).optional(),
  /** @deprecated — use PresenceChatWidget.includePathsJson */
  includePaths: z.array(z.string().max(2048)).max(100).optional(),
  /** @deprecated — use PresenceChatWidget.excludePathsJson */
  excludePaths: z.array(z.string().max(2048)).max(100).optional(),
});

export const UpsertPresenceChatWidgetSchema = z.object({
  key: RequiredText('Widget key'),
  name: RequiredText('Widget name'),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(9999).optional(),
  publicKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
  brandName: z.preprocess(blankToNull, z.string().nullable()).optional(),
  primaryColor: z.preprocess(blankToNull, z.string().nullable()).optional(),
  whatsappNumber: z.preprocess(blankToNull, z.string().nullable()).optional(),
  defaultGreeting: z.preprocess(blankToNull, z.string().nullable()).optional(),
  position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']).optional(),
  includePaths: z.array(z.string().max(2048)).max(100).optional(),
  excludePaths: z.array(z.string().max(2048)).max(100).optional(),
  targetRules: z
    .object({
      show: z
        .array(
          z.object({
            field: z.literal('website_url').default('website_url'),
            op: z.enum(['begins_with', 'is', 'contains', 'matches_wildcard']),
            value: z.string().min(1).max(2048),
          }),
        )
        .max(50)
        .optional(),
      hide: z
        .array(
          z.object({
            field: z.literal('website_url').default('website_url'),
            op: z.enum(['begins_with', 'is', 'contains', 'matches_wildcard']),
            value: z.string().min(1).max(2048),
          }),
        )
        .max(50)
        .optional(),
    })
    .optional(),
  /** When true, generate a new publicKey on upsert. */
  regeneratePublicKey: z.boolean().optional(),
});

export const UpsertInboxChatSettingsSchema = z.object({
  accentColor: z.string().max(32).optional(),
  fontFamily: z.string().max(64).optional(),
  allowAttachments: z.boolean().optional(),
  allowScreenCapture: z.boolean().optional(),
  placementSide: z.enum(['left', 'right']).optional(),
  allowDrag: z.boolean().optional(),
  availabilityMode: z.enum(['always', 'operating_hours', 'user_availability']).optional(),
  alwaysOpen: z.boolean().optional(),
  timezone: z.string().max(64).optional(),
  hoursStart: z.string().max(8).optional(),
  hoursEnd: z.string().max(8).optional(),
  availableReplyTime: z.string().max(120).optional(),
  awayMessage: z.string().max(500).optional(),
  afterHoursMessage: z.string().max(500).optional(),
});

export const PresenceSiteSettingsSchema = z.object({
  seo: PresenceSiteSeoSchema.optional(),
  analytics: PresenceSiteAnalyticsSchema.optional(),
  /** Site assignment + placement for Presence chat widgets. */
  conversationWidget: PresenceSiteConversationWidgetSchema.optional(),
  /** Site-scoped custom variables for `{{ key }}` interpolation. */
  variables: PresenceVariableMapSchema.optional(),
  /** Design-system token overrides layered on theme tokens. */
  designSystem: JsonRecord.optional(),
  /** Named style preset key for the active theme family (e.g. ocean, sunset). */
  stylePreset: z.string().min(1).max(64).optional().nullable(),
  themeKey: z.string().optional(),
  siteTemplateKey: z.string().optional(),
  fromThemeDefaultSite: z.boolean().optional(),
  defaultSiteTemplateKey: z.string().nullable().optional(),
}).passthrough();

export type PresenceSiteSeo = z.infer<typeof PresenceSiteSeoSchema>;
export type PresenceSiteAnalytics = z.infer<typeof PresenceSiteAnalyticsSchema>;
export type PresenceSiteSettings = z.infer<typeof PresenceSiteSettingsSchema>;

export const CreatePresenceCollectionSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase snake_case key'),
  name: RequiredText('Collection name'),
  fieldsJson: JsonArray.optional(),
  listingPath: z.string().max(200).optional(),
  detailPathPattern: z.string().max(200).optional(),
});
export type CreatePresenceCollection = z.infer<typeof CreatePresenceCollectionSchema>;

export const UpsertPresenceCollectionEntrySchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase kebab-case slug'),
  title: RequiredText('Entry title'),
  dataJson: JsonRecord.optional(),
  status: z.enum(['draft', 'published']).optional(),
  publishedAt: z.string().datetime().nullable().optional(),
});
export type UpsertPresenceCollectionEntry = z.infer<typeof UpsertPresenceCollectionEntrySchema>;

export const PresenceAnalyticsEventSchema = z.object({
  siteId: RequiredText('Site'),
  eventType: z.enum([
    'page_view',
    'cta_click',
    'form_submit',
    'whatsapp_click',
    'search',
    'ab_impression',
    'ab_conversion',
  ]),
  path: z.string().max(500).optional(),
  metaJson: JsonRecord.optional(),
  visitorId: z.string().max(80).optional(),
});
export type PresenceAnalyticsEvent = z.infer<typeof PresenceAnalyticsEventSchema>;

export const PresenceAdminSearchQuerySchema = z.object({
  q: z.string().min(1).max(120),
  limit: z.number().int().min(1).max(50).optional(),
});
export type PresenceAdminSearchQuery = z.infer<typeof PresenceAdminSearchQuerySchema>;

/** Page SEO overrides. */
export const PresencePageSeoSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  ogTitle: z.string().max(200).optional(),
  ogDescription: z.string().max(500).optional(),
  ogImage: z.string().max(2048).optional(),
  canonical: z.string().max(2048).optional(),
  noindex: z.boolean().optional(),
  robots: z.string().max(200).optional(),
});

export type PresencePageSeo = z.infer<typeof PresencePageSeoSchema>;

/** Layout keys for lightweight layout catalog. */
export const PRESENCE_LAYOUT_KEYS = ['default', 'marketing', 'landing', 'minimal'] as const;
export type PresenceLayoutKey = (typeof PRESENCE_LAYOUT_KEYS)[number];

/** Global section slot keys. */
export const PRESENCE_GLOBAL_SLOTS = [
  'announcement',
  'header',
  'footer',
  'cookie',
  'sticky_cta',
] as const;
export type PresenceGlobalSlot = (typeof PRESENCE_GLOBAL_SLOTS)[number];

export const PresenceMenuLocationSchema = z.object({
  key: z.string().min(1).max(64),
  label: RequiredText('Location label'),
  description: z.string().max(500).optional(),
});

export const CreatePresenceSiteSchema = z.object({
  name: RequiredText('Site name'),
  kind: PresenceSiteKindSchema.default('marketing'),
  themeId: RequiredText('Theme'),
  templateId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  isPrimary: z.boolean().optional(),
  settingsJson: JsonRecord.optional(),
  suggestJson: PresenceSuggestMetaSchema.nullable().optional(),
  navigationJson: JsonArray.optional(),
  menusJson: PresenceMenusJsonSchema.optional(),
  menuAssignmentsJson: PresenceMenuAssignmentsSchema.optional(),
  globalRegionsJson: JsonRecord.optional(),
});

export const UpdatePresenceSiteSchema = z.object({
  name: z.string().min(1).optional(),
  kind: PresenceSiteKindSchema.optional(),
  themeId: z.string().min(1).optional(),
  templateId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  isPrimary: z.boolean().optional(),
  status: PresenceStatusSchema.optional(),
  settingsJson: JsonRecord.nullable().optional(),
  suggestJson: PresenceSuggestMetaSchema.nullable().optional(),
  navigationJson: JsonArray.nullable().optional(),
  menusJson: PresenceMenusJsonSchema.nullable().optional(),
  menuAssignmentsJson: PresenceMenuAssignmentsSchema.nullable().optional(),
  globalRegionsJson: JsonRecord.nullable().optional(),
  primaryDomain: z.preprocess(blankToNull, z.string().nullable()).optional(),
  homePageId: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const CreatePresencePageSchema = z.object({
  path: z
    .string()
    .min(1)
    .regex(/^\//, 'Path must start with /')
    .default('/'),
  title: RequiredText('Title'),
  templateId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  layoutKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
  seoJson: z.record(z.unknown()).optional(),
  draftJson: JsonRecord.optional(),
  suggestJson: PresenceSuggestMetaSchema.nullable().optional(),
  position: z.number().int().min(0).optional(),
});

export const UpdatePresencePageSchema = z.object({
  path: z
    .string()
    .min(1)
    .regex(/^\//, 'Path must start with /')
    .optional(),
  title: z.string().min(1).optional(),
  templateId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  layoutKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
  layoutMode: z.enum(['flow', 'freeform']).optional(),
  seoJson: z.record(z.unknown()).nullable().optional(),
  draftJson: JsonRecord.nullable().optional(),
  suggestJson: PresenceSuggestMetaSchema.nullable().optional(),
  publishedSnapshotJson: JsonRecord.nullable().optional(),
  position: z.number().int().min(0).optional(),
  status: PresenceStatusSchema.optional(),
  publishAt: z.string().datetime().nullable().optional(),
  unpublishAt: z.string().datetime().nullable().optional(),
});

export const UpsertPresenceSectionSchema = z.object({
  type: PresenceRendererKeySchema,
  moduleDefinitionId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  parentId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  slotKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
  propsJson: z.record(z.unknown()).default({}),
  position: z.number().int().min(0).optional(),
});

export const PRESENCE_GLOBAL_SLOT_KEYS = [
  'announcement',
  'header',
  'footer',
  'cookie',
  'sticky_cta',
] as const;

export const PresenceGlobalSlotKeySchema = z.enum(PRESENCE_GLOBAL_SLOT_KEYS);

export const UpsertPresenceGlobalSectionSchema = z.object({
  name: RequiredText('Section name'),
  moduleDefinitionId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  type: z.string().min(1).max(64).default('rich_text'),
  propsJson: JsonRecord.default({}),
  enabled: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export const ReorderPresenceSectionsSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export const UpsertPresenceFormSchema = z.object({
  key: RequiredText('Form key'),
  name: RequiredText('Form name'),
  orgKindPreset: z.preprocess(blankToNull, z.string().nullable()).optional(),
  fieldsJson: z.array(z.record(z.unknown())).default([]),
  ingestMode: z
    .enum(['chat', 'contact', 'travel_enquiry', 'callback', 'whatsapp'])
    .default('contact'),
  isActive: z.boolean().optional(),
});

export const UpsertPresenceThemeSchema = z.object({
  key: RequiredText('Theme key'),
  name: RequiredText('Theme name'),
  previewUrl: z.preprocess(blankToNull, z.string().nullable()).optional(),
  status: PresenceStatusSchema.default('published'),
  tokensJson: JsonRecord.default({}),
  tokensSchemaJson: JsonRecord.nullable().optional(),
  schemaJson: JsonRecord.nullable().optional(),
  layoutJson: JsonRecord.nullable().optional(),
  regionsJson: JsonRecord.nullable().optional(),
  previewAssetsJson: JsonRecord.nullable().optional(),
  suggestJson: PresenceSuggestMetaSchema.nullable().optional(),
});

export const ClonePresenceThemeSchema = z.object({
  key: z.preprocess(blankToNull, z.string().nullable()).optional(),
  name: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

/** Create a WordPress-style child theme that inherits from a parent. */
export const CreatePresenceChildThemeSchema = z.object({
  key: z.preprocess(blankToNull, z.string().nullable()).optional(),
  name: z.preprocess(blankToNull, z.string().nullable()).optional(),
  /** Partial token overrides; missing keys inherit from parent. */
  tokensJson: JsonRecord.optional(),
});

/** theme.json inside a v1 theme package ZIP. */
export const PresenceThemePackageManifestSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Theme key must be a lowercase slug'),
  name: RequiredText('Theme name'),
  version: z.string().min(1).max(32),
  description: z.string().max(2000).optional(),
  author: z.string().max(200).optional(),
  /** Parent theme key (WordPress-style child). */
  parent: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
  supports: z.array(z.string().max(64)).max(20).optional(),
  stylesheets: z.array(z.string().max(256)).max(20).optional(),
  scripts: z.array(z.string().max(256)).max(10).optional(),
  chrome: z
    .object({
      header: z.string().max(256).optional(),
      footer: z.string().max(256).optional(),
    })
    .optional(),
  /** Package-relative image path (e.g. preview.png) or https:// URL for card thumbnail. */
  preview: z.string().max(2048).optional(),
  requires: JsonRecord.optional(),
  /**
   * Bundled component packages under the theme root.
   * When omitted, each components/<name>/component.json folder is discovered automatically.
   */
  components: z
    .array(
      z.object({
        path: z.string().min(1).max(256),
        key: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .optional(),
      }),
    )
    .max(50)
    .optional(),
  /** Path to structure.json (navigation, pages, sections). Default site/structure.json. */
  site: z.string().max(256).optional(),
  /**
   * When site structure is present:
   * - none: install look (+ components) only
   * - create_site: new primary draft site
   * - update_primary: replace primary pages (requires confirmReplace)
   * Default: create_site if site structure exists, else none.
   */
  installSite: z.enum(['none', 'create_site', 'update_primary']).optional(),
  /** Locations themes expose for site menus (header/footer chrome). */
  menuLocations: z.array(PresenceMenuLocationSchema).max(20).optional(),
  /** AI suggestion hints for theme ranking. */
  suggest: PresenceSuggestMetaSchema.optional(),
});

export type PresenceThemePackageManifest = z.infer<typeof PresenceThemePackageManifestSchema>;
export type PresenceMenuItem = z.infer<typeof PresenceMenuItemSchema>;
export type PresenceMenu = z.infer<typeof PresenceMenuSchema>;
export type PresenceMenusJson = z.infer<typeof PresenceMenusJsonSchema>;
export type PresenceMenuAssignments = z.infer<typeof PresenceMenuAssignmentsSchema>;
export type PresenceMenuLocation = z.infer<typeof PresenceMenuLocationSchema>;

/** component.json inside a v1 component package ZIP. */
export const PresenceComponentPackageManifestSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Component key must be a lowercase slug'),
  name: RequiredText('Component name'),
  version: z.string().min(1).max(32),
  description: z.string().max(2000).optional(),
  category: PresenceModuleCategorySchema.default('content'),
  rendererKind: z.literal('package').default('package'),
  entry: z
    .object({
      html: z.string().max(256).optional(),
      css: z.array(z.string().max(256)).max(10).optional(),
      js: z.array(z.string().max(256)).max(10).optional(),
    })
    .default({}),
  schema: z.array(PresenceModuleSchemaFieldSchema).default([]),
  defaultProps: JsonRecord.default({}),
  /** Package-relative image path (e.g. preview.png) or https:// URL for card thumbnail. */
  preview: z.string().max(2048).optional(),
  variants: z.array(PresenceModuleVariationSchema).max(40).optional(),
  suggest: PresenceSuggestMetaSchema.optional(),
});

export type PresenceComponentPackageManifest = z.infer<
  typeof PresenceComponentPackageManifestSchema
>;

export const UpsertPresenceModuleDefinitionSchema = z.object({
  key: RequiredText('Module key'),
  name: RequiredText('Module name'),
  category: PresenceModuleCategorySchema.default('content'),
  rendererKey: PresenceRendererKeySchema,
  status: PresenceStatusSchema.default('published'),
  schemaJson: z.array(PresenceModuleSchemaFieldSchema).default([]),
  defaultPropsJson: JsonRecord.default({}),
  previewJson: JsonRecord.nullable().optional(),
  assetsJson: JsonRecord.nullable().optional(),
  styleSchemaJson: z.array(PresenceModuleSchemaFieldSchema).optional(),
  defaultStyleJson: JsonRecord.nullable().optional(),
  variantsJson: z.array(PresenceModuleVariationSchema).max(40).nullable().optional(),
  suggestJson: PresenceSuggestMetaSchema.nullable().optional(),
  templateSource: z.preprocess(blankToNull, z.string().nullable()).optional(),
  moduleSource: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const PublishPresenceAssetVersionSchema = z.object({
  assetType: z.enum(['theme', 'module', 'site_template', 'page_template']),
  assetId: RequiredText('Asset'),
  changelog: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const CreatePresenceMarketplaceListingSchema = z.object({
  sourceAssetVersionId: RequiredText('Asset version'),
  key: RequiredText('Listing key'),
  name: RequiredText('Listing name'),
  category: z.string().min(1).default('general'),
  description: z.preprocess(blankToNull, z.string().nullable()).optional(),
  priceTier: z.enum(['free']).default('free'),
  screenshotsJson: JsonArray.optional(),
  status: PresenceStatusSchema.default('published'),
});

export const InstallPresenceMarketplaceListingSchema = z.object({
  listingId: RequiredText('Listing'),
  key: z.preprocess(blankToNull, z.string().nullable()).optional(),
  name: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const SavePageAsTemplateSchema = z.object({
  key: RequiredText('Template key'),
  name: RequiredText('Template name'),
  category: z.string().min(1).default('page'),
  description: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const UpsertPresenceSiteTemplateSchema = z.object({
  key: RequiredText('Site template key'),
  name: RequiredText('Site template name'),
  category: z.string().min(1).default('marketing'),
  description: z.preprocess(blankToNull, z.string().nullable()).optional(),
  previewUrl: z.preprocess(blankToNull, z.string().nullable()).optional(),
  status: PresenceStatusSchema.default('published'),
  recommendedThemeKeysJson: z.array(z.string().min(1)).optional(),
  suggestJson: PresenceSuggestMetaSchema.nullable().optional(),
  structureJson: JsonRecord,
});

export const UpsertPresencePageTemplateSchema = z.object({
  key: RequiredText('Page template key'),
  name: RequiredText('Page template name'),
  category: z.string().min(1).default('page'),
  description: z.preprocess(blankToNull, z.string().nullable()).optional(),
  previewUrl: z.preprocess(blankToNull, z.string().nullable()).optional(),
  layoutKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
  status: PresenceStatusSchema.default('published'),
  suggestJson: PresenceSuggestMetaSchema.nullable().optional(),
  structureJson: JsonRecord,
});

export const CreatePresenceSiteFromTemplateSchema = z.object({
  name: RequiredText('Site name'),
  kind: PresenceSiteKindSchema.default('marketing'),
  themeId: RequiredText('Theme'),
  siteTemplateId: RequiredText('Site template'),
  isPrimary: z.boolean().optional(),
  suggestJson: PresenceSuggestMetaSchema.nullable().optional(),
});

/** Create a site using the theme's built-in defaultSiteStructure (system full-site themes). */
export const CreatePresenceSiteFromThemeSchema = z.object({
  name: RequiredText('Site name'),
  kind: PresenceSiteKindSchema.default('marketing'),
  themeId: RequiredText('Theme'),
  isPrimary: z.boolean().optional(),
  suggestJson: PresenceSuggestMetaSchema.nullable().optional(),
});

export const CreatePresencePageFromTemplateSchema = z.object({
  siteId: RequiredText('Site'),
  title: RequiredText('Title'),
  path: z.string().min(1).regex(/^\//, 'Path must start with /'),
  pageTemplateId: RequiredText('Page template'),
  position: z.number().int().min(0).optional(),
  suggestJson: PresenceSuggestMetaSchema.nullable().optional(),
});

export const SavePresenceBuilderSchema = z.object({
  title: RequiredText('Title'),
  path: z.string().min(1).regex(/^\//, 'Path must start with /'),
  layoutKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
  layoutMode: z.enum(['flow', 'freeform']).optional(),
  seoJson: JsonRecord.nullable().optional(),
  draftJson: JsonRecord.default({}),
  sections: z.array(
    z.object({
      id: z.preprocess(blankToNull, z.string().nullable()).optional(),
      clientId: z.preprocess(blankToNull, z.string().nullable()).optional(),
      type: PresenceRendererKeySchema,
      moduleDefinitionId: z.preprocess(blankToNull, z.string().nullable()).optional(),
      parentId: z.preprocess(blankToNull, z.string().nullable()).optional(),
      slotKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
      propsJson: JsonRecord.default({}),
      position: z.number().int().min(0),
    }),
  ),
});

export type CreatePresenceSiteInput = z.infer<typeof CreatePresenceSiteSchema>;
export type UpdatePresenceSiteInput = z.infer<typeof UpdatePresenceSiteSchema>;
export type CreatePresencePageInput = z.infer<typeof CreatePresencePageSchema>;
export type UpdatePresencePageInput = z.infer<typeof UpdatePresencePageSchema>;
export type UpsertPresenceSectionInput = z.infer<typeof UpsertPresenceSectionSchema>;
export type UpsertPresenceGlobalSectionInput = z.infer<typeof UpsertPresenceGlobalSectionSchema>;
export type PresenceGlobalSlotKey = z.infer<typeof PresenceGlobalSlotKeySchema>;
export type UpsertPresenceFormInput = z.infer<typeof UpsertPresenceFormSchema>;
export type UpsertPresenceChatWidgetInput = z.infer<typeof UpsertPresenceChatWidgetSchema>;
export type UpsertInboxChatSettingsInput = z.infer<typeof UpsertInboxChatSettingsSchema>;
export type UpsertPresenceThemeInput = z.infer<typeof UpsertPresenceThemeSchema>;
export type ClonePresenceThemeInput = z.infer<typeof ClonePresenceThemeSchema>;
export type CreatePresenceChildThemeInput = z.infer<typeof CreatePresenceChildThemeSchema>;
export type UpsertPresenceModuleDefinitionInput = z.infer<
  typeof UpsertPresenceModuleDefinitionSchema
>;
export type PublishPresenceAssetVersionInput = z.infer<typeof PublishPresenceAssetVersionSchema>;
export type CreatePresenceMarketplaceListingInput = z.infer<
  typeof CreatePresenceMarketplaceListingSchema
>;
export type InstallPresenceMarketplaceListingInput = z.infer<
  typeof InstallPresenceMarketplaceListingSchema
>;
export type SavePageAsTemplateInput = z.infer<typeof SavePageAsTemplateSchema>;
export type UpsertPresenceSiteTemplateInput = z.infer<typeof UpsertPresenceSiteTemplateSchema>;
export type UpsertPresencePageTemplateInput = z.infer<typeof UpsertPresencePageTemplateSchema>;
export type CreatePresenceSiteFromTemplateInput = z.infer<
  typeof CreatePresenceSiteFromTemplateSchema
>;
export type CreatePresenceSiteFromThemeInput = z.infer<typeof CreatePresenceSiteFromThemeSchema>;
export type CreatePresencePageFromTemplateInput = z.infer<
  typeof CreatePresencePageFromTemplateSchema
>;
export type SavePresenceBuilderInput = z.infer<typeof SavePresenceBuilderSchema>;

export const PresenceCatalogReviewTargetTypeSchema = z.enum(['theme', 'module']);

export const ListPresenceCatalogReviewsQuerySchema = z.object({
  targetType: PresenceCatalogReviewTargetTypeSchema,
  targetId: RequiredText('Target id'),
});

export const UpsertPresenceCatalogReviewSchema = z.object({
  targetType: PresenceCatalogReviewTargetTypeSchema,
  targetId: RequiredText('Target id'),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.preprocess(
    blankToNull,
    z.string().trim().max(2000).nullable(),
  ).optional(),
});

export type ListPresenceCatalogReviewsQuery = z.infer<
  typeof ListPresenceCatalogReviewsQuerySchema
>;
export type UpsertPresenceCatalogReviewInput = z.infer<
  typeof UpsertPresenceCatalogReviewSchema
>;

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
  'google_business',
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


/** Send a hotel room enquiry to the supplier via WhatsApp (Cloud or wa.me fallback). */
export const SendHotelEnquiryWhatsappSchema = z.object({
  /** Defaults to the booking supplier phone when omitted. */
  toPhone: z.preprocess(blankToNull, z.string().nullable()).optional(),
  message: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

/** Send a customer payment link via WhatsApp (Cloud or wa.me fallback). */
export const SendTripPaymentLinkWhatsappSchema = z.object({
  /** Defaults to the trip party phone when omitted. */
  toPhone: z.preprocess(blankToNull, z.string().nullable()).optional(),
  message: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

/** Create or reuse a public payment-link token for a customer instalment. */
export const CreateTripPaymentLinkSchema = z.object({
  /** Force a new token even if an unexpired link already exists. */
  regenerate: z.boolean().optional().default(false),
});

/** Staff confirm after manual wa.me payment-link chase. */
export const MarkTripPaymentLinkSentSchema = z.object({
  channel: z.enum(['whatsapp']).default('whatsapp'),
});

/** Staff confirm after manual wa.me voucher summary send. */
export const MarkTripVouchersWhatsappSentSchema = z.object({
  channel: z.enum(['whatsapp']).default('whatsapp'),
  /** Optional subset from the fallback response; defaults to all eligible on the trip. */
  bookingIds: z.array(z.string().min(1)).optional(),
});

/** Send hotel voucher summaries for a trip via WhatsApp (Cloud or wa.me fallback). */
export const SendTripVouchersWhatsappSchema = z.object({
  /** Defaults to the trip party phone when omitted. */
  toPhone: z.preprocess(blankToNull, z.string().nullable()).optional(),
  message: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

/** Email hotel voucher PDF pack for a trip (outbox → SMTP). */
export const SendTripVouchersEmailSchema = z.object({
  /** Defaults to the trip party email when omitted. */
  toEmail: z.preprocess(
    blankToNull,
    z.string().email('Enter a valid email').nullable(),
  ).optional(),
  message: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

/** Send a quotation proposal by email (PDF attachment via outbox). */
export const SendQuoteEmailSchema = z.object({
  toEmail: z.string().trim().email('Enter a valid email'),
  /**
   * When true and the quote is near-expiry or in post-expiry grace, refresh validUntil
   * to org default. Omit / false → keep the current date. Past grace still blocks.
   */
  extendValidity: z.boolean().optional().default(false),
});

/** Send a quotation proposal via WhatsApp Cloud (session text + public share link). */
export const SendQuoteWhatsappSchema = z.object({
  toPhone: RequiredText('WhatsApp number'),
  /** Optional custom message; default includes trip title + proposal link. */
  message: z.preprocess(blankToNull, z.string().nullable()).optional(),
  /** Same as email: opt-in extend while near-expiry or in post-expiry grace. */
  extendValidity: z.boolean().optional().default(false),
});

/** Staff confirms a manual WhatsApp (wa.me) send after Cloud was unavailable. */
export const MarkQuoteSentSchema = z.object({
  channel: z.enum(['whatsapp']).default('whatsapp'),
  /** Opt-in extend while near-expiry or in post-expiry grace (same as send). */
  extendValidity: z.boolean().optional().default(false),
});

/** Request manager approval for a draft quote. */
export const RequestQuoteApprovalSchema = z.object({
  /** Opt-in extend while near-expiry or in post-expiry grace (same as send). */
  extendValidity: z.boolean().optional().default(false),
});

/** Public client accept of a shared proposal (PIN required when share has one). */
export const AcceptPublicQuoteSchema = z.object({
  pin: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

/** Client-reported FIT quote build time (workspace open → first send). */
export const RecordQuoteFitTimingSchema = z.object({
  quotationVersionId: RequiredText('Quotation version'),
  /** Epoch ms when the quotations workspace was opened for this attempt. */
  openedAtMs: z.number().int().positive(),
  milestone: z.enum(['first_send']).default('first_send'),
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

/** Reply on a Website chat touch — stored for the visitor widget to poll. */
export const ReplyWebsiteSchema = z.object({
  text: RequiredText('Message'),
});

/** Public widget poll for agent replies (after an inbound website chat). */
export const WidgetMessagesQuerySchema = z.object({
  publicKey: RequiredText('Public key'),
  conversationId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  email: OptionalEmail,
  phone: OptionalPhone,
  /** ISO timestamp or ms — only messages after this (exclusive). */
  after: z.preprocess(blankToNull, z.string().nullable()).optional(),
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

/** Trip override for GST display destination POS (blank/null clears → org default). */
export const UpdateTripDestinationPlaceOfSupplySchema = z.object({
  destinationPlaceOfSupply: z.preprocess(
    blankToNull,
    z.string().max(64).nullable(),
  ),
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

/** Patch traveller fields linked to a trip (nationality for hotel Match defaults). */
export const UpdateTravellerSchema = z.object({
  nationality: z.preprocess(blankToNull, z.string().nullable()).optional(),
  fullName: z.preprocess(blankToNull, z.string().min(1).nullable()).optional(),
  type: z.enum(['adult', 'child', 'infant']).optional(),
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

export const QuoteServiceTypeSchema = z.enum([
  'hotel',
  'transfer',
  'activity',
  'flight',
  'train',
  'visa',
  'meal',
  'guide',
  'insurance',
  'fee',
  'discount',
  'custom',
]);

/** Structured commercial fields for hotel / transport / activity quote lines. */
export const QuoteHotelRateBasisSchema = z.enum([
  'per_room_night',
  'per_room_stay',
  'per_person_night',
  'per_person_stay',
  'package_total',
]);
export const QuoteMarkupModeSchema = z.enum(['percent', 'fixed']);
export const QuotePriceSourceSchema = z.enum([
  'matched',
  'manual',
  'none',
  'expired',
  'overridden',
]);
export const QuoteAvailabilitySchema = z.enum([
  'unknown',
  'available',
  'on_request',
  'confirmed',
]);

export const QuotationItemDetailsSchema = z
  .object({
    /** Destination / city for the stay or service. */
    placeId: z.string().optional(),
    placeName: z.string().optional(),
    /** Accommodation being sold (may differ from commercial supplier). */
    propertyName: z.string().optional(),
    supplierId: z.string().optional(),
    supplierName: z.string().optional(),
    roomType: z.string().optional(),
    /** Canonical AssetRoomProduct id when known. */
    roomProductId: z.string().optional(),
    mealPlan: z.string().optional(),
    /** Guest market for hotel Match: IN | INTL | ISO country (foreign → INTL). */
    nationality: z.string().optional(),
    /**
     * Multi-guest nationalities in the room (IN / INTL / ISO-2).
     * Match collapses to one effective code (IN+foreign / multi-ISO → INTL).
     */
    nationalities: z.array(z.string()).max(12).optional(),
    /**
     * Trip traveller id who sleeps alone on uneven DBL+SGL boards
     * (last nationality bag slot → SGL).
     */
    aloneTravellerId: z.string().optional(),
    nights: z.number().optional(),
    rooms: z.number().optional(),
    checkIn: z.string().optional(),
    checkOut: z.string().optional(),
    adults: z.number().optional(),
    children: z.number().optional(),
    /** Infants on transfer per_adult (and party stamp). */
    infants: z.number().optional(),
    childAges: z.array(z.number()).optional(),
    extraBeds: z.number().optional(),
    childrenWithoutBed: z.number().optional(),
    rateBasis: QuoteHotelRateBasisSchema.optional(),
    markupMode: QuoteMarkupModeSchema.optional(),
    markupValue: z.number().optional(),
    /** True when sell was typed manually instead of following markup. */
    sellManual: z.boolean().optional(),
    priceSource: QuotePriceSourceSchema.optional(),
    rateLabel: z.string().optional(),
    rateSupplierLabel: z.string().optional(),
    rateValidFrom: z.string().optional(),
    rateValidTo: z.string().optional(),
    rateLastUpdated: z.string().optional(),
    availability: QuoteAvailabilitySchema.optional(),
    cancellationPolicy: z.string().optional(),
    supplementsNote: z.string().optional(),
    extraBedCharge: z.number().optional(),
    childCharge: z.number().optional(),
    internalNotes: z.string().optional(),
    customerNotes: z.string().optional(),
    /** Custom line unit label (item, day, person, service…). */
    unitLabel: z.string().optional(),
    fromPlaceId: z.string().optional(),
    fromPlaceName: z.string().optional(),
    toPlaceId: z.string().optional(),
    toPlaceName: z.string().optional(),
    /** ISO country name/code when known — used for route plausibility warnings. */
    fromCountry: z.string().optional(),
    toCountry: z.string().optional(),
    vehicleTypeId: z.string().optional(),
    vehicleLabel: z.string().optional(),
    serviceDate: z.string().optional(),
    /** Authorised override when service date is outside the trip window. */
    serviceDateOutsideTripOverride: z.boolean().optional(),
    vehicles: z.number().optional(),
    /** Confirmed unusually large vehicle quantity before save. */
    unusualVehiclesConfirmed: z.boolean().optional(),
    activityDate: z.string().optional(),
    activityTime: z.string().optional(),
    privateOrSic: z.enum(['private', 'sic']).optional(),
  })
  .partial();

/** Snapshot of the directory rate that priced a quote line (survives rematch/manual edits of sell). */
export const QuoteRateProvenanceSchema = z.object({
  rateId: z.string().optional(),
  rateKind: z.enum(['hotel', 'transfer', 'activity']).optional(),
  matchedAt: z.string().optional(),
  unitCostAtMatch: z.number().optional(),
  isSystem: z.boolean().optional(),
  supplierId: z.string().optional(),
  placeId: z.string().optional(),
  roomType: z.string().optional(),
  roomProductId: z.string().optional(),
  mealPlan: z.string().optional(),
  nationality: z.string().optional(),
  rateVersionNumber: z.number().optional(),
  pricingMode: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  rateUpdatedAt: z.string().optional(),
  /**
   * Chart `updatedAt` the editor acknowledged without rematching.
   * Send / approval is blocked while live chart is newer and this stamp does not match.
   */
  rateDriftAckForUpdatedAt: z.string().optional(),
  /** Editor reason recorded with Keep-buy acknowledge for chart drift. */
  rateDriftAckReason: z.string().optional(),
  /** Allotment cue from last Match / availability check (hotel). */
  allotmentNote: z.string().optional(),
  /** True when allotment is insufficient (zero or shortfall) — blocks send unless acked. */
  allotmentWarn: z.boolean().optional(),
  /** `allotmentNote` fingerprint acknowledged to allow send despite shortfall. */
  allotmentRiskAckForNote: z.string().optional(),
  /** Editor reason recorded with allotment shortfall acknowledge. */
  allotmentRiskAckReason: z.string().optional(),
  /** Capacity cue from last Match (transfer — party vs seats × vehicles). */
  capacityNote: z.string().optional(),
  /** True when capacity is insufficient (party over seats × vehicles) — blocks send unless acked. */
  capacityWarn: z.boolean().optional(),
  /** `capacityNote` fingerprint acknowledged to allow send despite shortfall. */
  capacityRiskAckForNote: z.string().optional(),
  /** Editor reason recorded with capacity shortfall acknowledge. */
  capacityRiskAckReason: z.string().optional(),
  /** Min-stay shortfall cue from last Match (hotel). */
  minStayNote: z.string().optional(),
  /** True when stay nights &lt; rate min stay — blocks send unless acked. */
  minStayWarn: z.boolean().optional(),
  /** `minStayNote` fingerprint acknowledged to allow send despite shortfall. */
  minStayRiskAckForNote: z.string().optional(),
  /** Editor reason recorded with min-stay shortfall acknowledge. */
  minStayRiskAckReason: z.string().optional(),
  /** Seats per vehicle from last Match — used to restamp capacity when Vehicles change without rematch. */
  vehicleSeats: z.number().optional(),
  currency: z.string().optional(),
  weekendUnitCost: z.number().nullable().optional(),
  fromPlaceId: z.string().optional(),
  toPlaceId: z.string().optional(),
  vehicleTypeId: z.string().optional(),
  contractId: z.string().optional(),
  contractTitle: z.string().optional(),
  contractVersionNumber: z.number().optional(),
  calculation: z
    .object({
      weekdayNights: z.number().optional(),
      weekendNights: z.number().optional(),
      weekdayUnit: z.number().optional(),
      weekendUnit: z.number().nullable().optional(),
      rooms: z.number().optional(),
      totalBuy: z.number().optional(),
      baseRoomTotal: z.number().optional(),
      occupancyExtraTotal: z.number().optional(),
      extraAdultCount: z.number().optional(),
      childWithBedCount: z.number().optional(),
      childWithoutBedCount: z.number().optional(),
      adultBandAdults: z.number().optional(),
      adultBandUnitCost: z.number().optional(),
      adultBandWeekendUnitCost: z.number().optional(),
      adultsPerRoom: z.number().optional(),
      minStayNights: z.number().optional(),
      stayNights: z.number().optional(),
      minStayShort: z.boolean().optional(),
      minStayNote: z.string().optional(),
      nationality: z.string().nullable().optional(),
      guestNationality: z.string().nullable().optional(),
      /** Distinct guest codes before collapse (when mixed). */
      guestNationalities: z.array(z.string()).max(12).optional(),
      guestNationalityMixed: z.boolean().optional(),
      /** Mixed-nationality per-adult / composed-room buy (hotel Match). */
      buyMode: z.enum(['per_pax_split']).optional(),
      /** equal = DBL/2 or TPL/3; dbl_sgl = 3A/2R composed double+single. */
      composition: z.enum(['equal', 'dbl_sgl']).optional(),
      paxBuySplitTotalPerNight: z.number().optional(),
      paxBuySplits: z
        .array(
          z.object({
            nationality: z.string(),
            adults: z.number().optional(),
            sharePerNight: z.number(),
            tipRateId: z.string().optional(),
            tipBandAdults: z.number().optional(),
            tipUnitCostPerNight: z.number().optional(),
            tipWeekendUnitCostPerNight: z.number().nullable().optional(),
          }),
        )
        .max(8)
        .optional(),
      dateSupplementTotal: z.number().optional(),
      dateSupplements: z
        .array(
          z.object({
            night: z.string().optional(),
            label: z.string().optional(),
            amount: z.number().optional(),
            rooms: z.number().optional(),
          }),
        )
        .optional(),
      cancellationSummary: z.string().optional(),
      adultUnit: z.number().optional(),
      childUnit: z.number().optional(),
      infantUnit: z.number().optional(),
      adults: z.number().optional(),
      children: z.number().optional(),
      infants: z.number().optional(),
      adultsCharged: z.number().optional(),
      childrenCharged: z.number().optional(),
      infantsCharged: z.number().optional(),
      partyAdults: z.number().optional(),
      partyChildren: z.number().optional(),
      partyInfants: z.number().optional(),
      childAgeMin: z.number().optional(),
      childAgeMax: z.number().optional(),
      usedChildAges: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
  matchSummary: z.string().optional(),
});

export const QuotationItemSchema = z.object({
  id: z.string(),
  description: RequiredText('Description'),
  quantity: z.number(),
  /** null = not entered yet; 0 = intentionally free. */
  unitCost: z.number().nullable(),
  /** null = not entered yet; 0 = intentionally free. */
  unitSell: z.number().nullable(),
  taxPercent: z.number().default(0),
  pricingUnit: z.enum(['per_person', 'per_room', 'per_service', 'package']).default('per_service'),
  serviceType: QuoteServiceTypeSchema.optional(),
  /** Provenance when priced from agency rate directory. */
  rateKind: z.enum(['hotel', 'transfer', 'activity']).optional(),
  rateId: z.string().optional(),
  /** True when hotel/transfer/activity had no matching rate card. */
  rateUnmatched: z.boolean().optional(),
  /** Why resolve blocked the match (blackout / stop-sell). */
  rateBlockReason: z.enum(['blackout', 'stop_sell']).optional(),
  /** Durable snapshot of the matched rate card (not rewritten by sell overrides). */
  rateProvenance: QuoteRateProvenanceSchema.optional(),
  /** Type-specific commercial details (hotel stay, transfer route, activity). */
  details: QuotationItemDetailsSchema.optional(),
  /** Audit when a line was marked included / non-billable at ₹0. */
  includedMeta: z
    .object({
      at: z.string(),
      reason: z.string(),
      previousUnitCost: z.number().nullable().optional(),
      previousUnitSell: z.number().nullable().optional(),
      byUserId: z.string().optional(),
    })
    .optional(),
  /** Authorised override when sell is below cost or below org min margin %. */
  marginOverride: z
    .object({
      at: z.string(),
      reason: z.string().min(1),
      byUserId: z.string().optional(),
      unitCost: z.number().optional(),
      unitSell: z.number().optional(),
    })
    .optional(),
});

export const HotelOccupancyPricingSchema = z
  .object({
    baseAdults: z.number().int().min(1).max(12).optional(),
    baseChildren: z.number().int().min(0).max(12).optional(),
    childAgeMax: z.number().int().min(0).max(17).optional(),
    extraAdultPerNight: z.number().nonnegative().optional(),
    childWithBedPerNight: z.number().nonnegative().optional(),
    childWithoutBedPerNight: z.number().nonnegative().optional(),
    /** SGL/DBL/TPL weekday bases (≤3). Meal stays on the season row. */
    adultBands: z
      .array(
        z.object({
          adults: z.number().int().min(1).max(3),
          unitCostPerNight: z.number().nonnegative(),
          weekendUnitCostPerNight: z.number().nonnegative().optional(),
        }),
      )
      .max(3)
      .optional(),
    minStayNights: z.number().int().min(1).max(30).optional(),
    /** IN | INTL — blank/omit = any nationality. */
    nationality: z.string().max(8).optional(),
  })
  .nullable()
  .optional();

export const CreateSupplierHotelRateSchema = z.object({
  supplierId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  placeId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  roomType: z.preprocess(blankToNull, z.string().nullable()).optional(),
  roomProductId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  contractId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  mealPlan: z.preprocess(blankToNull, z.string().nullable()).optional(),
  unitCost: z.number().nonnegative(),
  weekendUnitCost: z.number().nonnegative().nullable().optional(),
  occupancyPricing: HotelOccupancyPricingSchema,
  currency: z.string().length(3).optional(),
  startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  endDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  isActive: z.boolean().optional(),
});

export const UpdateSupplierHotelRateSchema = z.object({
  supplierId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  placeId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  roomType: z.preprocess(blankToNull, z.string().nullable()).optional(),
  roomProductId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  contractId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  mealPlan: z.preprocess(blankToNull, z.string().nullable()).optional(),
  unitCost: z.number().nonnegative().optional(),
  weekendUnitCost: z.number().nonnegative().nullable().optional(),
  occupancyPricing: HotelOccupancyPricingSchema,
  currency: z.string().length(3).optional(),
  startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  endDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  isActive: z.boolean().optional(),
});

/** Restore a historical hotel rate tip as a new active version. */
export const RestoreHotelRateVersionSchema = z.object({
  sourceVersionId: z.string().min(1),
});

/** Restore one commercial field from a historical tip onto a new tip. */
export const RestoreHotelRateFieldSchema = z.object({
  sourceVersionId: z.string().min(1),
  field: z.enum([
    'unitCost',
    'weekendUnitCost',
    'mealPlan',
    'startDate',
    'endDate',
    'dates',
  ]),
});

/** Restore a historical transfer fare tip as a new active version. */
export const RestoreTransferFareVersionSchema = z.object({
  sourceVersionId: z.string().min(1),
});

/** Restore a historical activity rate tip as a new active version. */
export const RestoreActivityRateVersionSchema = z.object({
  sourceVersionId: z.string().min(1),
});

export const ActivityPrivateOrSicSchema = z.enum(['private', 'sic']);

export const CreateSupplierActivityRateSchema = z.object({
  supplierId: RequiredText('Supplier'),
  placeId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  activityName: RequiredText('Activity name'),
  privateOrSic: ActivityPrivateOrSicSchema.nullable().optional(),
  adultUnitCost: z.number().nonnegative(),
  childUnitCost: z.number().nonnegative().nullable().optional(),
  childAgeMin: z.number().int().min(0).max(17).nullable().optional(),
  childAgeMax: z.number().int().min(0).max(17).nullable().optional(),
  currency: z.string().length(3).optional(),
  startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  endDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  isActive: z.boolean().optional(),
});

export const UpdateSupplierActivityRateSchema = z.object({
  placeId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  activityName: z.string().min(1).optional(),
  privateOrSic: ActivityPrivateOrSicSchema.nullable().optional(),
  adultUnitCost: z.number().nonnegative().optional(),
  childUnitCost: z.number().nonnegative().nullable().optional(),
  childAgeMin: z.number().int().min(0).max(17).nullable().optional(),
  childAgeMax: z.number().int().min(0).max(17).nullable().optional(),
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
  /** Transport supplier chart row; omit for org/system catalog. */
  supplierId: z.string().min(1).optional(),
  unitCost: z.number().nonnegative(),
  childUnitCost: z.number().nonnegative().nullable().optional(),
  infantUnitCost: z.number().nonnegative().nullable().optional(),
  childAgeMin: z.number().int().min(0).max(17).nullable().optional(),
  childAgeMax: z.number().int().min(0).max(17).nullable().optional(),
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
  supplierId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  unitCost: z.number().nonnegative().optional(),
  childUnitCost: z.number().nonnegative().nullable().optional(),
  infantUnitCost: z.number().nonnegative().nullable().optional(),
  childAgeMin: z.number().int().min(0).max(17).nullable().optional(),
  childAgeMax: z.number().int().min(0).max(17).nullable().optional(),
  pricingMode: TransferFarePricingModeSchema.optional(),
  currency: z.string().length(3).optional(),
  startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  endDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  isActive: z.boolean().optional(),
});

/** One hotel rate sheet row (names/keys resolved server-side). */
export const ImportHotelRateCsvRowSchema = z
  .object({
    supplierName: z.preprocess(blankToNull, z.string().nullable()).optional(),
    placeName: z.preprocess(blankToNull, z.string().nullable()).optional(),
    placeKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
    roomType: z.preprocess(blankToNull, z.string().nullable()).optional(),
    mealPlan: z.preprocess(blankToNull, z.string().nullable()).optional(),
    /** Required for legacy single-meal rows; optional when meal-prefixed cols present. */
    unitCost: z.number().nonnegative().optional(),
    weekendUnitCost: z.number().nonnegative().nullable().optional(),
    /** Optional SGL/DBL/TPL weekday + weekend (absolute) — builds adultBands. */
    sglUnitCost: z.number().nonnegative().nullable().optional(),
    sglWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    dblUnitCost: z.number().nonnegative().nullable().optional(),
    dblWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    tplUnitCost: z.number().nonnegative().nullable().optional(),
    tplWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    /** Meal×occupancy expand: EP/CP/MAP/AP prefixed chart + band cols. */
    epUnitCost: z.number().nonnegative().nullable().optional(),
    epWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    epSglUnitCost: z.number().nonnegative().nullable().optional(),
    epSglWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    epDblUnitCost: z.number().nonnegative().nullable().optional(),
    epDblWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    epTplUnitCost: z.number().nonnegative().nullable().optional(),
    epTplWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    cpUnitCost: z.number().nonnegative().nullable().optional(),
    cpWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    cpSglUnitCost: z.number().nonnegative().nullable().optional(),
    cpSglWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    cpDblUnitCost: z.number().nonnegative().nullable().optional(),
    cpDblWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    cpTplUnitCost: z.number().nonnegative().nullable().optional(),
    cpTplWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    mapUnitCost: z.number().nonnegative().nullable().optional(),
    mapWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    mapSglUnitCost: z.number().nonnegative().nullable().optional(),
    mapSglWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    mapDblUnitCost: z.number().nonnegative().nullable().optional(),
    mapDblWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    mapTplUnitCost: z.number().nonnegative().nullable().optional(),
    mapTplWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    apUnitCost: z.number().nonnegative().nullable().optional(),
    apWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    apSglUnitCost: z.number().nonnegative().nullable().optional(),
    apSglWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    apDblUnitCost: z.number().nonnegative().nullable().optional(),
    apDblWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    apTplUnitCost: z.number().nonnegative().nullable().optional(),
    apTplWeekendUnitCost: z.number().nonnegative().nullable().optional(),
    currency: z.string().length(3).optional(),
    startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
    endDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  })
  .superRefine((row, ctx) => {
    const matrixKeys = [
      'epUnitCost',
      'epSglUnitCost',
      'epDblUnitCost',
      'epTplUnitCost',
      'cpUnitCost',
      'cpSglUnitCost',
      'cpDblUnitCost',
      'cpTplUnitCost',
      'mapUnitCost',
      'mapSglUnitCost',
      'mapDblUnitCost',
      'mapTplUnitCost',
      'apUnitCost',
      'apSglUnitCost',
      'apDblUnitCost',
      'apTplUnitCost',
    ] as const;
    const hasMatrix = matrixKeys.some((k) => {
      const v = row[k];
      return typeof v === 'number' && Number.isFinite(v) && v >= 0;
    });
    if (!hasMatrix && (row.unitCost == null || !Number.isFinite(row.unitCost))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'unitCost is required when meal-prefixed columns are absent',
        path: ['unitCost'],
      });
    }
  });

export const ImportHotelRateCsvSchema = z.object({
  rows: z.array(ImportHotelRateCsvRowSchema).min(1).max(500),
  /** false = validation preview only; true = create rates. */
  commit: z.boolean().optional().default(false),
  fileName: z.preprocess(blankToNull, z.string().nullable()).optional(),
  lockedSupplierName: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

/** One activity rate sheet row (names/keys resolved server-side). */
export const ImportActivityRateCsvRowSchema = z.object({
  supplierName: RequiredText('Supplier name'),
  placeName: z.preprocess(blankToNull, z.string().nullable()).optional(),
  placeKey: z.preprocess(blankToNull, z.string().nullable()).optional(),
  activityName: RequiredText('Activity name'),
  privateOrSic: ActivityPrivateOrSicSchema.nullable().optional(),
  adultUnitCost: z.number().nonnegative(),
  childUnitCost: z.number().nonnegative().nullable().optional(),
  childAgeMin: z.number().int().min(0).max(17).nullable().optional(),
  childAgeMax: z.number().int().min(0).max(17).nullable().optional(),
  currency: z.string().length(3).optional(),
  startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  endDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const ImportActivityRateCsvSchema = z.object({
  rows: z.array(ImportActivityRateCsvRowSchema).min(1).max(500),
  commit: z.boolean().optional().default(false),
  fileName: z.preprocess(blankToNull, z.string().nullable()).optional(),
  lockedSupplierName: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

/** One transfer fare sheet row. */
export const ImportTransferFareCsvRowSchema = z.object({
  supplierName: z.preprocess(blankToNull, z.string().nullable()).optional(),
  fromPlace: RequiredText('From place'),
  toPlace: RequiredText('To place'),
  vehicleType: RequiredText('Vehicle type'),
  unitCost: z.number().nonnegative(),
  childUnitCost: z.number().nonnegative().nullable().optional(),
  infantUnitCost: z.number().nonnegative().nullable().optional(),
  childAgeMin: z.number().int().min(0).max(17).nullable().optional(),
  childAgeMax: z.number().int().min(0).max(17).nullable().optional(),
  pricingMode: TransferFarePricingModeSchema.optional(),
  currency: z.string().length(3).optional(),
  startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  endDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
});

export const ImportTransferFareCsvSchema = z.object({
  rows: z.array(ImportTransferFareCsvRowSchema).min(1).max(500),
  commit: z.boolean().optional().default(false),
  fileName: z.preprocess(blankToNull, z.string().nullable()).optional(),
  lockedSupplierName: z.preprocess(blankToNull, z.string().nullable()).optional(),
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
      roomProductId: z.string().optional(),
      mealPlan: z.string().optional(),
      nights: z.number().optional(),
      rooms: z.number().optional(),
      adults: z.number().optional(),
      children: z.number().optional(),
      infants: z.number().optional(),
      childrenWithoutBed: z.number().optional(),
      childAges: z.array(z.number()).optional(),
      /** Guest nationality for hotel market Match (IN / INTL / ISO). */
      nationality: z.string().optional(),
      /** Multi-guest nationalities (collapsed on Match). */
      nationalities: z.array(z.string()).max(12).optional(),
      vehicleTypeId: z.string().optional(),
      fromPlaceId: z.string().optional(),
      toPlaceId: z.string().optional(),
      /** Activity / sightseeing match keys. */
      propertyName: z.string().optional(),
      activityName: z.string().optional(),
      privateOrSic: z.enum(['private', 'sic']).optional(),
    })
    .partial()
    .optional(),
});

export const ResolveRatesSchema = z.object({
  startDate: z.preprocess(blankToNull, z.string().nullable()).optional(),
  adults: z.number().int().nonnegative().optional(),
  children: z.number().int().nonnegative().optional(),
  infants: z.number().int().nonnegative().optional(),
  /** Lead / party nationality for hotel market Match (IN / INTL / ISO). */
  nationality: z.preprocess(blankToNull, z.string().nullable()).optional(),
  /** Multi-guest nationalities when party has mixed markets. */
  nationalities: z.array(z.string()).max(12).optional(),
  /** When set, resolve may use agentMarkupPercent for trade/B2B parties. */
  partyId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  items: z.array(ResolveRatesItemSchema).min(1).max(200),
});

/** Batch chart `updatedAt` lookup for quote rate-drift preflight. */
export const ChartFreshnessItemSchema = z.object({
  rateId: z.string().min(1),
  rateKind: z.enum(['hotel', 'transfer', 'activity']).optional().nullable(),
});

export const ChartFreshnessSchema = z.object({
  items: z.array(ChartFreshnessItemSchema).min(1).max(200),
});

export const SaveQuotationVersionSchema = z.object({
  label: z.preprocess(blankToNull, z.string().max(80).nullable()).optional(),
  currency: z.string().length(3).default('INR'),
  validUntil: z.preprocess(blankToNull, z.string().nullable()).optional(),
  items: z.array(QuotationItemSchema),
  inclusions: z.preprocess(blankToNull, z.string().nullable()).optional(),
  exclusions: z.preprocess(blankToNull, z.string().nullable()).optional(),
  terms: z.preprocess(blankToNull, z.string().nullable()).optional(),
  discountTotal: z.number().default(0),
  expectedLock: z.number().int().optional(),
});

/** Lock FX for a draft quotation version (INR book → quote currency). */
export const LockQuoteFxSchema = z.object({
  quoteCurrency: z.string().length(3),
  /** Units of org/base currency per 1 quote unit (e.g. 83.25 INR per USD). */
  rate: z.number().positive().optional(),
  /** When true, convert existing INR line buy/sell into quote currency. */
  convertLines: z.boolean().optional().default(true),
});
export type LockQuoteFxInput = z.infer<typeof LockQuoteFxSchema>;

/** Authorise below-cost / below-floor margin on selected quotation lines. */
export const RecordQuoteMarginOverridesSchema = z.object({
  reason: RequiredText('Override reason'),
  lineIds: z.array(z.string().min(1)).min(1).max(200),
});
export type RecordQuoteMarginOverridesInput = z.infer<typeof RecordQuoteMarginOverridesSchema>;

/**
 * Manager-gated allotment / capacity / min-stay send-anyway (`inventory_risk.approve`).
 * Stamps note fingerprint + reason on selected lines that currently block send.
 */
export const RecordQuoteInventoryRiskAcksSchema = z.object({
  reason: RequiredText('Override reason'),
  lineIds: z.array(z.string().min(1)).min(1).max(200),
});
export type RecordQuoteInventoryRiskAcksInput = z.infer<
  typeof RecordQuoteInventoryRiskAcksSchema
>;

/**
 * Manager-gated Keep-buy for rate-chart drift (`rate_drift.approve`).
 * Server stamps live chart `updatedAt` + reason on selected lines that currently block send.
 */
export const RecordQuoteRateDriftAcksSchema = z.object({
  reason: RequiredText('Override reason'),
  lineIds: z.array(z.string().min(1)).min(1).max(200),
});
export type RecordQuoteRateDriftAcksInput = z.infer<
  typeof RecordQuoteRateDriftAcksSchema
>;

/**
 * Story itinerary snapshot inside a quote template (days + optional story meta).
 * Days are stored loosely so imperfect legacy rows do not invalidate the whole template.
 */
export const QuoteTemplateItinerarySchema = z.object({
  days: z.array(z.record(z.string(), z.unknown())).max(90).optional(),
  story: z.record(z.string(), z.unknown()).optional(),
});

/** Reusable quote skeleton stored in QuoteTemplate.contentJson (legacy array checklists allowed). */
export const QuoteTemplateContentSchema = z.object({
  currency: z.string().length(3).optional(),
  items: z.array(QuotationItemSchema).optional(),
  inclusions: z.union([z.string(), z.array(z.string())]).optional(),
  exclusions: z.union([z.string(), z.array(z.string())]).optional(),
  terms: z.preprocess(blankToNull, z.string().nullable()).optional(),
  destinationHint: z.preprocess(blankToNull, z.string().nullable()).optional(),
  /** Lightweight organize labels (no folders) — max 12 × 40 chars. */
  tags: z.array(z.string().min(1).max(40)).max(12).optional(),
  /** Optional folder path (`Hill stations/Darjeeling`) — max 80 chars. */
  folder: z.preprocess(blankToNull, z.string().max(80).nullable()).optional(),
  /** Trip Story days/meta captured at save-as-template time. */
  itinerary: QuoteTemplateItinerarySchema.optional(),
});

export const CreateQuoteTemplateSchema = z
  .object({
    name: RequiredText('Template name'),
    contentJson: QuoteTemplateContentSchema.optional(),
    /** When set, copy items/meta from this quotation version (org-scoped). */
    versionId: z.string().min(1).optional(),
    /** When set, embed the trip’s latest story itinerary into the template. */
    tripId: z.string().min(1).optional(),
    /** Explicitly supersede this active template (creates next version). */
    supersedeTemplateId: z.string().min(1).optional(),
    /** Force a new template family even when the name matches an active one. */
    asNew: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.contentJson || v.versionId), {
    message: 'Provide contentJson or versionId',
  });

export const UpdateQuoteTemplateSchema = z.object({
  name: RequiredText('Template name').optional(),
  contentJson: QuoteTemplateContentSchema.optional(),
});

/** Bulk rename/move package template folder path prefix. */
export const RenameQuoteTemplateFolderSchema = z.object({
  /** Existing folder path prefix (exact or ancestor of template folders). */
  fromFolder: RequiredText('From folder'),
  /**
   * New path prefix. Empty string clears the matched prefix
   * (child remainder kept at root).
   */
  toFolder: z.preprocess(
    (v) => (v == null ? '' : v),
    z.string().max(80),
  ),
});

/** Restore a prior (usually superseded) template version as a new active tip. */
export const RestoreQuoteTemplateSchema = z.object({
  /** Template row to copy content from (must be in the same supersedes chain). */
  fromTemplateId: RequiredText('Template version'),
});

export const ApplyQuoteTemplateSchema = z.object({
  templateId: RequiredText('Template'),
  /**
   * Travel start (YYYY-MM-DD). Required when the trip has no startDate —
   * stamps the trip then shifts template line dates.
   */
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Travel start must be YYYY-MM-DD')
    .optional(),
  /** Party size stamped onto hotel/transfer/activity lines before rematch. */
  adults: z.number().int().min(1, 'At least 1 adult').max(99).optional(),
  children: z.number().int().min(0).max(99).optional(),
  /** Child ages (years) — length padded/truncated to `children` on apply. */
  childAges: z.array(z.number().int().min(0).max(17)).max(99).optional(),
  /** Hotel occupancy: children priced without bed (≤ children). */
  childrenWithoutBed: z.number().int().min(0).max(99).optional(),
});

export const CloneQuotationSchema = z.object({
  versionId: z.string().min(1).optional(),
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

export const ConfirmTripPaymentLinkSchema = z.object({
  mock: z.boolean().optional(),
  razorpayPaymentId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  razorpayOrderId: z.preprocess(blankToNull, z.string().nullable()).optional(),
  razorpaySignature: z.preprocess(blankToNull, z.string().nullable()).optional(),
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
export type SendHotelEnquiryWhatsappInput = z.infer<typeof SendHotelEnquiryWhatsappSchema>;
export type SendTripPaymentLinkWhatsappInput = z.infer<
  typeof SendTripPaymentLinkWhatsappSchema
>;
export type CreateTripPaymentLinkInput = z.infer<typeof CreateTripPaymentLinkSchema>;
export type MarkTripPaymentLinkSentInput = z.infer<typeof MarkTripPaymentLinkSentSchema>;
export type MarkTripVouchersWhatsappSentInput = z.infer<
  typeof MarkTripVouchersWhatsappSentSchema
>;
export type SendTripVouchersWhatsappInput = z.infer<typeof SendTripVouchersWhatsappSchema>;
export type SendTripVouchersEmailInput = z.infer<typeof SendTripVouchersEmailSchema>;
export type SendQuoteEmailInput = z.infer<typeof SendQuoteEmailSchema>;
export type SendQuoteWhatsappInput = z.infer<typeof SendQuoteWhatsappSchema>;
export type MarkQuoteSentInput = z.infer<typeof MarkQuoteSentSchema>;
export type RequestQuoteApprovalInput = z.infer<typeof RequestQuoteApprovalSchema>;
export type AcceptPublicQuoteInput = z.infer<typeof AcceptPublicQuoteSchema>;
export type RecordQuoteFitTimingInput = z.infer<typeof RecordQuoteFitTimingSchema>;
export type ReplyWhatsappTemplateInput = z.infer<typeof ReplyWhatsappTemplateSchema>;
export type CreateWhatsAppTemplateInput = z.infer<typeof CreateWhatsAppTemplateSchema>;
export type UpdateWhatsAppTemplateInput = z.infer<typeof UpdateWhatsAppTemplateSchema>;
export type ReplyEmailInput = z.infer<typeof ReplyEmailSchema>;
export type ReplyWebsiteInput = z.infer<typeof ReplyWebsiteSchema>;
export type WidgetMessagesQueryInput = z.infer<typeof WidgetMessagesQuerySchema>;
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
export type UpdateInventoryAllocationInput = z.infer<
  typeof UpdateInventoryAllocationSchema
>;
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
export type UpdateSupplierInput = z.infer<typeof UpdateSupplierSchema>;
export type UpdateTripDestinationsInput = z.infer<typeof UpdateTripDestinationsSchema>;
export type UpdateTripDestinationPlaceOfSupplyInput = z.infer<
  typeof UpdateTripDestinationPlaceOfSupplySchema
>;
export type CreateRoomTypeInput = z.infer<typeof CreateRoomTypeSchema>;
export type CreateVehicleTypeInput = z.infer<typeof CreateVehicleTypeSchema>;
export type CreateInquiryInput = z.infer<typeof CreateInquirySchema>;
export type UpdateInquiryInput = z.infer<typeof UpdateInquirySchema>;
export type UpdateInquiryStatusInput = z.infer<typeof UpdateInquiryStatusSchema>;
export type CreateTripInput = z.infer<typeof CreateTripSchema>;
export type CreateTripFromPackageInput = z.infer<typeof CreateTripFromPackageSchema>;
export type UpdateTripDatesInput = z.infer<typeof UpdateTripDatesSchema>;
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
export type QuotationItemDetails = z.infer<typeof QuotationItemDetailsSchema>;
export type QuoteRateProvenance = z.infer<typeof QuoteRateProvenanceSchema>;
export type QuoteServiceType = z.infer<typeof QuoteServiceTypeSchema>;
export type QuoteTemplateContent = z.infer<typeof QuoteTemplateContentSchema>;
export type CreateQuoteTemplateInput = z.infer<typeof CreateQuoteTemplateSchema>;
export type UpdateQuoteTemplateInput = z.infer<typeof UpdateQuoteTemplateSchema>;
export type RenameQuoteTemplateFolderInput = z.infer<
  typeof RenameQuoteTemplateFolderSchema
>;
export type RestoreQuoteTemplateInput = z.infer<typeof RestoreQuoteTemplateSchema>;
export type ApplyQuoteTemplateInput = z.infer<typeof ApplyQuoteTemplateSchema>;
export type CloneQuotationInput = z.infer<typeof CloneQuotationSchema>;
export type HotelOccupancyPricing = NonNullable<z.infer<typeof HotelOccupancyPricingSchema>>;
export type CreateSupplierHotelRateInput = z.infer<typeof CreateSupplierHotelRateSchema>;
export type UpdateSupplierHotelRateInput = z.infer<typeof UpdateSupplierHotelRateSchema>;
export type RestoreHotelRateVersionInput = z.infer<typeof RestoreHotelRateVersionSchema>;
export type RestoreHotelRateFieldInput = z.infer<typeof RestoreHotelRateFieldSchema>;
export type RestoreTransferFareVersionInput = z.infer<
  typeof RestoreTransferFareVersionSchema
>;
export type RestoreActivityRateVersionInput = z.infer<
  typeof RestoreActivityRateVersionSchema
>;
export type CreateSupplierActivityRateInput = z.infer<typeof CreateSupplierActivityRateSchema>;
export type UpdateSupplierActivityRateInput = z.infer<typeof UpdateSupplierActivityRateSchema>;
export type CreateTransferFareInput = z.infer<typeof CreateTransferFareSchema>;
export type UpdateTransferFareInput = z.infer<typeof UpdateTransferFareSchema>;
export type ImportHotelRateCsvInput = z.infer<typeof ImportHotelRateCsvSchema>;
export type ImportHotelRateCsvRowInput = z.infer<typeof ImportHotelRateCsvRowSchema>;
export type ImportActivityRateCsvInput = z.infer<typeof ImportActivityRateCsvSchema>;
export type ImportActivityRateCsvRowInput = z.infer<typeof ImportActivityRateCsvRowSchema>;
export type ImportTransferFareCsvInput = z.infer<typeof ImportTransferFareCsvSchema>;
export type ImportTransferFareCsvRowInput = z.infer<typeof ImportTransferFareCsvRowSchema>;
export type SuggestTransferFareInput = z.infer<typeof SuggestTransferFareSchema>;
export type GenerateTransferFareMatrixInput = z.infer<
  typeof GenerateTransferFareMatrixSchema
>;
export type ResolveRatesInput = z.infer<typeof ResolveRatesSchema>;
export type ResolveRatesItemInput = z.infer<typeof ResolveRatesItemSchema>;
export type ChartFreshnessInput = z.infer<typeof ChartFreshnessSchema>;
export type ChartFreshnessItemInput = z.infer<typeof ChartFreshnessItemSchema>;
export type CreateTripPaymentInput = z.infer<typeof CreateTripPaymentSchema>;
export type UpdateTripPaymentInput = z.infer<typeof UpdateTripPaymentSchema>;
export type MarkPaymentPaidInput = z.infer<typeof MarkPaymentPaidSchema>;
export type ConfirmTripPaymentLinkInput = z.infer<typeof ConfirmTripPaymentLinkSchema>;
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

export { tripTravelEndOnOrAfterStart } from './trip-travel-dates';

export * from './commerce-foundation';
export * from './org-markup';
export * from './iso3166-alpha2';

export {
  extraModulesCss,
  renderExtraModule,
  type ExtraFormLookup,
} from './presence-extra-modules-html';

export {
  PRESENCE_FONT_CATALOG,
  presenceFontsForRole,
  matchPresenceFontStack,
  presenceFontGoogleFamily,
  type PresenceFontOption,
  type PresenceFontRole,
  type PresenceFontSource,
} from './presence-fonts';

export {
  PRESENCE_MODULE_RENDERER_ALIASES,
  resolveRenderableModuleType,
} from './presence-module-aliases';

export {
  PRESENCE_CONTENT_MAX_PRESETS,
  PRESENCE_GUTTER_PRESETS,
  PRESENCE_SECTION_GAP_PRESETS,
  DEFAULT_PRESENCE_SITE_LAYOUT,
  parsePresenceSiteLayout,
  presenceContentMaxPx,
  type PresenceSiteLayout,
} from './presence-site-layout';

export {
  PRESENCE_MENU_ICONS,
  PRESENCE_MENU_ICON_CATEGORIES,
  isPresenceMenuIconKey,
  presenceMenuIconDef,
  presenceMenuIconSvg,
  presenceMenuIconHtml,
  type PresenceMenuIconCategory,
  type PresenceMenuIconDef,
  type PresenceMenuIconKey,
} from './presence-menu-icons';

export {
  PRESENCE_WIDGET_POSITIONS,
  DEFAULT_PRESENCE_CONVERSATION_WIDGET,
  matchPresencePathPatterns,
  isPresenceWidgetPathAllowed,
  normalizePresenceWidgetPosition,
  normalizePresencePathList,
  parsePresenceConversationWidget,
  parsePresencePageWidgetOverride,
  resolvePresenceWidgetPlacement,
  type PresenceWidgetPosition,
  type PresenceConversationWidgetSettings,
  type PresencePageWidgetOverride,
  type PresenceChatWidgetPlacement,
} from './presence-conversation-widget';

export {
  PRESENCE_CHAT_TARGET_OPS,
  PresenceChatTargetRuleSchema,
  PresenceChatTargetRulesSchema,
  DEFAULT_PRESENCE_CHAT_TARGET_RULES,
  parsePresenceChatTargetRules,
  compileTargetRulesToPathLists,
  matchChatTargetRule,
  isChatflowPathAllowed,
  InboxChatSettingsSchema,
  DEFAULT_INBOX_CHAT_SETTINGS,
  parseInboxChatSettings,
  placementSideToPosition,
  positionToPlacementSide,
  isInboxChatWithinHours,
  pathsFromLegacyOrTarget,
  type PresenceChatTargetOp,
  type PresenceChatTargetRule,
  type PresenceChatTargetRules,
  type InboxChatSettings,
} from './inbox-chat-settings';

export {
  lineUnitMargin,
  lineMarginPolicyViolation,
  countMarginPolicyViolations,
  countLossMakingLines,
  parseMinMarginPercent,
  type MarginPolicyKind,
} from './quote-margin-policy';

export {
  rateChartChangedSinceMatch,
  lineNeedsRateDriftAck,
} from './quote-rate-drift';
export {
  lineNeedsAllotmentRiskAck,
  lineNeedsCapacityRiskAck,
  lineNeedsMinStayRiskAck,
} from './quote-inventory-risk-ack';

export {
  FinanceReportPackSchema,
  FinanceReportPackAgingSchema,
  FinanceReportPackPortfolioSchema,
  FinanceReportPackDeliverySchema,
  CreateFinanceReportPackSchema,
  UpdateFinanceReportPackSchema,
  FINANCE_REPORT_PACKS_SETTINGS_KEY,
  FINANCE_REPORT_PACKS_MAX,
  parseFinanceReportPacks,
  financeReportPackDeliveryDue,
  type FinanceReportPack,
  type FinanceReportPackDelivery,
  type CreateFinanceReportPackInput,
  type UpdateFinanceReportPackInput,
} from './finance-report-packs';

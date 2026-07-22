import type { PlaceRef } from '../../lib/placeRefs';

export type InquiryCreateDefaults = {
  leadId?: string;
  partyId?: string;
  partyLabel?: string;
  /** Lead title — shown in “linked from lead” chrome. */
  leadTitle?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  /** Lead trip-interest chips (`tagsJson`). */
  tags?: string[];
  /**
   * Original visitor destination free-text (immutable spelling).
   * Precedence: current interaction → Lead.customFieldsJson.destinationText.
   */
  destinationText?: string;
  /**
   * Trusted structured destinations already chosen — win over text suggestions;
   * seed the create form without requiring suggestion confirmation.
   */
  destinations?: PlaceRef[];
  /** Contact channel for this intake — phone, whatsapp, website, walk_in, etc. */
  channelKey?: string;
  interactionId?: string;
  conversationId?: string;
  campaignId?: string;
};

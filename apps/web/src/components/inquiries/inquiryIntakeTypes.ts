export type InquiryCreateDefaults = {
  leadId?: string;
  partyId?: string;
  partyLabel?: string;
  /** Contact channel for this intake — phone, whatsapp, website, walk_in, etc. */
  channelKey?: string;
  interactionId?: string;
  conversationId?: string;
  campaignId?: string;
};

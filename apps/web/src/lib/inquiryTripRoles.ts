/** Re-export shared domain helpers — keep web imports stable. */
export {
  PROPOSAL_TRIP_STATUSES,
  CONFIRMED_OPS_TRIP_STATUSES,
  isProposalTrip,
  isConfirmedOpsTrip,
  pickActiveInquiryProposalTrip,
  pickActiveProposalTrip,
  pickPrimaryOpsTrip,
  proposalTrips,
  confirmedOpsTrips,
  type ProposalTripStatus,
  type ConfirmedOpsTripStatus,
  type InquiryLinkedTrip,
} from '@wayrune/contracts';

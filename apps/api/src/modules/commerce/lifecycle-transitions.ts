import { BadRequestException } from '@nestjs/common';

/**
 * Central lifecycle transition guards — Commerce Integrity / Independent OS Phase 1.
 * @see docs/commerce-integrity/02-commerce-lifecycle.md
 */

export type TransitionEntity =
  | 'booking_requirement'
  | 'service_request'
  | 'service_request_item'
  | 'inventory_hold'
  | 'cancellation_approval'
  | 'cancellation_execution'
  | 'commercial_document'
  | 'trip_change'
  | 'housekeeping_task'
  | 'stay_reservation'
  | 'meal_reservation'
  | 'meal_inquiry'
  | 'experience_reservation'
  | 'rental_reservation'
  | 'driver_job';

const GRAPHS: Record<TransitionEntity, Record<string, string[]>> = {
  booking_requirement: {
    pending: ['required', 'drafted', 'requested', 'cancelled'],
    required: ['drafted', 'requested', 'cancelled'],
    drafted: ['requested', 'sent', 'cancelled'],
    requested: ['acknowledged', 'held', 'confirmed', 'rejected', 'expired', 'cancelled'],
    acknowledged: ['held', 'confirmed', 'rejected', 'cancelled', 'cancelled'],
    held: ['confirmed', 'expired', 'cancelled', 'rejected'],
    confirmed: ['cancelled'],
    rejected: ['requested', 'cancelled'],
    expired: ['requested', 'cancelled'],
    cancelled: [],
    // legacy aliases used in ops UI
    sent: ['acknowledged', 'held', 'confirmed', 'rejected', 'expired', 'cancelled'],
  },
  service_request: {
    required: ['drafted', 'sent', 'cancelled'],
    drafted: ['sent', 'cancelled'],
    sent: ['acknowledged', 'available', 'held', 'confirmed', 'rejected', 'expired', 'cancelled'],
    acknowledged: ['available', 'held', 'confirmed', 'rejected', 'expired', 'cancelled'],
    available: ['held', 'confirmed', 'rejected', 'expired', 'cancelled'],
    held: ['confirmed', 'expired', 'cancelled', 'rejected'],
    confirmed: ['cancelled'],
    rejected: ['drafted', 'sent', 'cancelled'],
    expired: ['drafted', 'sent', 'cancelled'],
    cancelled: [],
  },
  service_request_item: {
    drafted: ['sent', 'cancelled'],
    sent: ['acknowledged', 'offered', 'held', 'confirmed', 'rejected', 'expired', 'cancelled'],
    acknowledged: ['offered', 'held', 'confirmed', 'rejected', 'expired', 'cancelled'],
    offered: ['held', 'confirmed', 'rejected', 'expired', 'cancelled'],
    held: ['confirmed', 'expired', 'cancelled', 'rejected'],
    confirmed: ['cancelled'],
    rejected: ['drafted', 'sent', 'cancelled'],
    expired: ['drafted', 'sent', 'cancelled'],
    cancelled: [],
  },
  inventory_hold: {
    active: ['confirmed', 'released', 'expired'],
    confirmed: [],
    released: [],
    expired: [],
  },
  cancellation_approval: {
    draft: ['awaiting_approval', 'approved', 'rejected'],
    awaiting_approval: ['approved', 'rejected'],
    approved: [],
    rejected: ['draft'],
  },
  cancellation_execution: {
    pending: ['applying', 'applied', 'partially_applied', 'failed'],
    applying: ['applied', 'partially_applied', 'failed'],
    applied: [],
    partially_applied: ['applying', 'applied', 'failed'],
    failed: ['pending', 'applying'],
  },
  commercial_document: {
    open: ['partial', 'paid', 'cancelled', 'void'],
    partial: ['paid', 'cancelled', 'void'],
    paid: ['void'],
    cancelled: [],
    void: [],
  },
  trip_change: {
    requested: [
      'impact_calculated',
      'awaiting_customer',
      'awaiting_supplier',
      'applied',
      'rejected',
    ],
    impact_calculated: ['awaiting_customer', 'awaiting_supplier', 'applied', 'rejected'],
    awaiting_customer: ['awaiting_supplier', 'applied', 'rejected'],
    awaiting_supplier: ['applied', 'rejected', 'awaiting_customer'],
    applied: [],
    rejected: [],
  },
  housekeeping_task: {
    pending: ['cleaning', 'blocked', 'ready'],
    cleaning: ['inspected', 'blocked', 'pending'],
    inspected: ['ready', 'cleaning', 'blocked'],
    ready: [],
    blocked: ['pending', 'cleaning'],
  },
  stay_reservation: {
    inquiry: ['tentative', 'held', 'confirmed', 'cancelled'],
    tentative: ['held', 'confirmed', 'cancelled', 'expired'],
    held: ['confirmed', 'cancelled', 'expired', 'no_show'],
    // `checked_out` direct from `confirmed` covers day-use / walk-outs that
    // were never explicitly marked checked_in.
    confirmed: ['checked_in', 'checked_out', 'cancelled', 'no_show'],
    checked_in: ['checked_out', 'cancelled'],
    checked_out: [],
    cancelled: [],
    expired: [],
    no_show: [],
  },
  meal_reservation: {
    requested: ['tentative', 'held', 'confirmed', 'cancelled'],
    tentative: ['held', 'confirmed', 'cancelled'],
    held: ['confirmed', 'cancelled', 'no_show'],
    confirmed: ['arrived', 'seated', 'cancelled', 'no_show'],
    arrived: ['seated', 'cancelled', 'no_show'],
    seated: ['served', 'cancelled'],
    served: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
    no_show: [],
  },
  meal_inquiry: {
    open: ['quoted', 'converted', 'closed', 'cancelled'],
    quoted: ['converted', 'closed', 'cancelled', 'open'],
    converted: [],
    closed: [],
    cancelled: [],
  },
  experience_reservation: {
    requested: ['held', 'confirmed', 'cancelled'],
    held: ['confirmed', 'cancelled', 'no_show'],
    confirmed: ['checked_in', 'cancelled', 'no_show', 'completed'],
    checked_in: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
    no_show: [],
  },
  rental_reservation: {
    held: ['confirmed', 'cancelled', 'no_show'],
    confirmed: ['checked_out', 'cancelled', 'no_show'],
    checked_out: ['returned', 'cancelled'],
    returned: [],
    cancelled: [],
    no_show: [],
  },
  driver_job: {
    offered: ['assigned', 'cancelled'],
    assigned: ['en_route', 'cancelled', 'no_show'],
    en_route: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
    no_show: [],
  },
};

export function canTransition(
  entity: TransitionEntity,
  from: string,
  to: string,
): boolean {
  if (from === to) return true;
  const allowed = GRAPHS[entity]?.[from];
  if (!allowed) {
    // Unknown from-state: allow if to is known terminal or same graph entry exists
    return Boolean(GRAPHS[entity]?.[to] || to);
  }
  return allowed.includes(to);
}

export function assertTransition(
  entity: TransitionEntity,
  from: string | null | undefined,
  to: string,
): void {
  const current = from || Object.keys(GRAPHS[entity] || {})[0] || 'drafted';
  if (!canTransition(entity, current, to)) {
    throw new BadRequestException({
      code: 'INVALID_TRANSITION',
      message: `Invalid ${entity} transition: ${current} → ${to}`,
      entity,
      from: current,
      to,
    });
  }
}

export function allowedTransitions(
  entity: TransitionEntity,
  from: string,
): string[] {
  return GRAPHS[entity]?.[from] ?? [];
}

export type CancellationExecutionOutcome = 'applied' | 'partially_applied' | 'failed';

/**
 * Pure derivation of a CancellationCase's final `executionStatus` from the
 * per-entity apply results. Kept side-effect free so it can be unit tested
 * without a DB/transaction.
 * @see docs/commerce-integrity/11-inventory-adapters-and-stay-modify.md
 */
export function resolveCancellationExecutionOutcome(counts: {
  affectedCount: number;
  applied: number;
  failed: number;
}): CancellationExecutionOutcome {
  const { affectedCount, applied, failed } = counts;
  if (affectedCount === 0) return 'applied';
  if (applied === 0) return 'failed';
  if (failed > 0) return 'partially_applied';
  return 'applied';
}

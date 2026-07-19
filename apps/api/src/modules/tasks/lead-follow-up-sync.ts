/** When a lead-linked task has a due date, stamp Lead.followUpAt for sales SLA. */

export function shouldSyncLeadFollowUpAt(input: {
  entityType?: string | null;
  entityId?: string | null;
  dueAt?: string | Date | null;
}): boolean {
  if (input.entityType !== 'lead' || !input.entityId) return false;
  if (input.dueAt == null || input.dueAt === '') return false;
  return true;
}

export function shouldResolveLeadFromInquiryTask(input: {
  entityType?: string | null;
  entityId?: string | null;
  dueAt?: string | Date | null;
}): boolean {
  if (input.entityType !== 'inquiry' || !input.entityId) return false;
  if (input.dueAt == null || input.dueAt === '') return false;
  return true;
}

/**
 * Reverse: when Lead.followUpAt is set/changed to a date, push onto the open
 * lead task’s dueAt (create path already stamps lead from task).
 */
export function shouldSyncTaskDueFromLeadFollowUp(input: {
  followUpAtProvided: boolean;
  followUpAt?: string | Date | null;
}): boolean {
  if (!input.followUpAtProvided) return false;
  if (input.followUpAt == null || input.followUpAt === '') return false;
  return true;
}

export function parseFollowUpAtDate(
  value: string | Date | null | undefined,
): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

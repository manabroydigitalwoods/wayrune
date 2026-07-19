/** Agency transfer → DriverJob window helpers (pure). */

export function agencyTransferJobWindow(input: {
  startAt?: Date | string | null;
  endAt?: Date | string | null;
  tripStartDate?: Date | string | null;
}): { startAt: Date; endAt: Date } | null {
  const when = asDate(input.startAt) || asDate(input.tripStartDate);
  if (!when) return null;
  // Prefer explicit clock time on startAt; date-only → 10:00–12:00 UTC default.
  const hasClock =
    when.getUTCHours() !== 0 ||
    when.getUTCMinutes() !== 0 ||
    when.getUTCSeconds() !== 0 ||
    when.getUTCMilliseconds() !== 0;
  const startAt = hasClock
    ? when
    : new Date(startOfUtcDay(when).getTime() + 10 * 3_600_000);
  const endRaw = asDate(input.endAt);
  if (endRaw && endRaw.getTime() > startAt.getTime()) {
    return { startAt, endAt: endRaw };
  }
  return { startAt, endAt: new Date(startAt.getTime() + 2 * 3_600_000) };
}

/** Stable notes key so agency sync can upsert/clear legacy AssetCalendarBlock rows. */
export function agencyTransferCalendarNotes(bookingComponentId: string): string {
  return `agency_transfer · ${bookingComponentId.trim()}`;
}

export function agencyTransferAllocationNotes(bookingComponentId: string): string {
  return `agency_transfer · ${bookingComponentId.trim()}`;
}

export function isAgencyTransferCalendarNotes(
  notes: string | null | undefined,
  bookingComponentId: string,
): boolean {
  if (!notes?.trim() || !bookingComponentId.trim()) return false;
  return notes.trim() === agencyTransferCalendarNotes(bookingComponentId);
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

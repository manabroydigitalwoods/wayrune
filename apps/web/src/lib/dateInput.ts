/** Bridge ISO `yyyy-MM-dd` (and date-time local) strings with brand DatePicker / TimePicker. */

export function parseDateInput(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  const d = new Date(raw.includes('T') ? raw : `${raw.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function formatDateInput(date?: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function splitDateTimeLocal(value?: string | null): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  const [datePart, timePart = ''] = value.split('T');
  return { date: datePart?.slice(0, 10) || '', time: timePart.slice(0, 5) };
}

export function joinDateTimeLocal(date: string, time: string): string {
  if (!date) return '';
  return `${date}T${time || '00:00'}`;
}

/** Patch date and/or time on a `yyyy-MM-ddTHH:mm` local string. */
export function patchDateTimeLocal(
  current: string,
  patch: { date?: string; time?: string },
): string {
  const parts = splitDateTimeLocal(current);
  return joinDateTimeLocal(
    patch.date !== undefined ? patch.date : parts.date,
    patch.time !== undefined ? patch.time : parts.time,
  );
}

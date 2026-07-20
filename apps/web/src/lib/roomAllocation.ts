/**
 * TripTraveller.roomAllocation — thin UI helpers (mirror API normalize).
 */

const ROOM_RE = /^(?:r(?:oom)?[\s._-]*)?(\d{1,2})$/i;

/** Parse "R1" / "1" / "Room 2" → canonical "R1". */
export function normalizeRoomAllocationUi(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = ROOM_RE.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1 || n > 99) return null;
  return `R${n}`;
}

export function roomAllocationNumberUi(
  raw: string | null | undefined,
): number | null {
  const key = normalizeRoomAllocationUi(raw);
  if (!key) return null;
  const n = Number(key.slice(1));
  return Number.isFinite(n) ? n : null;
}

/** "R1" → "Room 1". */
export function formatRoomAllocationLabelUi(
  raw: string | null | undefined,
): string {
  const n = roomAllocationNumberUi(raw);
  if (n == null) return '—';
  return `Room ${n}`;
}

/** Combobox options: Unassigned + Room 1…N. */
export function roomAllocationSelectOptions(
  travellers: Array<{ roomAllocation?: string | null }> | null | undefined,
  roomHint?: number | null,
): Array<{ value: string; label: string }> {
  let maxAssigned = 0;
  for (const t of travellers || []) {
    const n = roomAllocationNumberUi(t.roomAllocation);
    if (n != null && n > maxAssigned) maxAssigned = n;
  }
  const hint = Math.max(0, Math.floor(Number(roomHint) || 0));
  const count = Math.min(
    12,
    Math.max(hint, maxAssigned, Math.min((travellers || []).length || 0, 8), 2),
  );
  const opts: Array<{ value: string; label: string }> = [
    { value: '', label: 'Unassigned' },
  ];
  for (let i = 1; i <= count; i += 1) {
    opts.push({ value: `R${i}`, label: `Room ${i}` });
  }
  return opts;
}

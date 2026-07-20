/**
 * TripTraveller.roomAllocation helpers — parse "R1"/"1"/"Room 2", group guests for vouchers.
 */

export type RoomAllocationGuest = {
  fullName: string;
  roomAllocation?: string | null;
};

export type RoomGuestGroup = {
  /** Canonical key e.g. R1 */
  roomKey: string;
  /** Display label e.g. Room 1 */
  roomLabel: string;
  guestNames: string[];
};

export type GroupedRoomGuests = {
  /** True when at least one guest has a parsed room stamp. */
  hasAllocation: boolean;
  rooms: RoomGuestGroup[];
  /** Named guests with no (or blank) room stamp. */
  unallocated: string[];
  /** Flat names (lead order preserved) — voucher fallback. */
  flatNames: string[];
};

const ROOM_RE = /^(?:r(?:oom)?[\s._-]*)?(\d{1,2})$/i;

/** Parse room stamps like "R1", "1", "Room 2" → canonical "R1". Blank → null. */
export function normalizeRoomAllocation(
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

/** "R1" → 1; invalid → null. */
export function roomAllocationNumber(
  raw: string | null | undefined,
): number | null {
  const key = normalizeRoomAllocation(raw);
  if (!key) return null;
  const n = Number(key.slice(1));
  return Number.isFinite(n) ? n : null;
}

/** Canonical "R1" → "Room 1". */
export function formatRoomAllocationLabel(
  raw: string | null | undefined,
): string | null {
  const n = roomAllocationNumber(raw);
  if (n == null) return null;
  return `Room ${n}`;
}

/**
 * Group named guests by roomAllocation for hotel vouchers.
 * When nobody is stamped, `hasAllocation` is false — callers use `flatNames`.
 */
export function groupGuestsByRoomAllocation(
  guests: RoomAllocationGuest[] | null | undefined,
): GroupedRoomGuests {
  const flatNames: string[] = [];
  const byRoom = new Map<string, string[]>();
  const unallocated: string[] = [];
  let hasAllocation = false;

  for (const g of guests || []) {
    const name = g.fullName?.trim();
    if (!name) continue;
    flatNames.push(name);
    const key = normalizeRoomAllocation(g.roomAllocation);
    if (!key) {
      unallocated.push(name);
      continue;
    }
    hasAllocation = true;
    const list = byRoom.get(key);
    if (list) list.push(name);
    else byRoom.set(key, [name]);
  }

  const rooms: RoomGuestGroup[] = [...byRoom.entries()]
    .sort((a, b) => roomAllocationNumber(a[0])! - roomAllocationNumber(b[0])!)
    .map(([roomKey, guestNames]) => ({
      roomKey,
      roomLabel: formatRoomAllocationLabel(roomKey) || roomKey,
      guestNames,
    }));

  return { hasAllocation, rooms, unallocated, flatNames };
}

/** Snapshot for hotel booking travellerRequirementsJson at materialize. */
export function roomAllocationSnapshot(
  guests: Array<{
    travellerId?: string;
    fullName: string;
    roomAllocation?: string | null;
  }> | null | undefined,
): Array<{ travellerId?: string; fullName: string; roomAllocation: string }> {
  const out: Array<{
    travellerId?: string;
    fullName: string;
    roomAllocation: string;
  }> = [];
  for (const g of guests || []) {
    const name = g.fullName?.trim();
    const room = normalizeRoomAllocation(g.roomAllocation);
    if (!name || !room) continue;
    out.push({
      ...(g.travellerId ? { travellerId: g.travellerId } : {}),
      fullName: name,
      roomAllocation: room,
    });
  }
  return out;
}

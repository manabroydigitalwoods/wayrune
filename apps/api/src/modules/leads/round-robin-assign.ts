/** Round-robin owner pick — skips inactive members; preserves configured order. */

export function resolveActivePool(
  configuredIds: string[],
  activeUserIds: string[],
): string[] {
  const activeSet = new Set(activeUserIds);
  if (!configuredIds.length) {
    return activeUserIds.filter((id) => activeSet.has(id));
  }
  return configuredIds.filter((id) => activeSet.has(id));
}

export function pickRoundRobinSlot(input: {
  memberIds: string[];
  cursor: number;
}): { ownerId: string; nextCursor: number; index: number } | null {
  if (!input.memberIds.length) return null;
  const cursor =
    Number.isFinite(input.cursor) && input.cursor >= 0 ? Math.floor(input.cursor) : 0;
  const index = cursor % input.memberIds.length;
  return {
    ownerId: input.memberIds[index]!,
    nextCursor: (index + 1) % input.memberIds.length,
    index,
  };
}

/** Peek who gets the next lead without advancing the cursor. */
export function peekRoundRobinOwner(input: {
  memberIds: string[];
  cursor: number;
}): { ownerId: string; index: number } | null {
  const pick = pickRoundRobinSlot(input);
  if (!pick) return null;
  return { ownerId: pick.ownerId, index: pick.index };
}

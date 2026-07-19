/** Compact post-Match cue for hotel contract cancellation summary. */

const DEFAULT_MAX = 120;

export function formatHotelCancellationNote(
  summary: string | null | undefined,
  opts?: { maxLength?: number; fallback?: string | null },
): string | null {
  const raw = (summary?.trim() || opts?.fallback?.trim() || '').replace(/\s+/g, ' ');
  if (!raw) return null;
  const max = Math.max(24, opts?.maxLength ?? DEFAULT_MAX);
  if (raw.length <= max) return raw;
  const cut = raw.slice(0, max - 1);
  const at = Math.max(cut.lastIndexOf(';'), cut.lastIndexOf(','));
  const base = at >= Math.floor(max * 0.5) ? cut.slice(0, at) : cut.trimEnd();
  return `${base.trimEnd()}…`;
}

/** Compact post-Match cue when hotel buy includes gala / date supplements. */

export type HotelDateSupplementMatch = {
  night?: string | null;
  label?: string | null;
  amount?: number | null;
};

export type HotelDateSupplementCalc = {
  dateSupplementTotal?: number | null;
  dateSupplements?: HotelDateSupplementMatch[] | null;
};

function shortNightLabel(night: string | null | undefined): string | null {
  if (!night?.trim()) return null;
  const day = night.trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const month = months[Number(m[2]) - 1];
  if (!month) return day;
  return `${Number(m[3])} ${month}`;
}

export function formatHotelDateSupplementNote(
  calc: HotelDateSupplementCalc | null | undefined,
  opts?: { formatAmount?: (n: number) => string; maxLabels?: number },
): string | null {
  const total = Number(calc?.dateSupplementTotal);
  if (!Number.isFinite(total) || total <= 0) return null;

  const amount =
    opts?.formatAmount?.(total) ??
    `₹${Math.round(total).toLocaleString('en-IN')}`;
  const bits = [`+${amount}`];

  const matched = Array.isArray(calc?.dateSupplements) ? calc.dateSupplements : [];
  const maxLabels = Math.max(1, opts?.maxLabels ?? 2);
  const labels: string[] = [];
  for (const row of matched) {
    const label =
      (typeof row.label === 'string' && row.label.trim()) ||
      shortNightLabel(row.night) ||
      null;
    if (!label || labels.includes(label)) continue;
    labels.push(label);
    if (labels.length >= maxLabels) break;
  }
  if (labels.length) bits.push(labels.join(', '));
  const remaining = matched.length - labels.length;
  if (remaining > 0 && labels.length >= maxLabels) {
    bits.push(`+${remaining} more`);
  }

  return bits.join(' · ');
}

import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  FileText,
  Handshake,
  Phone,
  PhoneMissed,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Badge } from './ui/badge';

const LABELS: Record<string, string> = {
  new: 'New',
  attempted_contact: 'Attempted Contact',
  contacted: 'Contacted',
  requirements_pending: 'Requirements Pending',
  qualified: 'Qualified',
  proposal_sent: 'Proposal Sent',
  negotiation: 'Negotiation',
  open: 'Open',
  draft: 'Draft',
  planning: 'Planning',
  quoted: 'Quoted',
  awaiting_approval: 'Awaiting approval',
  // Trip-exclusive lifecycle key — safe to relabel globally (friendlier vocab).
  booking_in_progress: 'Booking',
  ready_to_travel: 'Ready to travel',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  confirmed: 'Confirmed',
  converted: 'Converted',
  won: 'Won',
  lost: 'Lost',
  done: 'Done',
  pending: 'Unrequested',
  requested: 'Enquiry',
  drafted: 'Unrequested',
  required: 'Unrequested',
  sent: 'Enquiry',
  acknowledged: 'Awaiting',
  available: 'Available',
  held: 'On hold',
  payment_pending: 'Payment pending',
  voucher_pending: 'Voucher pending',
  unrequested: 'Unrequested',
  enquiry: 'Enquiry',
  awaiting: 'Awaiting',
  on_hold: 'On hold',
  scheduled: 'Scheduled',
  paid: 'Paid',
  overdue: 'Overdue',
  inactive: 'Inactive',
  active: 'Active',
  individual: 'Individual',
  organization: 'Organization',
  normal: 'Normal',
  high: 'High',
  low: 'Low',
  urgent: 'Urgent',
};

export type StatusTone = 'neutral' | 'success' | 'warn' | 'danger' | 'info';

const TONES: Record<string, StatusTone> = {
  converted: 'success',
  won: 'success',
  confirmed: 'success',
  done: 'success',
  qualified: 'success',
  open: 'info',
  inactive: 'warn',
  active: 'info',
  contacted: 'info',
  lost: 'danger',
  urgent: 'danger',
  high: 'warn',
  awaiting_approval: 'warn',
  payment_pending: 'warn',
  voucher_pending: 'warn',
  enquiry: 'info',
  awaiting: 'warn',
  unrequested: 'neutral',
  on_hold: 'warn',
  overdue: 'danger',
  pending: 'warn',
  quoted: 'warn',
  requirements_pending: 'warn',
  negotiation: 'warn',
  proposal_sent: 'info',
};

const ICONS: Record<string, LucideIcon> = {
  new: Sparkles,
  attempted_contact: PhoneMissed,
  contacted: Phone,
  requirements_pending: ClipboardList,
  qualified: BadgeCheck,
  proposal_sent: FileText,
  negotiation: Handshake,
  converted: CheckCircle2,
  won: CheckCircle2,
  lost: XCircle,
  done: CheckCircle2,
  confirmed: CheckCircle2,
  open: CircleDashed,
  pending: CircleDashed,
  high: AlertTriangle,
  urgent: AlertTriangle,
  low: CircleDashed,
  normal: CircleDashed,
};

function humanize(value: string) {
  if (LABELS[value]) return LABELS[value];
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function statusMeta(value: string): {
  label: string;
  tone: StatusTone;
  Icon: LucideIcon;
} {
  const tone = TONES[value] ?? 'neutral';
  const Icon =
    ICONS[value] ??
    (tone === 'success'
      ? CheckCircle2
      : tone === 'warn'
        ? AlertTriangle
        : tone === 'danger'
          ? XCircle
          : CircleDashed);
  return { label: humanize(value), tone, Icon };
}

export function StatusBadge({
  value,
  label,
  tone,
  className,
  showIcon = true,
  size = 'sm',
}: {
  value: string;
  label?: string;
  tone?: StatusTone;
  className?: string;
  showIcon?: boolean;
  /** `sm` matches compact DataTable rows; `md` for headers/panels. */
  size?: 'sm' | 'md';
}) {
  const meta = statusMeta(value);
  const resolvedTone = tone ?? meta.tone;
  const Icon = meta.Icon;
  const compact = size === 'sm';

  const soft = {
    neutral: 'border-border/60 bg-secondary text-secondary-foreground',
    success: 'border-transparent bg-success-soft text-success',
    warn: 'border-transparent bg-warning-soft text-warning',
    danger: 'border-transparent bg-danger-soft text-destructive',
    info: 'border-transparent bg-info-soft text-info',
  }[resolvedTone];

  return (
    <Badge
      className={cn(
        'max-w-full gap-1 rounded-md border font-medium tracking-wide',
        compact ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-[11px]',
        soft,
        className,
      )}
      tone={undefined}
      variant="secondary"
    >
      {showIcon ? (
        <Icon
          className={cn('shrink-0 opacity-90', compact ? 'size-2.5' : 'size-3')}
          aria-hidden
        />
      ) : null}
      <span className="min-w-0 truncate">{label ?? meta.label}</span>
    </Badge>
  );
}

export function statusLabel(value: string) {
  return humanize(value);
}

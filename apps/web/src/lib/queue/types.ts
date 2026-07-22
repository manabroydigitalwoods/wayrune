/** Shared queue URL helpers — keep schemas small and domain-owned. */

import type { LucideIcon } from 'lucide-react';

export function omitEmptyParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (value != null && String(value).trim() !== '') next.set(key, value);
  }
  return next;
}

export type ActiveFilterChip = {
  id: string;
  label: string;
  /** Remove this chip from URL / state. */
  onRemove: () => void;
};

export type QueueFilterOption = {
  value: string;
  label: string;
  icon?: LucideIcon;
  /** Optional secondary meta (e.g. "12 leads"). */
  countLabel?: string;
};

export type QueueFilterDef = {
  id: string;
  label: string;
  options: QueueFilterOption[];
  /** Leading icon in the Add filter menu. */
  icon?: LucideIcon;
  /** Current value in URL (undefined / empty = inactive). */
  value?: string | null;
  onSelect: (value: string | null) => void;
};

export type AttentionPreset = {
  id: string;
  label: string;
  count: number;
  active?: boolean;
  tone?: 'danger' | 'warn' | 'info' | 'default';
  onClick: () => void;
};

import { cn } from '@wayrune/ui';
import type { AttentionPreset } from '../../lib/queue/types';

const toneClass: Record<NonNullable<AttentionPreset['tone']>, string> = {
  danger: 'border-destructive/35 bg-destructive/10 text-destructive hover:bg-destructive/15',
  warn: 'border-amber-500/40 bg-amber-500/10 text-foreground hover:bg-amber-500/15',
  info: 'border-border/60 bg-background/70 text-foreground hover:bg-background',
  default: 'border-border/50 bg-background/70 text-foreground hover:bg-background',
};

export function AttentionPresets({
  presets,
  className,
}: {
  presets: AttentionPreset[];
  className?: string;
}) {
  const visible = presets.filter((p) => p.count > 0 || p.active);
  if (!visible.length) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {visible.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={preset.onClick}
          className={cn(
            'inline-flex h-[var(--control-h-sm)] items-center gap-1 rounded-md border px-[var(--control-px-sm)] text-[length:var(--control-text-sm)] font-medium transition-colors',
            toneClass[preset.tone ?? 'default'],
            preset.active && 'ring-1 ring-primary/40',
          )}
        >
          <span className="tabular-nums">{preset.count}</span>
          {preset.label}
        </button>
      ))}
    </div>
  );
}

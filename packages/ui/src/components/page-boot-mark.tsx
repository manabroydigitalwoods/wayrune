import { cn } from '../lib/utils';

/** Wayrune “W” lettermark — boot splash, auth gate, appearance transition. */
export function PageBootMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex size-10 items-center justify-center rounded-[0.55rem] bg-primary animate-boot-mark',
        className,
      )}
      aria-hidden
    >
      <span className="font-display text-[1.35rem] font-semibold leading-none tracking-tight text-primary-foreground">
        W
      </span>
    </div>
  );
}

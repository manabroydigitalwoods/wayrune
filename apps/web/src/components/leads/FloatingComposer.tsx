import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { GripHorizontal, X } from 'lucide-react';
import { Button, StorageKeys, cn, usePersistentState } from '@travel/ui';

type FloatingComposerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

type ComposerLayout = {
  width: number;
  height: number;
  x: number;
  y: number;
};

const DEFAULT_LAYOUT: ComposerLayout = {
  width: 416,
  height: 480,
  x: 0,
  y: 0,
};

const MIN_WIDTH = 320;
const MIN_HEIGHT = 280;
const MAX_WIDTH = 920;
const MAX_HEIGHT = 860;

function clampSize(width: number, height: number) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const maxW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, vw - 24));
  const maxH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, vh - 24));
  return {
    width: Math.min(maxW, Math.max(MIN_WIDTH, width)),
    height: Math.min(maxH, Math.max(MIN_HEIGHT, height)),
  };
}

function clampLayout(layout: ComposerLayout): ComposerLayout {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const { width, height } = clampSize(layout.width, layout.height);
  const maxX = Math.max(0, vw - width - 12);
  const maxY = Math.max(0, vh - height - 12);
  const minX = -(vw - width - 24);
  const minY = -(vh - height - 24);
  return {
    width,
    height,
    x: Math.min(maxX, Math.max(minX, layout.x)),
    y: Math.min(maxY, Math.max(minY, layout.y)),
  };
}

/**
 * Compact floating panel with drag + resize — keeps the lead page visible underneath.
 * Size and position persist across opens.
 */
export function FloatingComposer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: FloatingComposerProps) {
  const [saved, setSaved] = usePersistentState<ComposerLayout>(
    StorageKeys.ui.floatingComposerLayout,
    DEFAULT_LAYOUT,
  );
  const [live, setLive] = useState<ComposerLayout | null>(null);
  const layout = live ?? saved;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    origW: number;
    origH: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  const commit = useCallback(
    (next: ComposerLayout) => {
      const clamped = clampLayout(next);
      setSaved(clamped);
      setLive(null);
    },
    [setSaved],
  );

  useEffect(() => {
    if (!open) return;
    setSaved((prev) => clampLayout(prev));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    const onWinResize = () => setSaved((prev) => clampLayout(prev));
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onWinResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onWinResize);
    };
  }, [open, onOpenChange, setSaved]);

  const onDragDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      const current = layoutRef.current;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: current.x,
        origY: current.y,
      };
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setLive(
      clampLayout({
        ...layoutRef.current,
        x: dragRef.current.origX + dx,
        y: dragRef.current.origY + dy,
      }),
    );
  }, []);

  const onDragUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDragging(false);
      commit(layoutRef.current);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    },
    [commit],
  );

  const onResizeDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const current = layoutRef.current;
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origW: current.width,
      origH: current.height,
      origX: current.x,
      origY: current.y,
    };
    setResizing(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    // Bottom-right anchored: grow SE while keeping the top-left corner fixed.
    const dx = e.clientX - resizeRef.current.startX;
    const dy = e.clientY - resizeRef.current.startY;
    const size = clampSize(resizeRef.current.origW + dx, resizeRef.current.origH + dy);
    setLive(
      clampLayout({
        width: size.width,
        height: size.height,
        x: resizeRef.current.origX + (size.width - resizeRef.current.origW),
        y: resizeRef.current.origY + (size.height - resizeRef.current.origH),
      }),
    );
  }, []);

  const onResizeUp = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      setResizing(false);
      commit(layoutRef.current);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    },
    [commit],
  );

  if (!open) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label="Dismiss"
        className="pointer-events-auto absolute inset-0 overlay-scrim"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="floating-composer-title"
        className={cn(
          'pointer-events-auto absolute bottom-6 right-6 flex flex-col overflow-hidden rounded-xl border shadow-2xl glass-strong',
          (dragging || resizing) && 'select-none',
          className,
        )}
        style={{
          width: layout.width,
          height: layout.height,
          maxWidth: 'calc(100vw - 1.5rem)',
          maxHeight: 'calc(100vh - 1.5rem)',
          transform: `translate(${layout.x}px, ${layout.y}px)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex cursor-grab items-start gap-2 border-b border-white/40 px-3 py-2.5 active:cursor-grabbing dark:border-white/10"
          onPointerDown={onDragDown}
          onPointerMove={onDragMove}
          onPointerUp={onDragUp}
          onPointerCancel={onDragUp}
        >
          <GripHorizontal className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <h2 id="floating-composer-title" className="text-sm font-semibold leading-tight">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 shrink-0"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-white/40 px-3 py-2.5 dark:border-white/10">
            {footer}
          </div>
        ) : null}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize composer"
          title="Drag to resize"
          className="absolute bottom-0 right-0 z-10 flex size-5 cursor-se-resize items-end justify-end p-1"
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
        >
          <span
            className="block size-2.5 rounded-sm border-b-2 border-r-2 border-muted-foreground/55"
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}

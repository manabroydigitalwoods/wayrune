import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cn } from '@wayrune/ui';
import type { FreeformFrame } from './types';
import {
  snapFreeformFrame,
  type FreeformSnapGuide,
} from './helpers';

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const HANDLES: ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

function clampSize(value: number, min = 80) {
  return Math.max(min, Math.round(value));
}

/**
 * Absolute-position chrome for freeform root modules: drag to move, corner/edge handles to resize.
 * Snaps to stage edges and sibling frames while dragging.
 */
export function FreeformFrameChrome({
  frame,
  selected,
  canWrite,
  siblingFrames = [],
  stageWidth = 960,
  stageHeight = 640,
  children,
  onFrameChange,
  onFrameChangeCommit,
}: {
  frame: FreeformFrame;
  selected: boolean;
  canWrite: boolean;
  siblingFrames?: FreeformFrame[];
  stageWidth?: number;
  stageHeight?: number;
  children: ReactNode;
  onFrameChange: (next: FreeformFrame) => void;
  /** Called on pointer-up with final frame (for multi-select delta apply). */
  onFrameChangeCommit?: (next: FreeformFrame, origin: FreeformFrame) => void;
}) {
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const [guides, setGuides] = useState<FreeformSnapGuide[]>([]);

  const applySnap = (next: FreeformFrame) => {
    const snapped = snapFreeformFrame(next, {
      siblings: siblingFrames,
      stageWidth,
      stageHeight,
    });
    setGuides(snapped.guides);
    return snapped.frame;
  };

  const startMove = (event: ReactPointerEvent) => {
    if (!canWrite || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('.presence-freeform-handle')) return;
    if (target.closest('.presence-section-toolbar')) return;
    if (target.closest('[contenteditable="true"]')) return;
    if (target.closest('button, a, input, textarea, select')) return;

    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { ...frameRef.current };

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const next = applySnap({
        ...origin,
        unit: 'px',
        x: Math.round(origin.x + dx),
        y: Math.round(origin.y + dy),
      });
      onFrameChange(next);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setGuides([]);
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const next = applySnap({
        ...origin,
        unit: 'px',
        x: Math.round(origin.x + dx),
        y: Math.round(origin.y + dy),
      });
      onFrameChangeCommit?.(next, origin);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startResize = (edge: ResizeEdge) => (event: ReactPointerEvent) => {
    if (!canWrite || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { ...frameRef.current };

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let { x, y, w, h } = origin;
      if (edge.includes('e')) w = clampSize(origin.w + dx);
      if (edge.includes('s')) h = clampSize(origin.h + dy);
      if (edge.includes('w')) {
        w = clampSize(origin.w - dx);
        x = Math.round(origin.x + (origin.w - w));
      }
      if (edge.includes('n')) {
        h = clampSize(origin.h - dy);
        y = Math.round(origin.y + (origin.h - h));
      }
      const next = applySnap({ ...origin, unit: 'px', x, y, w, h });
      onFrameChange(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setGuides([]);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      className={cn(
        'presence-freeform-frame',
        selected ? 'presence-freeform-frame--selected' : '',
        canWrite ? 'presence-freeform-frame--writable' : '',
      )}
      style={{
        left: `${frame.x}${frame.unit || 'px'}`,
        top: `${frame.y}${frame.unit || 'px'}`,
        width: `${frame.w}${frame.unit || 'px'}`,
        minHeight: `${frame.h}${frame.unit || 'px'}`,
        height: 'auto',
        overflow: 'visible',
        zIndex: frame.z ?? 1,
      }}
      onPointerDown={startMove}
    >
      {guides.map((guide, i) => (
        <div
          key={`${guide.axis}-${guide.value}-${i}`}
          className={cn(
            'presence-freeform-guide',
            guide.axis === 'x' ? 'presence-freeform-guide--x' : 'presence-freeform-guide--y',
          )}
          style={
            guide.axis === 'x'
              ? { left: guide.value - frame.x }
              : { top: guide.value - frame.y }
          }
        />
      ))}
      {children}
      {selected && canWrite
        ? HANDLES.map((edge) => (
            <div
              key={edge}
              className={`presence-freeform-handle presence-freeform-handle--${edge}`}
              onPointerDown={startResize(edge)}
            />
          ))
        : null}
    </div>
  );
}

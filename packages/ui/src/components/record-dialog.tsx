import type { ReactNode, ComponentPropsWithoutRef } from 'react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';

/** Centered, content-sized modal — use when a Sheet is already open (nested create/edit). */
export function RecordDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  submitting,
  size = 'md',
  hideFooter,
  footer,
  onInteractOutside,
  onEscapeKeyDown,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  submitting?: boolean;
  size?: 'md' | 'lg';
  hideFooter?: boolean;
  footer?: ReactNode;
  onInteractOutside?: ComponentPropsWithoutRef<typeof DialogContent>['onInteractOutside'];
  onEscapeKeyDown?: ComponentPropsWithoutRef<typeof DialogContent>['onEscapeKeyDown'];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          size === 'lg'
            ? 'max-h-[min(90vh,720px)] w-[calc(100%-2rem)] max-w-lg sm:w-full'
            : 'max-h-[min(90vh,720px)] w-[calc(100%-2rem)] max-w-md sm:w-full'
        }
        onInteractOutside={onInteractOutside}
        onEscapeKeyDown={onEscapeKeyDown}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
        {hideFooter ? null : footer ? (
          <DialogFooter>{footer}</DialogFooter>
        ) : (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
            {onSubmit ? (
              <Button type="button" onClick={onSubmit} disabled={submitting}>
                {submitting ? 'Saving…' : submitLabel}
              </Button>
            ) : null}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

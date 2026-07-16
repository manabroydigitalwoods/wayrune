import type { ReactNode } from 'react';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from './ui/sheet';
import { Button } from './ui/button';

export function RecordSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  submitting,
  wide,
  size,
  hideFooter,
  footer,
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
  /** @deprecated Prefer `size="wide"` */
  wide?: boolean;
  /** default ≈ lg, wide ≈ xl, xl ≈ 2xl (~720px) */
  size?: 'default' | 'wide' | 'xl';
  hideFooter?: boolean;
  footer?: ReactNode;
}) {
  const resolvedSize = size ?? (wide ? 'wide' : 'default');
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={
          resolvedSize === 'xl'
            ? 'sm:max-w-2xl'
            : resolvedSize === 'wide'
              ? 'sm:max-w-xl'
              : undefined
        }
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <SheetBody>{children}</SheetBody>
        {hideFooter ? null : footer ? (
          <SheetFooter>{footer}</SheetFooter>
        ) : (
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
            {onSubmit ? (
              <Button type="button" onClick={onSubmit} disabled={submitting}>
                {submitting ? 'Saving…' : submitLabel}
              </Button>
            ) : null}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

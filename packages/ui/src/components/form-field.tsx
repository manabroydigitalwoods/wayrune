import type { LucideIcon } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/utils';
import { Input } from './ui/input';
import { Separator } from './ui/separator';

export function DataToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      {children}
    </div>
  );
}

export function FormField({
  label,
  children,
  className,
  required,
  description,
  error,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  required?: boolean;
  description?: ReactNode;
  error?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn('mb-4 flex flex-col gap-2 text-sm', className)}>
      <div className="flex flex-col gap-1">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium leading-5 text-foreground">
            {label}
            {required ? <span className="ml-0.5 text-destructive" aria-hidden>*</span> : null}
          </label>
        ) : (
          <div className="text-sm font-medium leading-5 text-foreground">
            {label}
            {required ? <span className="ml-0.5 text-destructive" aria-hidden>*</span> : null}
          </div>
        )}
        {description ? (
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}

export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-x-5 gap-y-5 sm:grid-cols-2', className)}>{children}</div>;
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mb-8 space-y-4', className)}>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? <p className="text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      <Separator />
      <div className="space-y-5">{children}</div>
    </section>
  );
}

export function InputWithIcon({
  icon: Icon,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { icon: LucideIcon }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input className={cn('pl-9', className)} {...props} />
    </div>
  );
}

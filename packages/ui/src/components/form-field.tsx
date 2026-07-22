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
    <div className={cn('mb-[var(--gap-page)] flex flex-col gap-[var(--gap-section)] sm:flex-row sm:items-center sm:justify-between', className)}>
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
    <div className={cn('flex flex-col gap-[var(--field-gap)] text-[length:var(--control-text)]', className)}>
      <div className="flex flex-col gap-[var(--field-gap-compact)]">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-[length:var(--control-text-sm)] font-medium leading-snug text-foreground">
            {label}
            {required ? <span className="ml-0.5 text-destructive" aria-hidden>*</span> : null}
          </label>
        ) : (
          <div className="text-[length:var(--control-text-sm)] font-medium leading-snug text-foreground">
            {label}
            {required ? <span className="ml-0.5 text-destructive" aria-hidden>*</span> : null}
          </div>
        )}
        {description ? (
          <p className="text-[length:var(--control-text-sm)] leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
      {error ? <p className="text-[length:var(--control-text-sm)] font-medium text-destructive">{error}</p> : null}
    </div>
  );
}

export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-[var(--gap-section)] sm:grid-cols-2', className)}>{children}</div>;
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
    <section className={cn('mb-[var(--gap-section)] space-y-[var(--gap-page)]', className)}>
      <div className="space-y-[var(--field-gap)]">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? <p className="text-[length:var(--control-text-sm)] leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      <Separator />
      <div className="stack-form">{children}</div>
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

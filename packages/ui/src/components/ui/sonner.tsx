import { Toaster as Sonner, toast, type ToasterProps, type ExternalToast } from 'sonner';
import { useTheme } from '../../theme/theme-provider';

function Toaster(props: ToasterProps) {
  const { resolved } = useTheme();
  return (
    <Sonner
      theme={resolved}
      position="top-right"
      richColors
      closeButton
      expand
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-card/95 group-[.toaster]:text-foreground group-[.toaster]:border-border/60 group-[.toaster]:shadow-lg group-[.toaster]:backdrop-blur-xl glass-strong',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          success: 'group-[.toaster]:border-success/30',
          error: 'group-[.toaster]:border-destructive/30',
          warning: 'group-[.toaster]:border-warning/30',
        },
      }}
      {...props}
    />
  );
}

function toastSuccess(message: string, data?: ExternalToast) {
  return toast.success(message, data);
}

function toastError(message: string, data?: ExternalToast) {
  return toast.error(message, data);
}

function toastWarning(message: string, data?: ExternalToast) {
  return toast.warning(message, data);
}

function toastPromise<T>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((err: unknown) => string);
  },
) {
  return toast.promise(promise, messages);
}

export { Toaster, toast, toastSuccess, toastError, toastWarning, toastPromise };

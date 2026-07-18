import { useCallback, useRef, useState } from 'react';
import { Check, Circle, Download, Loader2, Upload, X } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from '@wayrune/ui';
import { apiUploadWithProgress } from '../../api';
import {
  componentPackageCriteriaTemplate,
  validateComponentPackageZip,
  type ComponentPackageCriterion,
  type ComponentPackageValidationResult,
} from './componentPackageValidate';
import {
  buildSampleComponentPackageZip,
  downloadSampleComponentPackage,
} from './samplePackages';

type Phase = 'pick' | 'checking' | 'ready' | 'uploading' | 'processing' | 'done' | 'error';

type ComponentUploadResult = {
  id: string;
  key: string;
  name: string;
};

function CriterionRow({ item }: { item: ComponentPackageCriterion }) {
  const icon =
    item.status === 'pass' ? (
      <Check className="size-3.5 text-emerald-500" />
    ) : item.status === 'fail' ? (
      <X className="size-3.5 text-destructive" />
    ) : item.status === 'skip' ? (
      <Circle className="size-3.5 text-muted-foreground/50" />
    ) : (
      <Circle className="size-3.5 text-muted-foreground/40" />
    );
  return (
    <div className="flex gap-2 text-xs">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <div
          className={cn(
            item.status === 'fail' ? 'text-destructive' : 'text-foreground',
            item.status === 'pending' && 'text-muted-foreground',
          )}
        >
          {item.label}
        </div>
        {item.detail ? (
          <div className="truncate text-[11px] text-muted-foreground">{item.detail}</div>
        ) : null}
      </div>
    </div>
  );
}

export function ComponentPackageUploadDialog({
  open,
  onOpenChange,
  onInstalled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled: () => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [criteria, setCriteria] = useState<ComponentPackageCriterion[]>(
    componentPackageCriteriaTemplate(),
  );
  const [validation, setValidation] = useState<ComponentPackageValidationResult | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<ComponentUploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);

  const reset = useCallback(() => {
    setPhase('pick');
    setFile(null);
    setCriteria(componentPackageCriteriaTemplate());
    setValidation(null);
    setUploadPercent(0);
    setError(null);
    setInstalled(null);
    setDragOver(false);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next && (phase === 'uploading' || phase === 'processing' || phase === 'checking')) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const inspectFile = async (next: File) => {
    setFile(next);
    setError(null);
    setInstalled(null);
    setUploadPercent(0);
    setPhase('checking');
    setCriteria(componentPackageCriteriaTemplate());
    try {
      const result = await validateComponentPackageZip(next);
      setValidation(result);
      setCriteria(result.criteria);
      setPhase(result.ok ? 'ready' : 'error');
      if (!result.ok) setError('Package does not meet component criteria. Fix the ZIP and try again.');
    } catch (e) {
      setPhase('error');
      setError(e instanceof Error ? e.message : 'Failed to inspect ZIP');
    }
  };

  const startUpload = async () => {
    if (!file || !validation?.ok) return;
    setError(null);
    setPhase('uploading');
    setUploadPercent(0);
    try {
      const form = new FormData();
      form.append('file', file);
      const component = await apiUploadWithProgress<ComponentUploadResult>(
        '/presence/modules/upload-package',
        form,
        {
          onProgress: (p) => {
            setUploadPercent(p);
            if (p >= 100) setPhase('processing');
          },
        },
      );
      setPhase('processing');
      await new Promise((r) => setTimeout(r, 400));
      setInstalled(component);
      setPhase('done');
      await onInstalled();
    } catch (e) {
      setPhase('error');
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  const busy = phase === 'checking' || phase === 'uploading' || phase === 'processing';

  const useSample = async () => {
    setSampleBusy(true);
    setError(null);
    try {
      const sample = await buildSampleComponentPackageZip();
      await inspectFile(sample);
    } catch (e) {
      setPhase('error');
      setError(e instanceof Error ? e.message : 'Failed to build sample ZIP');
    } finally {
      setSampleBusy(false);
    }
  };

  const downloadSample = async () => {
    setSampleBusy(true);
    setError(null);
    try {
      await downloadSampleComponentPackage();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to download sample ZIP');
    } finally {
      setSampleBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] w-[calc(100%-2rem)] max-w-lg sm:w-full">
        <DialogHeader>
          <DialogTitle>Upload component package</DialogTitle>
          <DialogDescription>
            ZIP must include <code className="text-[11px]">component.json</code> and match the
            criteria below. Built HTML/CSS/JS only — no source .tsx.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div
            className={cn(
              'rounded-lg border border-dashed px-3 py-5 text-center transition',
              dragOver ? 'border-primary bg-primary/5' : 'border-border',
              busy ? 'pointer-events-none opacity-60' : 'cursor-pointer hover:border-primary/50',
            )}
            onClick={() => !busy && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) void inspectFile(dropped);
            }}
          >
            <Upload className="mx-auto mb-2 size-5 text-muted-foreground" />
            <div className="text-sm font-medium">
              {file ? file.name : 'Drop a component ZIP here, or click to choose'}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              component.json + HTML/CSS/JS · max 5 MB
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const next = e.target.files?.[0];
                e.target.value = '';
                if (next) void inspectFile(next);
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
            <div className="min-w-0 flex-1 text-[11px] text-muted-foreground">
              Need a starting point? Use our sample Promo Banner ZIP.
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={busy || sampleBusy}
              onClick={() => void downloadSample()}
            >
              {sampleBusy ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <Download className="mr-1 size-3.5" />
              )}
              Download sample
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 text-xs"
              disabled={busy || sampleBusy}
              onClick={() => void useSample()}
            >
              Use sample
            </Button>
          </div>

          <div className="space-y-1.5 rounded-lg border bg-muted/20 p-3">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Component criteria
            </div>
            <div className="max-h-48 space-y-2 overflow-auto">
              {criteria.map((item) => (
                <CriterionRow key={item.id} item={item} />
              ))}
            </div>
          </div>

          {phase === 'checking' ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Checking package against criteria…
            </div>
          ) : null}

          {phase === 'uploading' || phase === 'processing' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {phase === 'uploading' ? 'Uploading…' : 'Processing on server…'}
                </span>
                <span className="font-medium tabular-nums">
                  {phase === 'uploading' ? `${uploadPercent}%` : 'Installing'}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full bg-primary transition-[width] duration-150',
                    phase === 'processing' && 'w-full animate-pulse',
                  )}
                  style={{ width: phase === 'uploading' ? `${uploadPercent}%` : '100%' }}
                />
              </div>
            </div>
          ) : null}

          {phase === 'done' && installed ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-foreground">
              Installed <strong>{installed.name}</strong> ({installed.key}).
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          {validation?.manifest && phase !== 'pick' ? (
            <div className="text-[11px] text-muted-foreground">
              Package: {validation.manifest.name} · {validation.manifest.key} · v
              {validation.manifest.version} · {validation.manifest.category}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {phase === 'done' ? (
            <Button type="button" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              {(phase === 'error' || phase === 'ready') && file ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void inspectFile(file)}
                >
                  Re-check
                </Button>
              ) : null}
              <Button
                type="button"
                disabled={busy || phase !== 'ready' || !validation?.ok}
                onClick={() => void startUpload()}
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    {phase === 'checking'
                      ? 'Checking…'
                      : phase === 'uploading'
                        ? 'Uploading…'
                        : 'Processing…'}
                  </>
                ) : (
                  'Upload & install'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

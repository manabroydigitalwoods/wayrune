import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, Circle, FileImage, Loader2, Trash2, Upload, X } from 'lucide-react';
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
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { apiUpload } from '../../api';
import { presencePublicMediaUrl } from './builder/helpers';
import type { Identity, Site } from './builder/types';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 20;
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
]);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.pdf']);

type Criterion = {
  id: string;
  label: string;
  status: 'pending' | 'pass' | 'fail';
  detail?: string;
};

type AssetFile = {
  id: string;
  originalName: string;
  mimeType?: string | null;
  createdAt: string;
};

type DraftFile = {
  localId: string;
  file: File;
  previewUrl: string | null;
  criteria: Criterion[];
  ok: boolean;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function extOf(name: string) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function validateAssetFile(file: File): { ok: boolean; criteria: Criterion[] } {
  const ext = extOf(file.name);
  const mime = (file.type || '').toLowerCase();
  const mimeOk =
    ALLOWED_MIME.has(mime) ||
    (mime === '' && ALLOWED_EXT.has(ext)) ||
    (mime.startsWith('image/') && ALLOWED_EXT.has(ext));
  const sizeOk = file.size > 0 && file.size <= MAX_BYTES;
  const nameOk = Boolean(file.name.trim()) && file.name.length <= 180 && !/[\\/]/.test(file.name);

  const criteria: Criterion[] = [
    {
      id: 'type',
      label: 'Allowed file type',
      status: mimeOk ? 'pass' : 'fail',
      detail: mimeOk
        ? mime || ext || 'ok'
        : `Use JPG, PNG, GIF, WebP, SVG, or PDF (got ${mime || ext || 'unknown'})`,
    },
    {
      id: 'size',
      label: `Size under ${formatBytes(MAX_BYTES)}`,
      status: sizeOk ? 'pass' : 'fail',
      detail: sizeOk
        ? formatBytes(file.size)
        : file.size === 0
          ? 'File is empty'
          : `${formatBytes(file.size)} exceeds limit`,
    },
    {
      id: 'name',
      label: 'Valid file name',
      status: nameOk ? 'pass' : 'fail',
      detail: nameOk ? file.name : 'Rename the file (no path characters, max 180 chars)',
    },
  ];

  return { ok: criteria.every((c) => c.status === 'pass'), criteria };
}

function CriterionRow({ item }: { item: Criterion }) {
  const icon =
    item.status === 'pass' ? (
      <Check className="size-3.5 text-emerald-500" />
    ) : item.status === 'fail' ? (
      <X className="size-3.5 text-destructive" />
    ) : (
      <Circle className="size-3.5 text-muted-foreground/40" />
    );
  return (
    <div className="flex gap-2 text-xs">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className={item.status === 'fail' ? 'text-destructive' : 'text-foreground'}>
          {item.label}
        </div>
        {item.detail ? (
          <div className="truncate text-[11px] text-muted-foreground">{item.detail}</div>
        ) : null}
      </div>
    </div>
  );
}

function fileKey(file: File) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export function AssetUploadDialog({
  open,
  onOpenChange,
  siteId,
  siteName,
  site,
  identity,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  siteName?: string;
  site?: Pick<Site, 'primaryDomain' | 'isPrimary' | 'platformSlug' | 'platformHost'> | null;
  identity: Identity | null;
  onUploaded: (file: AssetFile) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const idPrefix = useId();
  const seqRef = useRef(0);
  const draftsRef = useRef<DraftFile[]>([]);
  const [drafts, setDrafts] = useState<DraftFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadIndex, setUploadIndex] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  draftsRef.current = drafts;

  const revokeDrafts = useCallback((items: DraftFile[]) => {
    for (const d of items) {
      if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
    }
  }, []);

  const reset = useCallback(() => {
    revokeDrafts(draftsRef.current);
    setDrafts([]);
    setUploading(false);
    setUploadIndex(0);
    setDragOver(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }, [revokeDrafts]);

  useEffect(() => {
    if (!open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => {
      revokeDrafts(draftsRef.current);
    };
  }, [revokeDrafts]);

  const addFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    if (!list.length) return;

    const prev = draftsRef.current;
    const existingKeys = new Set(prev.map((d) => fileKey(d.file)));
    const next = [...prev];
    let skippedDup = 0;
    let skippedCap = 0;

    for (const file of list) {
      if (next.length >= MAX_FILES) {
        skippedCap += 1;
        continue;
      }
      const key = fileKey(file);
      if (existingKeys.has(key)) {
        skippedDup += 1;
        continue;
      }
      existingKeys.add(key);
      seqRef.current += 1;
      const result = validateAssetFile(file);
      next.push({
        localId: `${idPrefix}-${seqRef.current}`,
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        criteria: result.criteria,
        ok: result.ok,
      });
    }

    setDrafts(next);
    if (skippedCap > 0) {
      setError(`You can upload up to ${MAX_FILES} files at a time.`);
    } else if (skippedDup > 0) {
      setError(`${skippedDup} duplicate file${skippedDup === 1 ? '' : 's'} skipped.`);
    } else {
      setError(null);
    }
  };

  const removeDraft = (localId: string) => {
    setDrafts((prev) => {
      const target = prev.find((d) => d.localId === localId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((d) => d.localId !== localId);
    });
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && uploading) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const allOk = drafts.length > 0 && drafts.every((d) => d.ok);
  const validCount = drafts.filter((d) => d.ok).length;

  const submit = async () => {
    if (!allOk || !siteId) return;
    const queue = [...drafts];
    setUploading(true);
    setError(null);
    let succeeded = 0;
    let lastUploaded: AssetFile | null = null;

    try {
      for (let i = 0; i < queue.length; i += 1) {
        setUploadIndex(i + 1);
        const draft = queue[i]!;
        const body = new FormData();
        body.append('file', draft.file);
        const uploaded = await apiUpload<AssetFile & { name?: string }>(
          `/files/upload?entityType=${encodeURIComponent('presence_site')}&entityId=${encodeURIComponent(siteId)}`,
          body,
        );
        const row: AssetFile = {
          id: uploaded.id,
          originalName: uploaded.originalName || uploaded.name || draft.file.name,
          mimeType: uploaded.mimeType,
          createdAt: uploaded.createdAt || new Date().toISOString(),
        };
        onUploaded(row);
        lastUploaded = row;
        succeeded += 1;
      }

      toastSuccess(
        succeeded === 1 ? 'Asset uploaded' : `${succeeded} assets uploaded`,
      );

      if (succeeded === 1 && lastUploaded) {
        const publicUrl = presencePublicMediaUrl(identity, lastUploaded.id, site);
        if (publicUrl) {
          try {
            await navigator.clipboard.writeText(publicUrl);
            toastSuccess('Public media URL copied');
          } catch {
            /* ignore */
          }
        }
      }

      handleOpenChange(false);
    } catch (e) {
      const message =
        e instanceof Error
          ? succeeded > 0
            ? `${succeeded} uploaded, then failed: ${e.message}`
            : e.message
          : 'Upload failed';
      setError(message);
      toastError(message);
    } finally {
      setUploading(false);
      setUploadIndex(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[min(85vh,560px)] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>Upload assets</DialogTitle>
          <DialogDescription>
            Add images or PDFs for{' '}
            <span className="text-foreground">{siteName || 'this website'}</span>. Each file is
            validated before upload.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <button
            type="button"
            className={cn(
              'flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition',
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/40 hover:bg-muted/30',
            )}
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
            }}
          >
            <FileImage className="size-8 text-muted-foreground" />
            <div className="text-sm font-medium">Drop files here, or click to browse</div>
            <p className="text-[11px] text-muted-foreground">
              JPG, PNG, GIF, WebP, SVG, or PDF · max {formatBytes(MAX_BYTES)} each · up to{' '}
              {MAX_FILES} files
            </p>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,application/pdf,.jpg,.jpeg,.png,.gif,.webp,.svg,.pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = '';
            }}
          />

          {drafts.length ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground">
                  {drafts.length} file{drafts.length === 1 ? '' : 's'} selected
                  {validCount < drafts.length
                    ? ` · ${drafts.length - validCount} need attention`
                    : ''}
                </div>
                {!uploading ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      revokeDrafts(drafts);
                      setDrafts([]);
                      setError(null);
                    }}
                  >
                    Clear all
                  </Button>
                ) : null}
              </div>
              <div className="space-y-2">
                {drafts.map((draft) => (
                  <div
                    key={draft.localId}
                    className={cn(
                      'rounded-lg border p-3',
                      draft.ok ? 'border-border' : 'border-destructive/40',
                    )}
                  >
                    <div className="flex gap-3">
                      {draft.previewUrl ? (
                        <img
                          src={draft.previewUrl}
                          alt=""
                          className="size-12 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted">
                          <FileImage className="size-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{draft.file.name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {formatBytes(draft.file.size)}
                            </div>
                          </div>
                          {!uploading ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7 shrink-0 text-destructive"
                              onClick={() => removeDraft(draft.localId)}
                              aria-label={`Remove ${draft.file.name}`}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          ) : null}
                        </div>
                        {!draft.ok ? (
                          <div className="mt-2 space-y-1.5">
                            {draft.criteria
                              .filter((c) => c.status === 'fail')
                              .map((item) => (
                                <CriterionRow key={item.id} item={item} />
                              ))}
                          </div>
                        ) : (
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                            <Check className="size-3" />
                            Ready to upload
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Choose one or more files to run type, size, and name checks before uploading.
            </p>
          )}

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </DialogBody>

        <DialogFooter className="shrink-0">
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!allOk || uploading} onClick={() => void submit()}>
            {uploading ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                Uploading {uploadIndex}/{drafts.length}…
              </>
            ) : (
              <>
                <Upload className="mr-1.5 size-3.5" />
                {drafts.length > 1 ? `Upload ${drafts.length}` : 'Upload'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

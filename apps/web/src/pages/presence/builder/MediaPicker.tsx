import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Upload } from 'lucide-react';
import { Button, Input, Label, RecordSheet, Skeleton, cn } from '@wayrune/ui';
import { api, apiUpload } from '../../../api';
import { presencePublicMediaUrl } from './helpers';
import type { Identity } from './types';

type FileRow = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  createdAt?: string;
};

type SiteHost = {
  primaryDomain?: string | null;
  isPrimary?: boolean;
  platformSlug?: string | null;
  platformHost?: string | null;
};

export function MediaPickerField({
  label,
  value,
  dense,
  siteId,
  identity,
  site,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  dense?: boolean;
  siteId: string;
  identity: Identity | null;
  site?: SiteHost | null;
  disabled?: boolean;
  onChange: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Label className={dense ? 'text-xs' : undefined}>{label}</Label>
      <div className="mt-1 flex gap-1.5">
        <Input
          className={cn('min-w-0 flex-1', dense ? 'h-8' : undefined)}
          type="url"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… or pick from library"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            'shrink-0 border-input bg-card/85 shadow-sm hover:bg-card',
            dense ? 'h-8 rounded-md px-2' : 'h-9 rounded-md',
          )}
          disabled={disabled}
          onClick={() => setOpen(true)}
          title="Browse media library"
        >
          <ImagePlus className="size-3.5" />
        </Button>
      </div>
      <MediaPickerDialog
        open={open}
        onOpenChange={setOpen}
        siteId={siteId}
        identity={identity}
        site={site}
        onPick={(url) => {
          onChange(url);
          setOpen(false);
        }}
      />
    </div>
  );
}

export function MediaPickerDialog({
  open,
  onOpenChange,
  siteId,
  identity,
  site,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  identity: Identity | null;
  site?: SiteHost | null;
  onPick: (url: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [files, setFiles] = useState<FileRow[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !siteId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const rows = await api<FileRow[]>(
          `/files?entityType=${encodeURIComponent('presence_site')}&entityId=${encodeURIComponent(siteId)}`,
        );
        if (!cancelled) {
          setFiles(rows.filter((row) => String(row.mimeType || '').startsWith('image/')));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load media');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, siteId]);

  const upload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const uploaded = await apiUpload<FileRow>(
        `/files/upload?entityType=${encodeURIComponent('presence_site')}&entityId=${encodeURIComponent(siteId)}`,
        body,
      );
      const url = presencePublicMediaUrl(identity, uploaded.id, site);
      if (!url) throw new Error('Site host not configured for public media');
      setFiles((prev) => [uploaded, ...prev.filter((row) => row.id !== uploaded.id)]);
      onPick(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <RecordSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Media library"
      description="Images attached to this site. Picked URLs work on the public presence pages."
      onSubmit={() => onOpenChange(false)}
      submitLabel="Done"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{files.length} image{files.length === 1 ? '' : 's'}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Upload className="mr-1.5 size-3.5" />}
            Upload
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = '';
            }}
          />
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {loading ? (
          <div
            role="status"
            aria-busy="true"
            className="grid max-h-72 grid-cols-3 gap-2 sm:grid-cols-4"
          >
            <span className="sr-only">Loading</span>
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-md" />
            ))}
          </div>
        ) : (
          <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {files.map((file) => {
              const url = presencePublicMediaUrl(identity, file.id, site) || '';
              return (
                <button
                  key={file.id}
                  type="button"
                  className="group overflow-hidden rounded-md border text-left hover:border-primary/50"
                  onClick={() => url && onPick(url)}
                  title={file.name}
                >
                  <div className="aspect-square bg-muted">
                    {url ? (
                      <img src={url} alt={file.name} className="size-full object-cover" loading="lazy" />
                    ) : null}
                  </div>
                  <div className="truncate px-1.5 py-1 text-[10px] text-muted-foreground group-hover:text-foreground">
                    {file.name}
                  </div>
                </button>
              );
            })}
            {!files.length ? (
              <div className="col-span-full rounded-md border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">
                No images yet — upload one to get started.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </RecordSheet>
  );
}

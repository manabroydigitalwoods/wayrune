import { useState } from 'react';
import { Copy, FileText, ImageIcon, Link2, RefreshCw, Upload } from 'lucide-react';
import {
  BrandTooltip,
  Button,
  Combobox,
  EmptyState,
  cn,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { presencePublicMediaUrl } from './builder/helpers';
import { AssetUploadDialog } from './AssetUploadDialog';
import type { Identity, Site } from './builder/types';

type AssetFile = {
  id: string;
  originalName: string;
  mimeType?: string | null;
  createdAt: string;
};

/** Fix common mojibake in uploaded filenames (e.g. â€˜ → ‘). */
function displayFileName(name: string) {
  try {
    // UTF-8 bytes misinterpreted as Latin-1
    if (/[\u00C0-\u00FF]/.test(name) && /â.|Ã.|Â./.test(name)) {
      const bytes = Uint8Array.from(name, (c) => c.charCodeAt(0) & 0xff);
      return new TextDecoder('utf-8').decode(bytes);
    }
  } catch {
    /* keep original */
  }
  return name;
}

function shortMime(mime?: string | null) {
  if (!mime) return 'file';
  if (mime.startsWith('image/')) return mime.replace('image/', '').toUpperCase();
  if (mime === 'application/pdf') return 'PDF';
  return mime.split('/').pop()?.toUpperCase() || 'file';
}

export function AssetsPanel({
  identity,
  sites,
  selectedSiteId,
  files,
  loading,
  canWrite,
  onSiteChange,
  onRefresh,
  onUploaded,
}: {
  identity: Identity | null;
  sites: Site[];
  selectedSiteId: string | null;
  files: AssetFile[];
  loading: boolean;
  canWrite: boolean;
  onSiteChange: (siteId: string) => void;
  onRefresh: () => void;
  onUploaded: (file: AssetFile) => void;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const site = sites.find((s) => s.id === selectedSiteId) || sites[0] || null;

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toastSuccess('URL copied');
    } catch {
      toastError('Could not copy URL');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {sites.length > 1 ? (
            <Combobox
              className="h-8 max-w-xs"
              value={site?.id || ''}
              onChange={onSiteChange}
              options={sites.map((s) => ({ value: s.id, label: s.name }))}
            />
          ) : (
            <p className="truncate text-sm text-muted-foreground">
              <span className="text-foreground">{site?.name || 'Website'}</span>
              <span className="mx-1.5 text-border">·</span>
              Media library
            </p>
          )}
          <p className="hidden text-[11px] text-muted-foreground sm:block">
            For logos, heroes, and galleries · public on site host
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <BrandTooltip label="Refresh">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Refresh"
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </Button>
          </BrandTooltip>
          {canWrite && site ? (
            <Button type="button" size="sm" className="h-8" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-1.5 size-3.5" />
              Upload
            </Button>
          ) : null}
        </div>
      </div>

      {loading && !files.length ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading assets…</div>
      ) : files.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {files.map((file) => {
            const url = presencePublicMediaUrl(identity, file.id, site);
            const isImage = String(file.mimeType || '').startsWith('image/');
            const name = displayFileName(file.originalName);
            return (
              <div
                key={file.id}
                className="group relative overflow-hidden rounded-lg border bg-card/30 transition hover:border-primary/40"
              >
                <div className="relative aspect-square bg-muted/30">
                  {isImage && url ? (
                    <img
                      src={url}
                      alt={name}
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
                      <FileText className="size-6 opacity-60" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">
                        {shortMime(file.mimeType)}
                      </span>
                    </div>
                  )}
                  {url ? (
                    <div className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/55 via-transparent to-transparent p-1.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                      <BrandTooltip label="Copy public URL">
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="size-7 bg-background/90 shadow-sm"
                          aria-label="Copy public URL"
                          onClick={() => void copyUrl(url)}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                      </BrandTooltip>
                    </div>
                  ) : null}
                </div>
                <div className="space-y-0.5 px-2 py-1.5">
                  <div className="truncate text-xs font-medium leading-tight" title={name}>
                    {name}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span>{shortMime(file.mimeType)}</span>
                    <span aria-hidden>·</span>
                    <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                    {url ? (
                      <button
                        type="button"
                        className="ml-auto inline-flex items-center gap-0.5 rounded px-1 py-0.5 hover:bg-muted hover:text-foreground sm:hidden"
                        onClick={() => void copyUrl(url)}
                      >
                        <Link2 className="size-3" />
                        Copy
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={ImageIcon}
          title="No assets yet"
          description="Upload images for the page builder media picker."
          action={
            canWrite && site ? (
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="mr-1.5 size-3.5" />
                Upload
              </Button>
            ) : undefined
          }
        />
      )}

      {site ? (
        <AssetUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          siteId={site.id}
          siteName={site.name}
          site={site}
          identity={identity}
          onUploaded={onUploaded}
        />
      ) : null}
    </div>
  );
}

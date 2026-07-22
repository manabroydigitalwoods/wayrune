import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import { ArrowLeft, Copy, Link2, Share2 } from 'lucide-react';
import {
  Breadcrumbs,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  PublicPageSkeleton,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../api';
import { reportError } from '../lib/errors';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  ItineraryPreviewView,
  type ItineraryPreviewPayload,
} from '../components/trips/ItineraryPreviewView';
import { FamilySharingPanel } from '../components/trips/FamilySharingPanel';

export function ItineraryPreviewPage() {
  const { id } = useParams();
  const { navigate } = useOrgNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<ItineraryPreviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [sharePin, setSharePin] = useState('');
  const [sharing, setSharing] = useState(false);

  useDocumentTitle(data ? `Preview · ${data.trip.title}` : 'Itinerary preview');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await api<ItineraryPreviewPayload>(`/trips/${id}/itinerary-preview`);
      setData(res);
    } catch (e) {
      reportError(e, 'Could not load preview');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const createShare = useCallback(async () => {
    if (!id) return;
    setSharing(true);
    try {
      const res = await api<{ path: string; token: string; familyPin: string }>(
        `/trips/${id}/itinerary-shares`,
        {
          method: 'POST',
          body: JSON.stringify({ expiresInDays: 30 }),
        },
      );
      const url = `${window.location.origin}${res.path}`;
      setShareUrl(url);
      setSharePin(res.familyPin);
      setShareOpen(true);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create share link');
    } finally {
      setSharing(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get('share') !== '1' || loading || !data) return;
    void createShare();
    const next = new URLSearchParams(searchParams);
    next.delete('share');
    setSearchParams(next, { replace: true });
  }, [searchParams, loading, data, createShare, setSearchParams]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toastSuccess('Link copied');
    } catch {
      toastError('Could not copy link');
    }
  }

  async function copyPin() {
    try {
      await navigator.clipboard.writeText(sharePin);
      toastSuccess('PIN copied — send it separately from the link');
    } catch {
      toastError('Could not copy PIN');
    }
  }

  if (loading) return <PublicPageSkeleton />;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-7">
      <Breadcrumbs
        items={[
          { label: 'Trips', onClick: () => navigate('/trips') },
          { label: data?.trip.tripNumber || 'Trip', onClick: () => navigate(`/trips/${id}`) },
          { label: 'Preview' },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => navigate(`/trips/${id}?tab=itinerary`)}>
          <ArrowLeft className="size-4" />
          Back to editor
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
          <Button type="button" onClick={() => void createShare()} disabled={sharing || loading}>
            <Share2 className="size-4" />
            {sharing ? 'Creating…' : 'Share link'}
          </Button>
        </div>
      </div>

      {data ? (
        <div className="proposal-atmosphere space-y-6">
          {/* Client proposal always renders light — matches public share + PDF */}
          <div className="light rounded-2xl border border-white/70 p-5 text-foreground glass-strong sm:p-8">
            <ItineraryPreviewView data={data} />
          </div>
          {id ? <FamilySharingPanel mode="staff" tripId={id} /> : null}
        </div>
      ) : (
        <p className="text-sm text-destructive">Preview unavailable.</p>
      )}

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share with the family</DialogTitle>
            <DialogDescription>
              Send the link and the family PIN <strong>separately</strong> (e.g. link on WhatsApp,
              PIN by call/SMS). Anyone with both can ❤️, comment and ask — you answer once.
              Expires in 30 days.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Public link</label>
              <div className="flex gap-2">
                <Input readOnly value={shareUrl} className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={() => void copyLink()} aria-label="Copy link">
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
              <label className="text-sm font-medium">Family PIN (shown once)</label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={sharePin}
                  className="font-mono text-lg font-semibold tracking-[0.2em]"
                />
                <Button type="button" variant="outline" size="icon" onClick={() => void copyPin()} aria-label="Copy PIN">
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                PIN is not stored in plain text after this — save it now if you need to resend.
              </p>
            </div>
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Link2 className="size-3.5" />
              Open public page
            </a>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShareOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

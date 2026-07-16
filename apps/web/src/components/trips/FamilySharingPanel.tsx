import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Input,
  SoftIcon,
  Textarea,
  cn,
  toastError,
  toastSuccess,
} from '@travel/ui';
import { Copy, Heart, Lock, Mail, MessageCircle, Share2, Users } from 'lucide-react';
import { api } from '../../api';
import { reportError } from '../../lib/errors';

export type FamilyThreadPayload = {
  shareLinkId: string | null;
  token: string | null;
  path: string | null;
  tripId: string;
  pinRequired?: boolean;
  unlocked?: boolean;
  familyPinSet?: boolean;
  me: { viewerKey: string; displayName: string; relationHint: string | null } | null;
  participants: Array<{
    id: string;
    displayName: string;
    relationHint: string | null;
    lastSeenAt: string;
  }>;
  loveCount: number;
  lovedByMe: boolean;
  messages: Array<{
    id: string;
    authorRole: string;
    authorName: string;
    kind: string;
    body: string;
    createdAt: string;
  }>;
};

const RELATION_HINTS = ['Spouse', 'Parent', 'Sibling', 'Friend', 'Family'];

type StoredViewer = {
  viewerKey: string;
  displayName: string;
  relationHint: string;
  pin: string;
};

function viewerStorageKey(token: string) {
  return `proposal-family:${token}`;
}

function loadStoredViewer(token: string): StoredViewer | null {
  try {
    const raw = localStorage.getItem(viewerStorageKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredViewer>;
    if (!parsed.viewerKey || !parsed.displayName) return null;
    return {
      viewerKey: parsed.viewerKey,
      displayName: parsed.displayName,
      relationHint: parsed.relationHint || '',
      pin: parsed.pin || '',
    };
  } catch {
    return null;
  }
}

function saveStoredViewer(token: string, data: StoredViewer) {
  localStorage.setItem(viewerStorageKey(token), JSON.stringify(data));
}

function newViewerKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `v_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function FamilySharingPanel({
  mode,
  token,
  tripId,
  className,
}: {
  mode: 'public' | 'staff';
  token?: string;
  tripId?: string;
  className?: string;
}) {
  const [thread, setThread] = useState<FamilyThreadPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [relationHint, setRelationHint] = useState('');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [asQuestion, setAsQuestion] = useState(false);
  const [reply, setReply] = useState('');

  const stored = useMemo(
    () => (mode === 'public' && token ? loadStoredViewer(token) : null),
    [mode, token],
  );

  const viewerKey = useMemo(() => {
    if (mode !== 'public' || !token) return '';
    return stored?.viewerKey || newViewerKey();
  }, [mode, token, stored?.viewerKey]);

  useEffect(() => {
    if (stored) {
      setName(stored.displayName);
      setRelationHint(stored.relationHint || '');
      if (stored.pin) setPin(stored.pin);
    }
  }, [stored]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === 'public' && token) {
        const params = new URLSearchParams();
        if (viewerKey) params.set('viewerKey', viewerKey);
        const unlockPin = stored?.pin || pin;
        if (unlockPin) params.set('pin', unlockPin);
        const qs = params.toString() ? `?${params}` : '';
        const res = await api<FamilyThreadPayload>(
          `/public/itinerary/${encodeURIComponent(token)}/family${qs}`,
          { skipAuthRefresh: true },
        );
        setThread(res);
      } else if (mode === 'staff' && tripId) {
        const res = await api<FamilyThreadPayload>(`/trips/${tripId}/proposal-family`);
        setThread(res);
      }
    } catch (e) {
      reportError(e, 'Could not load family thread');
    } finally {
      setLoading(false);
    }
  }, [mode, token, tripId, viewerKey, stored?.pin, pin]);

  useEffect(() => {
    void load();
    // Intentionally exclude `pin` so typing doesn't refetch every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, token, tripId, viewerKey, stored?.pin]);

  async function join(e: FormEvent) {
    e.preventDefault();
    if (!token || !viewerKey) return;
    const displayName = name.trim();
    if (!displayName) {
      toastError('Enter your name so the family knows who commented');
      return;
    }
    if (thread?.pinRequired && !/^\d{4,8}$/.test(pin.trim())) {
      toastError('Enter the 4–8 digit family PIN from the agency');
      return;
    }
    setBusy(true);
    try {
      const res = await api<FamilyThreadPayload>(
        `/public/itinerary/${encodeURIComponent(token)}/family/join`,
        {
          method: 'POST',
          body: JSON.stringify({
            viewerKey,
            displayName,
            relationHint: relationHint.trim() || null,
            pin: pin.trim() || undefined,
          }),
          skipAuthRefresh: true,
        },
      );
      saveStoredViewer(token, {
        viewerKey,
        displayName,
        relationHint: relationHint.trim(),
        pin: pin.trim(),
      });
      setThread(res);
      toastSuccess('You’re in — say hello or ❤️ the trip');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not join');
    } finally {
      setBusy(false);
    }
  }

  async function toggleLove() {
    if (!token || !viewerKey) return;
    if (!thread?.me) {
      toastError('Join with your name first');
      return;
    }
    setBusy(true);
    try {
      const res = await api<FamilyThreadPayload>(
        `/public/itinerary/${encodeURIComponent(token)}/family/react`,
        {
          method: 'POST',
          body: JSON.stringify({
            viewerKey,
            kind: 'love',
            pin: pin.trim() || stored?.pin || undefined,
          }),
          skipAuthRefresh: true,
        },
      );
      setThread(res);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not react');
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!token || !viewerKey) return;
    if (!thread?.me) {
      toastError('Join with your name first');
      return;
    }
    const body = message.trim();
    if (!body) return;
    setBusy(true);
    try {
      const res = await api<FamilyThreadPayload>(
        `/public/itinerary/${encodeURIComponent(token)}/family/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            viewerKey,
            body,
            kind: asQuestion ? 'question' : 'comment',
            pin: pin.trim() || stored?.pin || undefined,
          }),
          skipAuthRefresh: true,
        },
      );
      setThread(res);
      setMessage('');
      setAsQuestion(false);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not send');
    } finally {
      setBusy(false);
    }
  }

  async function sendAgencyReply(e: FormEvent) {
    e.preventDefault();
    if (!tripId) return;
    const body = reply.trim();
    if (!body) return;
    setBusy(true);
    try {
      const res = await api<FamilyThreadPayload>(`/trips/${tripId}/proposal-family/messages`, {
        method: 'POST',
        body: JSON.stringify({
          body,
          shareLinkId: thread?.shareLinkId || undefined,
        }),
      });
      setThread(res);
      setReply('');
      toastSuccess('Reply shared with the family');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not reply');
    } finally {
      setBusy(false);
    }
  }

  async function copyShareLink() {
    const path = thread?.path || (token ? `/p/itinerary/${token}` : null);
    if (!path) return;
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      toastSuccess('Link copied — send the family PIN separately');
    } catch {
      toastError('Could not copy link');
    }
  }

  function shareViaWhatsApp() {
    const path = thread?.path || (token ? `/p/itinerary/${token}` : null);
    if (!path) return;
    const url = `${window.location.origin}${path}`;
    const text = encodeURIComponent(
      `Take a look at our trip proposal:\n${url}\n\n(Ask me for the family PIN to comment together.)`,
    );
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  }

  function shareViaEmail() {
    const path = thread?.path || (token ? `/p/itinerary/${token}` : null);
    if (!path) return;
    const url = `${window.location.origin}${path}`;
    const subject = encodeURIComponent('Our trip proposal — decide together');
    const body = encodeURIComponent(
      `Hi,\n\nHere's our trip proposal:\n${url}\n\nI'll share the family PIN separately so we can comment and ask questions together.\n`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  if (loading) {
    return (
      <div
        className={cn(
          'rounded-2xl border px-5 py-6 text-center text-sm text-muted-foreground glass',
          className,
        )}
      >
        Loading family sharing…
      </div>
    );
  }

  if (mode === 'staff' && !thread?.shareLinkId) {
    return (
      <div className={cn('rounded-2xl border px-5 py-6 text-center glass', className)}>
        <SoftIcon icon={Users} className="mx-auto size-10" />
        <h3 className="mt-3 font-display text-lg font-semibold">Family sharing</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Create a client share link first. You’ll get a family PIN — send the link and PIN
          separately so only invited people can comment.
        </p>
      </div>
    );
  }

  const joined = Boolean(thread?.me);
  const unlocked = mode === 'staff' || thread?.unlocked !== false;
  const pinRequired = Boolean(thread?.pinRequired);

  return (
    <section className={cn('space-y-4 rounded-2xl border p-5 glass sm:p-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <SoftIcon icon={Users} className="size-9" />
            <div>
              <h3 className="font-display text-lg font-semibold">
                {mode === 'public' ? 'Decide together' : 'Family Q&A'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {mode === 'public'
                  ? pinRequired
                    ? 'Enter the family PIN from your agent, then join to love, comment or ask.'
                    : 'Share this proposal with family — everyone can love, comment and ask once.'
                  : thread?.familyPinSet
                    ? 'PIN-protected share is active. Answer once — family sees it on the link.'
                    : 'Answer family questions here. Your reply appears on the shared proposal.'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unlocked ? (
            <button
              type="button"
              disabled={mode === 'staff' || busy || !joined}
              onClick={() => void toggleLove()}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition',
                thread?.lovedByMe
                  ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                  : 'glass-row',
                (mode === 'staff' || !joined) && 'opacity-80',
              )}
              title={mode === 'staff' ? 'Family loves' : joined ? 'Toggle love' : 'Join to react'}
            >
              <Heart className={cn('size-3.5', thread?.lovedByMe && 'fill-current')} />
              {thread?.loveCount ?? 0}
            </button>
          ) : null}
          {(thread?.path || token) && mode === 'staff' ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => shareViaWhatsApp()}>
                <MessageCircle className="size-3.5" />
                WhatsApp
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => shareViaEmail()}>
                <Mail className="size-3.5" />
                Email
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void copyShareLink()}>
                <Copy className="size-3.5" />
                Copy link
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {mode === 'public' && !unlocked ? (
        <form onSubmit={join} className="space-y-3 rounded-xl border p-4 glass-well">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Lock className="size-4 text-primary" />
            Unlock with family PIN
          </div>
          <p className="text-xs text-muted-foreground">
            Your agent shares a short PIN separately from this link. Without it you can’t see or
            post in the family thread.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Family PIN"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              autoComplete="name"
            />
            <Input
              value={relationHint}
              onChange={(e) => setRelationHint(e.target.value)}
              placeholder="e.g. Spouse, Parent"
              list="family-relation-hints"
              className="sm:col-span-2"
            />
            <datalist id="family-relation-hints">
              {RELATION_HINTS.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
          </div>
          <Button type="submit" disabled={busy}>
            <Share2 className="size-3.5" />
            Unlock & join
          </Button>
        </form>
      ) : null}

      {mode === 'public' && unlocked && !joined ? (
        <form onSubmit={join} className="space-y-3 rounded-xl border p-4 glass-well">
          <p className="text-sm font-medium">Join as yourself</p>
          {pinRequired ? (
            <Input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Family PIN"
              inputMode="numeric"
              required
            />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              autoComplete="name"
            />
            <Input
              value={relationHint}
              onChange={(e) => setRelationHint(e.target.value)}
              placeholder="e.g. Spouse, Parent"
              list="family-relation-hints"
            />
            <datalist id="family-relation-hints">
              {RELATION_HINTS.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
          </div>
          <Button type="submit" disabled={busy}>
            <Share2 className="size-3.5" />
            Join family view
          </Button>
        </form>
      ) : null}

      {unlocked ? (
        <>
          {thread?.participants && thread.participants.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {thread.participants.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs glass-row"
                >
                  <span className="font-medium">{p.displayName}</span>
                  {p.relationHint ? (
                    <span className="text-muted-foreground">· {p.relationHint}</span>
                  ) : null}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {mode === 'public'
                ? 'Be the first to join — then forward this link (and PIN) to the rest of the family.'
                : 'No family members have joined yet.'}
            </p>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <MessageCircle className="size-3.5" />
              Conversation
            </div>
            {thread?.messages.length ? (
              <ul className="space-y-2">
                {thread.messages.map((m) => (
                  <li
                    key={m.id}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-sm',
                      m.authorRole === 'agency' ? 'border-primary/25 bg-primary/5' : 'glass-row',
                    )}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">
                        {m.authorName}
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {m.kind === 'question'
                            ? 'Question'
                            : m.kind === 'answer'
                              ? 'Agency reply'
                              : m.authorRole === 'agency'
                                ? 'Agency'
                                : 'Comment'}
                        </span>
                      </p>
                      <span className="text-[11px] text-muted-foreground">
                        {formatWhen(m.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap leading-relaxed">{m.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No comments yet — ask about hotels, pacing or budget.
              </p>
            )}
          </div>

          {mode === 'public' && joined ? (
            <form onSubmit={sendMessage} className="space-y-2">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Comment or ask the agency…"
                rows={3}
                maxLength={1000}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    id="family-as-question"
                    checked={asQuestion}
                    onCheckedChange={(checked) => setAsQuestion(checked === true)}
                  />
                  <label htmlFor="family-as-question" className="cursor-pointer">
                    Mark as question (notifies the agency)
                  </label>
                </div>
                <Button type="submit" size="sm" disabled={busy || !message.trim()}>
                  Send
                </Button>
              </div>
            </form>
          ) : null}

          {mode === 'staff' ? (
            <form onSubmit={sendAgencyReply} className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">Reply to the family</p>
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Answer once — everyone on the share link will see it."
                rows={3}
                maxLength={2000}
              />
              <Button type="submit" size="sm" disabled={busy || !reply.trim()}>
                Post agency reply
              </Button>
            </form>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

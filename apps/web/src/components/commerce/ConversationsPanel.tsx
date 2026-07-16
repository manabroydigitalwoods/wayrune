import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  Input,
  StatusBadge,
  toastError,
  toastSuccess,
} from '@travel/ui';
import { api } from '../../api';
import { reportError } from '../../lib/errors';

type Conversation = {
  id: string;
  subject?: string | null;
  status: string;
  linkedEntityType?: string | null;
  linkedEntityId?: string | null;
  messages?: Array<{ id: string; body: string; createdAt: string }>;
};

export function ConversationsPanel() {
  const [rows, setRows] = useState<Conversation[]>([]);
  const [subject, setSubject] = useState('');
  const [messageById, setMessageById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const data = await api<Conversation[]>('/commerce/conversations');
      setRows(data);
    } catch (e) {
      reportError(e, 'Could not load conversations');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createThread() {
    if (!subject.trim()) return;
    try {
      await api('/commerce/conversations', {
        method: 'POST',
        body: JSON.stringify({
          subject: subject.trim(),
        }),
      });
      toastSuccess('Conversation started');
      setSubject('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create conversation');
    }
  }

  async function postMessage(id: string) {
    const body = messageById[id]?.trim();
    if (!body) return;
    try {
      await api(`/commerce/conversations/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      toastSuccess('Message sent');
      setMessageById((m) => ({ ...m, [id]: '' }));
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not send message');
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div>
          <h3 className="text-sm font-semibold">Inbox threads</h3>
          <p className="text-xs text-muted-foreground">
            Conversations linked to trips, requests, reservations, or invoices.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-sm"
            placeholder="New thread subject…"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <Button type="button" size="sm" onClick={() => void createThread()}>
            Start
          </Button>
        </div>
        {rows.length ? (
          <ul className="space-y-3">
            {rows.map((c) => (
              <li key={c.id} className="rounded-xl border px-3 py-2.5 text-sm glass-row">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{c.subject || 'Untitled'}</span>
                  <StatusBadge value={c.status} />
                </div>
                {(c.messages || []).slice(-3).map((m) => (
                  <p key={m.id} className="mt-1 text-xs text-muted-foreground">
                    {m.body}
                  </p>
                ))}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Input
                    className="max-w-sm"
                    placeholder="Reply…"
                    value={messageById[c.id] || ''}
                    onChange={(e) =>
                      setMessageById((prev) => ({ ...prev, [c.id]: e.target.value }))
                    }
                  />
                  <Button size="sm" variant="secondary" onClick={() => void postMessage(c.id)}>
                    Send
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No conversations yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

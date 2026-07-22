import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@wayrune/ui';
import { api } from '../api';

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  linkPath?: string | null;
  readAt?: string | null;
  createdAt: string;
};

export function NotificationsBell({ onNavigate }: { onNavigate: (to: string) => void }) {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const [list, count] = await Promise.all([
        api<NotificationRow[]>('/notifications'),
        api<{ count: number }>('/notifications/unread-count'),
      ]);
      setItems(list);
      setUnread(count.count);
    } catch {
      /* bell is best-effort */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  async function markRead(id: string, linkPath?: string | null) {
    try {
      await api(`/notifications/${id}/read`, { method: 'POST' });
      await load();
    } catch {
      /* ignore */
    }
    if (linkPath) onNavigate(linkPath);
  }

  async function markAll() {
    try {
      await api('/notifications/read-all', { method: 'POST' });
      await load();
    } catch {
      /* ignore */
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon" variant="outline" className="relative overflow-visible" aria-label="Notifications">
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Notifications</span>
          {unread > 0 ? (
            <button type="button" className="text-xs text-primary underline" onClick={() => void markAll()}>
              Mark all read
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">No notifications yet</div>
        ) : (
          items.slice(0, 12).map((n) => (
            <DropdownMenuItem
              key={n.id}
              className="flex cursor-pointer flex-col items-start gap-0.5 py-2"
              onClick={() => void markRead(n.id, n.linkPath)}
            >
              <span className={`text-sm ${n.readAt ? 'font-normal' : 'font-semibold'}`}>{n.title}</span>
              <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type InboxConnectorReadiness = {
  channels: Record<
    string,
    { replyReady: boolean; status: 'ready' | 'incomplete' | 'off' }
  >;
  banners: Array<{
    channel: string;
    tone: 'info' | 'warn';
    message: string;
  }>;
};

export function inboxChannelReplyReady(
  channel: string,
  readiness: InboxConnectorReadiness | null | undefined,
): boolean {
  if (!readiness) return true;
  const row = readiness.channels[channel];
  if (row) return row.replyReady;
  return true;
}

export function inboxComposerBlockedMessage(
  channel: string,
  readiness: InboxConnectorReadiness | null | undefined,
): string | null {
  if (!readiness) return null;
  const banner = readiness.banners.find((b) => b.channel === channel);
  return banner?.message ?? null;
}

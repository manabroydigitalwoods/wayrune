import { describe, expect, it } from 'vitest';
import {
  inboxChannelReplyReady,
  inboxComposerBlockedMessage,
  type InboxConnectorReadiness,
} from './inboxChannelReply';

const readiness: InboxConnectorReadiness = {
  channels: {
    whatsapp: { replyReady: false, status: 'off' },
    instagram: { replyReady: false, status: 'off' },
    email: { replyReady: true, status: 'ready' },
  },
  banners: [
    {
      channel: 'whatsapp',
      tone: 'info',
      message: 'WhatsApp Cloud not connected',
    },
  ],
};

describe('inboxChannelReplyReady', () => {
  it('blocks channels that are not reply-ready', () => {
    expect(inboxChannelReplyReady('whatsapp', readiness)).toBe(false);
    expect(inboxChannelReplyReady('email', readiness)).toBe(true);
  });
});

describe('inboxComposerBlockedMessage', () => {
  it('returns the setup message for a blocked channel', () => {
    expect(inboxComposerBlockedMessage('whatsapp', readiness)).toMatch(
      /WhatsApp Cloud not connected/,
    );
    expect(inboxComposerBlockedMessage('email', readiness)).toBeNull();
  });
});

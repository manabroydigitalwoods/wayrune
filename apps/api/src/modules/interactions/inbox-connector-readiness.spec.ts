import { describe, expect, it } from 'vitest';
import {
  inboxChannelReplyReady,
  resolveInboxConnectorReadiness,
} from './inbox-connector-readiness';

describe('resolveInboxConnectorReadiness', () => {
  it('marks WhatsApp ready when Cloud credentials are complete', () => {
    const res = resolveInboxConnectorReadiness({
      googleConnected: false,
      settingsJson: {
        integrations: {
          whatsapp: {
            enabled: true,
            phoneNumberId: '123',
            accessTokenConfigured: true,
          },
        },
      },
    });
    expect(res.channels.whatsapp).toMatchObject({
      replyReady: true,
      status: 'ready',
    });
    expect(res.banners.some((b) => b.channel === 'whatsapp')).toBe(false);
  });

  it('warns when WhatsApp is enabled but incomplete', () => {
    const res = resolveInboxConnectorReadiness({
      googleConnected: false,
      settingsJson: {
        integrations: { whatsapp: { enabled: true, phoneNumberId: '' } },
      },
    });
    expect(res.channels.whatsapp.status).toBe('incomplete');
    expect(res.banners[0]?.channel).toBe('whatsapp');
    expect(res.banners[0]?.tone).toBe('warn');
  });

  it('requires Google connection for google_business reply', () => {
    const off = resolveInboxConnectorReadiness({
      googleConnected: false,
      settingsJson: {},
    });
    expect(off.channels.google_business.replyReady).toBe(false);
    expect(off.banners.some((b) => b.channel === 'google_business')).toBe(true);

    const on = resolveInboxConnectorReadiness({
      googleConnected: true,
      settingsJson: {},
    });
    expect(on.channels.google_business.replyReady).toBe(true);
  });
});

describe('inboxChannelReplyReady', () => {
  it('returns false for unconfigured instagram', () => {
    const readiness = resolveInboxConnectorReadiness({
      googleConnected: false,
      settingsJson: {},
    });
    expect(inboxChannelReplyReady('instagram', readiness)).toBe(false);
    expect(inboxChannelReplyReady('email', readiness)).toBe(true);
  });
});

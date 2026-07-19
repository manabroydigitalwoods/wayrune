import { describe, expect, it } from 'vitest';
import { inboxWhatsappCloudBanner } from './inboxWhatsappCloudBanner';

describe('inboxWhatsappCloudBanner', () => {
  it('is null when Cloud is fully configured', () => {
    expect(
      inboxWhatsappCloudBanner({
        integrations: {
          whatsapp: {
            enabled: true,
            phoneNumberId: '123',
            accessTokenConfigured: true,
          },
        },
      }),
    ).toBeNull();
  });

  it('shows off when WhatsApp is disabled', () => {
    const cue = inboxWhatsappCloudBanner({
      integrations: { whatsapp: { enabled: false } },
    });
    expect(cue?.kind).toBe('off');
    expect(cue?.tone).toBe('info');
    expect(cue?.message).toMatch(/not connected/i);
  });

  it('shows incomplete when enabled but credentials missing', () => {
    const cue = inboxWhatsappCloudBanner({
      integrations: {
        whatsapp: {
          enabled: true,
          phoneNumberId: '',
          accessToken: '',
        },
      },
    });
    expect(cue?.kind).toBe('incomplete');
    expect(cue?.tone).toBe('warn');
    expect(cue?.message).toMatch(/incomplete/i);
  });
});

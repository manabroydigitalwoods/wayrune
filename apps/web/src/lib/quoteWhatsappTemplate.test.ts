import { describe, expect, it } from 'vitest';
import {
  isWhatsappCloudConfigured,
  pickQuoteProposalTemplate,
  quoteWhatsappSendCue,
} from './quoteWhatsappTemplate';

describe('quoteWhatsappTemplate', () => {
  it('picks designated template id', () => {
    const picked = pickQuoteProposalTemplate(
      [
        { id: 'a', name: 'Welcome', metaTemplateName: 'welcome', isActive: true },
        {
          id: 'b',
          name: 'Quote proposal',
          metaTemplateName: 'quote_proposal',
          isActive: true,
        },
      ],
      { integrations: { whatsapp: { quoteProposalTemplateId: 'a' } } },
    );
    expect(picked?.id).toBe('a');
  });

  it('detects Cloud when masked token is configured', () => {
    expect(
      isWhatsappCloudConfigured({
        integrations: {
          whatsapp: {
            enabled: true,
            phoneNumberId: '123',
            accessTokenConfigured: true,
            accessToken: '••••••••',
          },
        },
      }),
    ).toBe(true);
  });

  it('warns when Cloud on but template missing', () => {
    const cue = quoteWhatsappSendCue({
      cloudConfigured: true,
      templateReady: false,
    });
    expect(cue.tone).toBe('warn');
    expect(cue.linkKind).toBe('integrations');
  });
});

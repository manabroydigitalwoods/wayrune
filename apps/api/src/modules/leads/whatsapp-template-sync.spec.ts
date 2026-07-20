import { describe, expect, it } from 'vitest';
import {
  countTemplateBodyVariables,
  mapMetaMessageTemplate,
  matchExistingWhatsAppTemplate,
} from './whatsapp-template-sync';

describe('mapMetaMessageTemplate', () => {
  it('maps APPROVED body template', () => {
    expect(
      mapMetaMessageTemplate({
        name: 'quote_proposal',
        language: 'en',
        status: 'APPROVED',
        components: [
          { type: 'BODY', text: 'Hello {{1}}, your trip {{2}} is ready.' },
        ],
      }),
    ).toEqual({
      name: 'quote_proposal (en)',
      metaTemplateName: 'quote_proposal',
      languageCode: 'en',
      bodyPreview: 'Hello {{1}}, your trip {{2}} is ready.',
      variableCount: 2,
      isActive: true,
    });
  });

  it('marks non-approved inactive', () => {
    expect(
      mapMetaMessageTemplate({
        name: 'pending_tpl',
        language: 'en_US',
        status: 'PENDING',
      })?.isActive,
    ).toBe(false);
  });

  it('skips nameless rows', () => {
    expect(mapMetaMessageTemplate({})).toBeNull();
  });
});

describe('countTemplateBodyVariables', () => {
  it('dedupes placeholders', () => {
    expect(countTemplateBodyVariables('{{1}} and {{1}} and {{2}}')).toBe(2);
  });
});

describe('matchExistingWhatsAppTemplate', () => {
  it('matches meta name + language', () => {
    expect(
      matchExistingWhatsAppTemplate(
        [
          {
            id: '1',
            metaTemplateName: 'Quote_Proposal',
            languageCode: 'EN',
          },
        ],
        'quote_proposal',
        'en',
      )?.id,
    ).toBe('1');
  });
});

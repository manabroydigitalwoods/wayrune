import { describe, expect, it } from 'vitest';
import { pickQuoteProposalTemplate } from './quote-whatsapp-template';

const rows = [
  {
    id: 'tpl-welcome',
    name: 'Welcome',
    metaTemplateName: 'welcome',
    isActive: true,
  },
  {
    id: 'tpl-quote',
    name: 'Quote proposal',
    metaTemplateName: 'quote_proposal',
    isActive: true,
  },
  {
    id: 'tpl-off',
    name: 'Quote proposal',
    metaTemplateName: 'quote_proposal_old',
    isActive: false,
  },
];

describe('pickQuoteProposalTemplate', () => {
  it('prefers quoteProposalTemplateId when active', () => {
    const picked = pickQuoteProposalTemplate(rows, {
      integrations: { whatsapp: { quoteProposalTemplateId: 'tpl-welcome' } },
    });
    expect(picked?.id).toBe('tpl-welcome');
  });

  it('falls back to Quote proposal / quote_proposal name match', () => {
    const picked = pickQuoteProposalTemplate(rows, { integrations: { whatsapp: {} } });
    expect(picked?.id).toBe('tpl-quote');
  });

  it('ignores inactive id and falls back to name match', () => {
    const picked = pickQuoteProposalTemplate(rows, {
      integrations: { whatsapp: { quoteProposalTemplateId: 'tpl-off' } },
    });
    expect(picked?.id).toBe('tpl-quote');
  });

  it('returns null when nothing matches', () => {
    expect(
      pickQuoteProposalTemplate(
        [{ id: 'x', name: 'Other', metaTemplateName: 'other', isActive: true }],
        {},
      ),
    ).toBeNull();
  });
});

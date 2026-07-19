import { describe, expect, it } from 'vitest';
import {
  normalizeTemplateName,
  orderTemplateVersionChain,
  planQuoteTemplateCreate,
  planQuoteTemplateRestore,
  isTemplateApplicable,
  templateApplyBlockedReason,
  templateNamesMatch,
  type TemplateChainRow,
} from './quote-template-version';

describe('quote-template-version', () => {
  const actives = [
    { id: 't1', name: 'Classic Goa FIT', versionNumber: 1 },
    { id: 't2', name: 'Darjeeling Heritage', versionNumber: 3 },
  ];

  it('normalizes whitespace in names', () => {
    expect(normalizeTemplateName('  Classic   Goa  ')).toBe('Classic Goa');
    expect(templateNamesMatch('Classic Goa FIT', 'classic goa fit')).toBe(true);
  });

  it('creates v1 when name is new', () => {
    const plan = planQuoteTemplateCreate({
      name: 'New Package',
      activeTemplates: actives,
    });
    expect(plan).toEqual({
      kind: 'create',
      versionNumber: 1,
      supersedesId: null,
    });
  });

  it('supersedes when name matches (case-insensitive)', () => {
    const plan = planQuoteTemplateCreate({
      name: 'classic goa fit',
      activeTemplates: actives,
    });
    expect(plan).toEqual({
      kind: 'supersede',
      versionNumber: 2,
      supersedesId: 't1',
      previousVersionNumber: 1,
      previousName: 'Classic Goa FIT',
    });
  });

  it('supersedes explicit id and bumps version', () => {
    const plan = planQuoteTemplateCreate({
      name: 'Darjeeling Heritage Revised',
      activeTemplates: actives,
      supersedeTemplateId: 't2',
    });
    expect(plan.kind).toBe('supersede');
    if (plan.kind === 'supersede') {
      expect(plan.versionNumber).toBe(4);
      expect(plan.supersedesId).toBe('t2');
    }
  });

  it('asNew ignores name collision', () => {
    const plan = planQuoteTemplateCreate({
      name: 'Classic Goa FIT',
      activeTemplates: actives,
      asNew: true,
    });
    expect(plan).toEqual({
      kind: 'create',
      versionNumber: 1,
      supersedesId: null,
    });
  });

  it('throws when supersede target missing', () => {
    expect(() =>
      planQuoteTemplateCreate({
        name: 'X',
        activeTemplates: actives,
        supersedeTemplateId: 'missing',
      }),
    ).toThrow(/not found/i);
  });
});

describe('orderTemplateVersionChain', () => {
  it('orders oldest to newest from any seed', () => {
    const rows: TemplateChainRow[] = [
      { id: 'v1', name: 'Goa', versionNumber: 1, status: 'superseded', supersedesId: null },
      { id: 'v2', name: 'Goa', versionNumber: 2, status: 'superseded', supersedesId: 'v1' },
      { id: 'v3', name: 'Goa', versionNumber: 3, status: 'active', supersedesId: 'v2' },
    ];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const childByParentId = new Map<string, TemplateChainRow>();
    for (const r of rows) {
      if (r.supersedesId) childByParentId.set(r.supersedesId, r);
    }
    expect(orderTemplateVersionChain('v2', byId, childByParentId).map((r) => r.id)).toEqual([
      'v1',
      'v2',
      'v3',
    ]);
    expect(orderTemplateVersionChain('v3', byId, childByParentId).map((r) => r.id)).toEqual([
      'v1',
      'v2',
      'v3',
    ]);
  });
});

describe('planQuoteTemplateRestore', () => {
  it('bumps past the active tip', () => {
    expect(
      planQuoteTemplateRestore({
        sourceId: 'v1',
        sourceStatus: 'superseded',
        sourceVersionNumber: 1,
        activeTip: { id: 'v3', versionNumber: 3 },
      }),
    ).toEqual({
      versionNumber: 4,
      supersedesId: 'v3',
      activeTipId: 'v3',
    });
  });

  it('rejects restoring the active tip', () => {
    expect(() =>
      planQuoteTemplateRestore({
        sourceId: 'v3',
        sourceStatus: 'active',
        sourceVersionNumber: 3,
        activeTip: { id: 'v3', versionNumber: 3 },
      }),
    ).toThrow(/already the active/i);
  });

  it('restores when family has no active tip', () => {
    expect(
      planQuoteTemplateRestore({
        sourceId: 'v2',
        sourceStatus: 'superseded',
        sourceVersionNumber: 2,
        activeTip: null,
      }),
    ).toEqual({
      versionNumber: 3,
      supersedesId: 'v2',
      activeTipId: null,
    });
  });
});

describe('templateApplyBlockedReason', () => {
  it('allows active and superseded', () => {
    expect(templateApplyBlockedReason('active')).toBeNull();
    expect(templateApplyBlockedReason('superseded')).toBeNull();
    expect(isTemplateApplicable('active')).toBe(true);
    expect(isTemplateApplicable('superseded')).toBe(true);
  });

  it('blocks draft and archived', () => {
    expect(templateApplyBlockedReason('draft')).toMatch(/cannot be applied/i);
    expect(templateApplyBlockedReason('archived')).toMatch(/cannot be applied/i);
    expect(isTemplateApplicable('draft')).toBe(false);
  });
});

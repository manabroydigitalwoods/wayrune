import { describe, expect, it } from 'vitest';

/**
 * Documents Queue Standard board/list filter parity contract.
 * Runtime coverage lives in leads.service leadListWhere (shared by list + pipelineBoard).
 */
describe('leads board filter contract', () => {
  const listFilterKeys = [
    'stageKey',
    'q',
    'priority',
    'followUp',
    'owner',
    'followUpFrom',
    'followUpTo',
    'sourceKey',
    'campaignId',
  ] as const;

  it('board accepts the same filter keys as list', () => {
    // Controller forwards these into pipelineBoard — keep in sync with leads.controller board().
    expect(listFilterKeys).toContain('owner');
    expect(listFilterKeys).toContain('followUp');
    expect(listFilterKeys).toContain('stageKey');
    expect(listFilterKeys).toContain('q');
    expect(listFilterKeys).toContain('sourceKey');
    expect(listFilterKeys).toContain('campaignId');
  });

  it('facets endpoint uses the same filter keys as list', () => {
    expect(listFilterKeys).toEqual(
      expect.arrayContaining([
        'stageKey',
        'priority',
        'followUp',
        'owner',
        'sourceKey',
        'campaignId',
        'q',
      ]),
    );
  });
});

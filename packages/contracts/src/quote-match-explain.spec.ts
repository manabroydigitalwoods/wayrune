import { describe, expect, it } from 'vitest';
import {
  isMatchAcceptedNoise,
  matchAcceptedFromMeta,
  matchAcceptedFromProvenance,
  matchRejectedCompactFromMeta,
  matchRejectedFromProvenance,
  matchSummaryFromAccepted,
  partitionMatchAcceptedForDisplay,
} from './quote-match-explain';

describe('quote-match-explain', () => {
  const meta = {
    matchExplain: {
      accepted: ['Room matched', 'Meal plan matched', 'Dates covered'],
      rejected: [
        { rateId: 'r2', label: 'Suite MAP', reason: 'room type does not match' },
        { label: 'Deluxe EP', reason: 'meal plan does not match' },
      ],
    },
  };

  it('parses accepted + compact rejected from rateMeta', () => {
    expect(matchAcceptedFromMeta(meta)).toEqual([
      'Room matched',
      'Meal plan matched',
      'Dates covered',
    ]);
    expect(matchRejectedCompactFromMeta(meta)).toEqual([
      {
        rateId: 'r2',
        label: 'Suite MAP',
        reason: 'room type does not match',
      },
      { label: 'Deluxe EP', reason: 'meal plan does not match' },
    ]);
    expect(matchSummaryFromAccepted(matchAcceptedFromMeta(meta))).toBe(
      'Room matched; Meal plan matched; Dates covered',
    );
  });

  it('reopens from array or legacy joined summary', () => {
    expect(
      matchAcceptedFromProvenance({
        matchAccepted: ['Room matched', 'MAP'],
        matchSummary: 'ignored when array present',
      }),
    ).toEqual(['Room matched', 'MAP']);
    expect(
      matchAcceptedFromProvenance({
        matchSummary: 'Room matched; MAP; Dates covered',
      }),
    ).toEqual(['Room matched', 'MAP', 'Dates covered']);
  });

  it('normalizes persisted rejected rows', () => {
    expect(
      matchRejectedFromProvenance([
        { rateId: 'x', label: 'A', reason: 'lower score' },
        { label: '', reason: '' },
      ]),
    ).toEqual([{ rateId: 'x', label: 'A', reason: 'lower score' }]);
  });

  it('classifies hygiene noise', () => {
    expect(isMatchAcceptedNoise('No blackout')).toBe(true);
    expect(isMatchAcceptedNoise('No stop-sale')).toBe(true);
    expect(isMatchAcceptedNoise('Agency rate preferred')).toBe(true);
    expect(isMatchAcceptedNoise('Dates covered')).toBe(true);
    expect(isMatchAcceptedNoise('Room matched')).toBe(false);
    expect(isMatchAcceptedNoise('Cancel · free 7d')).toBe(false);
  });

  it('ranks signal above noise and caps primary bullets', () => {
    const { primary, secondary } = partitionMatchAcceptedForDisplay([
      'No blackout',
      'Room matched',
      'Dates covered',
      'Meal plan matched',
      'No stop-sale',
      'Active contract v2',
      'Agency rate preferred',
    ]);
    expect(primary).toEqual([
      'Room matched',
      'Meal plan matched',
      'Active contract v2',
    ]);
    expect(secondary).toEqual([
      'No blackout',
      'Dates covered',
      'No stop-sale',
      'Agency rate preferred',
    ]);
  });

  it('falls back to noise when only hygiene lines exist', () => {
    const { primary, secondary } = partitionMatchAcceptedForDisplay([
      'No blackout',
      'No stop-sale',
      'Dates covered',
      'Agency rate preferred',
    ]);
    expect(primary).toEqual(['No blackout', 'No stop-sale', 'Dates covered']);
    expect(secondary).toEqual(['Agency rate preferred']);
  });
});

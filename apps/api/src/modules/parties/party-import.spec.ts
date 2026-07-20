import { describe, expect, it } from 'vitest';
import {
  firstPartyImportSkipReason,
  formatPartyImportSkipReason,
  partyImportCommitError,
} from './party-import';

describe('partyImportCommitError', () => {
  it('allows partial import', () => {
    expect(partyImportCommitError({ imported: 2, skipped: 1 })).toBeNull();
  });

  it('fail-closed when every row skips', () => {
    expect(partyImportCommitError({ imported: 0, skipped: 3 })).toMatch(
      /No clients imported/,
    );
  });

  it('fail-closed on empty effective batch', () => {
    expect(partyImportCommitError({ imported: 0, skipped: 0 })).toMatch(
      /Nothing to import/,
    );
  });
});

describe('firstPartyImportSkipReason', () => {
  it('returns first skip reason', () => {
    expect(
      firstPartyImportSkipReason([
        { status: 'created' },
        { status: 'skipped', reason: 'email_exists' },
        { status: 'skipped', reason: 'other' },
      ]),
    ).toBe('email_exists');
  });
});

describe('formatPartyImportSkipReason', () => {
  it('humanizes known codes', () => {
    expect(formatPartyImportSkipReason('email_exists')).toBe('duplicate email');
  });
});

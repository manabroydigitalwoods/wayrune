import { describe, expect, it } from 'vitest';
import {
  RELEASE_NOTES,
  formatReleaseNoteDate,
  isBuyerVisibleReleaseNote,
  visibleReleaseNotes,
} from './releaseNotes';

describe('releaseNotes', () => {
  it('hides testing and do-not-claim from buyer list', () => {
    expect(RELEASE_NOTES.some((n) => n.claimStatus === 'testing')).toBe(true);
    expect(RELEASE_NOTES.some((n) => n.claimStatus === 'do_not_claim')).toBe(true);
    const visible = visibleReleaseNotes();
    expect(visible.every(isBuyerVisibleReleaseNote)).toBe(true);
    expect(visible.some((n) => /under three minutes/i.test(n.title))).toBe(false);
    expect(visible.some((n) => /GST/i.test(n.title))).toBe(false);
    expect(visible.some((n) => /SGL|Double|Triple|adult/i.test(n.title))).toBe(true);
  });

  it('sorts newest first and respects limit', () => {
    const top = visibleReleaseNotes(RELEASE_NOTES, { limit: 2 });
    expect(top).toHaveLength(2);
    expect(top[0]!.date >= top[1]!.date).toBe(true);
  });

  it('formats dates for display', () => {
    expect(formatReleaseNoteDate('2026-07-20')).toMatch(/2026/);
    expect(formatReleaseNoteDate('bad')).toBe('bad');
  });
});

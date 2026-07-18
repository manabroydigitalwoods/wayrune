import { describe, expect, it } from 'vitest';
import {
  mergeProposalNoteLines,
  proposalNoteHasLine,
  suggestExclusionsFromServices,
  suggestInclusionsFromServices,
  toggleProposalNoteLine,
} from './quoteProposalNotes';

describe('quoteProposalNotes', () => {
  it('toggles chip lines in and out', () => {
    let text = '';
    text = toggleProposalNoteLine(text, 'Accommodation');
    expect(text).toBe('Accommodation');
    text = toggleProposalNoteLine(text, 'Breakfast');
    expect(text).toBe('Accommodation\nBreakfast');
    text = toggleProposalNoteLine(text, 'Accommodation');
    expect(text).toBe('Breakfast');
    expect(proposalNoteHasLine(text, 'Breakfast')).toBe(true);
  });

  it('suggests inclusions from service types', () => {
    const inclusions = suggestInclusionsFromServices([
      { serviceType: 'hotel' },
      { serviceType: 'transfer' },
      { serviceType: 'activity' },
    ]);
    expect(inclusions).toContain('Accommodation');
    expect(inclusions).toContain('Airport / road transfers');
    expect(inclusions).toContain('Sightseeing as per itinerary');
  });

  it('suggests exclusions when flights/visas are absent', () => {
    const exclusions = suggestExclusionsFromServices([
      { serviceType: 'hotel' },
      { serviceType: 'transfer' },
    ]);
    expect(exclusions).toContain('Flights');
    expect(exclusions).toContain('Visas');
    expect(exclusions).toContain('Personal expenses');
  });

  it('merges without duplicates', () => {
    const merged = mergeProposalNoteLines('Accommodation\nBreakfast', [
      'Accommodation',
      'Airport / road transfers',
    ]);
    expect(merged).toBe('Accommodation\nBreakfast\nAirport / road transfers');
  });
});

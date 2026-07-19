import { describe, expect, it } from 'vitest';
import {
  formatTemplateTagsCsv,
  parseTemplateTagsCsv,
  templateMatchesTagFilter,
} from './quoteTemplateTags';

describe('quoteTemplateTags', () => {
  it('parses and dedupes CSV tags', () => {
    expect(parseTemplateTagsCsv('hill, Family, hill')).toEqual(['hill', 'Family']);
    expect(parseTemplateTagsCsv('')).toEqual([]);
    expect(parseTemplateTagsCsv('a,b,c,d,e,f,g,h,i,j,k,l,m')).toHaveLength(12);
  });

  it('formats tags as CSV', () => {
    expect(formatTemplateTagsCsv(['hill', 'family'])).toBe('hill, family');
    expect(formatTemplateTagsCsv(undefined)).toBe('');
  });

  it('filters by tag substring', () => {
    expect(templateMatchesTagFilter(['hill', 'family'], '')).toBe(true);
    expect(templateMatchesTagFilter(['hill', 'family'], 'fam')).toBe(true);
    expect(templateMatchesTagFilter(['hill', 'family'], 'beach')).toBe(false);
    expect(templateMatchesTagFilter(undefined, 'hill')).toBe(false);
  });
});

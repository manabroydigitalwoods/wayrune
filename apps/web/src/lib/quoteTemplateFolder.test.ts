import { describe, expect, it } from 'vitest';
import {
  buildFolderNav,
  folderPathPrefix,
  folderPathSegments,
  normalizeTemplateFolderLabel,
  remapTemplateFolderPrefixUi,
  templateMatchesFolderFilter,
} from './quoteTemplateFolder';

describe('quoteTemplateFolder', () => {
  it('normalizes flat and slash-path folders', () => {
    expect(normalizeTemplateFolderLabel('  Hill   stations ')).toBe('Hill stations');
    expect(normalizeTemplateFolderLabel(' Hill stations / Darjeeling / ')).toBe(
      'Hill stations/Darjeeling',
    );
    expect(normalizeTemplateFolderLabel('a//b')).toBe('a/b');
    expect(normalizeTemplateFolderLabel('   ')).toBeUndefined();
    expect(normalizeTemplateFolderLabel(null)).toBeUndefined();
  });

  it('splits path segments', () => {
    expect(folderPathSegments('Hill stations/Darjeeling')).toEqual([
      'Hill stations',
      'Darjeeling',
    ]);
    expect(folderPathPrefix('Hill stations/Darjeeling', 1)).toBe('Hill stations');
    expect(folderPathPrefix('Hill stations/Darjeeling', 2)).toBe('Hill stations/Darjeeling');
    expect(folderPathPrefix('Hill stations/Darjeeling', 3)).toBeUndefined();
  });

  it('matches path prefix and typed substring', () => {
    expect(templateMatchesFolderFilter('Hill stations/Darjeeling', '')).toBe(true);
    expect(templateMatchesFolderFilter('Hill stations/Darjeeling', 'Hill stations')).toBe(
      true,
    );
    expect(
      templateMatchesFolderFilter('Hill stations/Darjeeling', 'Hill stations/Darjeeling'),
    ).toBe(true);
    expect(templateMatchesFolderFilter('Hill stations', 'Hill stations/Darjeeling')).toBe(
      false,
    );
    expect(templateMatchesFolderFilter('Beach', 'hill')).toBe(false);
    expect(templateMatchesFolderFilter('Hill stations', 'hill')).toBe(true);
    expect(templateMatchesFolderFilter(undefined, 'beach')).toBe(false);
  });

  it('builds breadcrumb nav children', () => {
    const folders = [
      'Hill stations/Darjeeling',
      'Hill stations/Gangtok',
      'Beach/Goa',
      'Beach',
    ];
    expect(buildFolderNav(folders, '')).toEqual({
      filter: '',
      breadcrumbs: [],
      children: ['Hill stations', 'Beach'],
    });
    expect(buildFolderNav(folders, 'Hill stations')).toEqual({
      filter: 'Hill stations',
      breadcrumbs: [{ label: 'Hill stations', path: 'Hill stations' }],
      children: ['Hill stations/Darjeeling', 'Hill stations/Gangtok'],
    });
    expect(buildFolderNav(folders, 'Hill stations/Darjeeling').children).toEqual([]);
  });

  it('remaps folder prefix for rename/move', () => {
    expect(
      remapTemplateFolderPrefixUi(
        'Hill stations/Darjeeling',
        'Hill stations',
        'Mountains',
      ),
    ).toBe('Mountains/Darjeeling');
    expect(
      remapTemplateFolderPrefixUi('Hill stations', 'Hill stations', ''),
    ).toBeUndefined();
  });
});

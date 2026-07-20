import { describe, expect, it } from 'vitest';
import {
  buildFolderNav,
  buildFolderTree,
  computeFolderDropRename,
  computeTemplateDropFolder,
  folderLeafLabel,
  folderPathPrefix,
  folderPathSegments,
  normalizeTemplateFolderLabel,
  remapTemplateFolderPrefixUi,
  templateMatchesFolderFilter,
  templatesExactInFolder,
  templatesUnderFolder,
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

  it('detects whether any template sits under a folder', () => {
    expect(
      templatesUnderFolder(
        ['Hill stations/Darjeeling', 'Beach/Goa'],
        'Hill stations',
      ),
    ).toBe(true);
    expect(templatesUnderFolder(['Beach/Goa'], 'Hill stations')).toBe(false);
    expect(templatesUnderFolder(['Beach'], 'Beach')).toBe(true);
  });

  it('builds nested folder tree', () => {
    const tree = buildFolderTree([
      'Hill stations/Darjeeling',
      'Hill stations/Gangtok',
      'Beach/Goa',
      'Beach',
    ]);
    expect(tree.map((n) => n.path)).toEqual(['Beach', 'Hill stations']);
    expect(tree[0].children.map((c) => c.path)).toEqual(['Beach/Goa']);
    expect(tree[1].children.map((c) => c.path)).toEqual([
      'Hill stations/Darjeeling',
      'Hill stations/Gangtok',
    ]);
    expect(folderLeafLabel('Hill stations/Darjeeling')).toBe('Darjeeling');
  });

  it('maps drop onto folder/root to rename payload', () => {
    expect(
      computeFolderDropRename({
        fromFolder: 'Hill stations/Darjeeling',
        dropOnFolder: 'Beach',
      }),
    ).toEqual({
      fromFolder: 'Hill stations/Darjeeling',
      toFolder: 'Beach/Darjeeling',
    });
    expect(
      computeFolderDropRename({
        fromFolder: 'Hill stations/Darjeeling',
        dropOnFolder: '',
      }),
    ).toEqual({
      fromFolder: 'Hill stations/Darjeeling',
      toFolder: 'Darjeeling',
    });
    expect(
      computeFolderDropRename({
        fromFolder: 'Hill stations',
        dropOnFolder: 'Hill stations/Darjeeling',
      }),
    ).toBeNull();
    expect(
      computeFolderDropRename({
        fromFolder: 'Beach/Goa',
        dropOnFolder: 'Beach',
      }),
    ).toBeNull();
  });

  it('lists templates exact-in-folder and computes drop target', () => {
    const templates = [
      { id: '1', name: 'Goa 3N', folder: 'Beach/Goa' },
      { id: '2', name: 'Root pack', folder: null },
      { id: '3', name: 'Beach shelf', folder: 'Beach' },
    ];
    expect(templatesExactInFolder(templates, 'Beach').map((t) => t.id)).toEqual([
      '3',
    ]);
    expect(templatesExactInFolder(templates, '').map((t) => t.id)).toEqual(['2']);
    expect(
      computeTemplateDropFolder({
        currentFolder: 'Beach/Goa',
        dropOnFolder: 'Hill stations',
      }),
    ).toBe('Hill stations');
    expect(
      computeTemplateDropFolder({
        currentFolder: 'Beach/Goa',
        dropOnFolder: '',
      }),
    ).toBeNull();
    expect(
      computeTemplateDropFolder({
        currentFolder: 'Beach',
        dropOnFolder: 'Beach',
      }),
    ).toBeUndefined();
  });
});

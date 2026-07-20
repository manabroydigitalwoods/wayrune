import { describe, expect, it } from 'vitest';
import {
  remapTemplateFolderPrefix,
  templateFolderMatchesPrefix,
} from './quote-template-folder-rename';

describe('quote-template-folder-rename', () => {
  it('renames exact folder and children', () => {
    expect(
      remapTemplateFolderPrefix('Hill stations', 'Hill stations', 'Mountains'),
    ).toBe('Mountains');
    expect(
      remapTemplateFolderPrefix(
        'Hill stations/Darjeeling',
        'Hill stations',
        'Mountains',
      ),
    ).toBe('Mountains/Darjeeling');
    expect(
      remapTemplateFolderPrefix('Beach/Goa', 'Hill stations', 'Mountains'),
    ).toBe('Beach/Goa');
  });

  it('clears prefix when to is empty', () => {
    expect(
      remapTemplateFolderPrefix('Hill stations/Darjeeling', 'Hill stations', ''),
    ).toBe('Darjeeling');
    expect(
      remapTemplateFolderPrefix('Hill stations', 'Hill stations', null),
    ).toBeUndefined();
  });

  it('matches prefix for bulk filter', () => {
    expect(
      templateFolderMatchesPrefix('Hill stations/Darjeeling', 'Hill stations'),
    ).toBe(true);
    expect(templateFolderMatchesPrefix('Beach/Goa', 'Hill stations')).toBe(
      false,
    );
  });
});

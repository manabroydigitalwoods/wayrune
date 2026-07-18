import { describe, expect, it } from 'vitest';
import {
  menusFromStructure,
  normalizeMenuPath,
  primaryNavFromMenus,
  resolveSiteMenus,
} from './presence-menus';

describe('presence-menus', () => {
  it('normalizes legacy href to path', () => {
    expect(normalizeMenuPath({ href: '/about' })).toBe('/about');
    expect(normalizeMenuPath({ path: '/trips' })).toBe('/trips');
  });

  it('derives menus from flat navigationJson on read', () => {
    const resolved = resolveSiteMenus({
      navigationJson: [
        { label: 'Home', path: '/' },
        { label: 'About', href: '/about' },
      ],
    });
    expect(resolved.derived).toBe(true);
    expect(resolved.menusJson.primary.items).toHaveLength(2);
    expect(resolved.menusJson.primary.items[1]?.path).toBe('/about');
    expect(resolved.menuAssignmentsJson.primary).toBe('primary');
    expect(resolved.navigationJson.map((r) => r.path)).toEqual(['/', '/about']);
  });

  it('keeps curated menu icons and drops unknown keys', () => {
    const resolved = resolveSiteMenus({
      menusJson: {
        primary: {
          id: 'primary',
          name: 'Primary',
          items: [
            { id: 'a', label: 'Home', path: '/', icon: 'home' },
            { id: 'b', label: 'Bad', path: '/x', icon: 'not-a-real-icon' },
          ],
        },
      },
      menuAssignmentsJson: { primary: 'primary', footer: 'footer' },
    });
    expect(resolved.menusJson.primary.items[0]?.icon).toBe('home');
    expect(resolved.menusJson.primary.items[1]?.icon).toBeUndefined();
  });
});

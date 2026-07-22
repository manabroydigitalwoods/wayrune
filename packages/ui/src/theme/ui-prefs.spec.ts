import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyDomUiPrefs,
  hasDeviceAppearanceCache,
  readStoredUiPrefs,
  repairCorruptAppearanceStorage,
  sanitizePrefs,
} from './ui-prefs';
import { hexToHslChannels } from './color-themes';

function mockMatchMedia(matches: boolean) {
  return vi.fn().mockImplementation(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('ui prefs', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        key: (index: number) => [...storage.keys()][index] ?? null,
        get length() {
          return storage.size;
        },
        clear: () => storage.clear(),
      },
      matchMedia: mockMatchMedia(true),
      document: {},
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      },
    });
    vi.stubGlobal('localStorage', window.localStorage);
    vi.stubGlobal('document', {
      documentElement: {
        classList: {
          toggle: vi.fn(),
          contains: vi.fn(() => false),
        },
        style: {
          setProperty: vi.fn(),
          removeProperty: vi.fn(),
        },
        dataset: {},
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads stored appearance prefs with sensible defaults', () => {
    localStorage.setItem('travel.ui.theme', 'dark');
    localStorage.setItem('travel.ui.density', 'spacious');
    localStorage.setItem('travel.ui.fontScale', 'large');
    localStorage.setItem('travel.ui.motion', 'reduce');
    localStorage.setItem('travel.ui.glass', 'solid');
    localStorage.setItem('travel.ui.colorTheme', 'ocean');
    localStorage.setItem('travel.ui.highContrast', JSON.stringify({ v: 1, data: true }));
    localStorage.setItem('travel.ui.customAccent', '#0369a1');
    localStorage.setItem(
      'travel.ui.sidebarCollapsedDefault',
      JSON.stringify({ v: 1, data: true }),
    );

    expect(readStoredUiPrefs('light')).toEqual({
      theme: 'dark',
      density: 'spacious',
      fontScale: 'large',
      motion: 'reduce',
      glass: 'solid',
      colorTheme: 'ocean',
      highContrast: true,
      customAccent: '#0369a1',
      sidebarCollapsedDefault: true,
    });
  });

  it('detects device appearance cache from stored density', () => {
    expect(hasDeviceAppearanceCache()).toBe(false);
    localStorage.setItem('travel.ui.density', 'comfortable');
    expect(hasDeviceAppearanceCache()).toBe(true);
  });

  it('keeps unset fields out of partial sanitize so merges do not wipe prefs', () => {
    expect(sanitizePrefs({ density: 'spacious' })).toEqual({ density: 'spacious' });
    expect(sanitizePrefs({ colorTheme: 'violet', highContrast: true })).toEqual({
      colorTheme: 'violet',
      highContrast: true,
    });
  });

  it('converts hex accents to hsl channels', () => {
    expect(hexToHslChannels('#0f766e')).toMatch(/^\d+ \d+% \d+%$/);
  });

  it('repairs corrupt appearance storage keys', () => {
    localStorage.setItem('travel.ui.theme', 'undefined');
    localStorage.setItem('travel.ui.density', 'spacious');
    localStorage.setItem('travel.ui.fontScale', 'nope');
    localStorage.setItem('travel.ui.motion', 'reduce');
    localStorage.setItem('travel.ui.glass', 'blurry');
    localStorage.setItem('travel.ui.colorTheme', 'neon');

    expect(repairCorruptAppearanceStorage('light')).toMatchObject({
      theme: 'light',
      density: 'spacious',
      fontScale: 'default',
      motion: 'reduce',
      glass: 'frosted',
      colorTheme: 'wayrune',
    });
  });

  it('applies root attributes for theme packs and contrast', () => {
    applyDomUiPrefs({
      theme: 'system',
      density: 'comfortable',
      fontScale: 'large',
      motion: 'system',
      glass: 'solid',
      colorTheme: 'slate',
      highContrast: true,
      customAccent: '#334155',
      sidebarCollapsedDefault: false,
    });

    expect(document.documentElement.classList.toggle).toHaveBeenCalledWith('dark', true);
    expect(document.documentElement.dataset.colorTheme).toBe('slate');
    expect(document.documentElement.dataset.contrast).toBe('high');
    expect(document.documentElement.dataset.glass).toBe('solid');
  });
});

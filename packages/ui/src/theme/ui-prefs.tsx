import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { LegacyStorageKeys, StorageKeys, localStorageKit, setCookie } from '../storage';
import { AppearanceTransitionOverlay } from './appearance-transition';
import {
  applyCustomAccentVars,
  isColorThemeId,
  type ColorThemeId,
} from './color-themes';

export type Theme = 'light' | 'dark' | 'system';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type FontScale = 'small' | 'default' | 'large' | 'xlarge';
export type MotionPreference = 'system' | 'reduce' | 'allow';
export type GlassPreference = 'frosted' | 'solid';
export type { ColorThemeId };

export type UiAppearancePrefs = {
  theme: Theme;
  density: Density;
  fontScale: FontScale;
  motion: MotionPreference;
  glass: GlassPreference;
  colorTheme: ColorThemeId;
  highContrast: boolean;
  /** Hex `#rrggbb` used when colorTheme is `custom`. */
  customAccent: string;
  sidebarCollapsedDefault: boolean;
};

export type ResolvedUiAppearancePrefs = UiAppearancePrefs & {
  resolvedTheme: 'light' | 'dark';
  resolvedMotion: 'reduce' | 'allow';
};

type UiPrefsContextValue = {
  prefs: ResolvedUiAppearancePrefs;
  appearanceTransitioning: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setDensity: (density: Density) => void;
  setFontScale: (fontScale: FontScale) => void;
  setMotion: (motion: MotionPreference) => void;
  setGlass: (glass: GlassPreference) => void;
  setColorTheme: (colorTheme: ColorThemeId) => void;
  setHighContrast: (highContrast: boolean) => void;
  setCustomAccent: (customAccent: string) => void;
  setSidebarCollapsedDefault: (collapsed: boolean) => void;
  setPrefs: (next: Partial<UiAppearancePrefs>) => void;
  hydrateFromServer: (
    next: Partial<UiAppearancePrefs> | null | undefined,
    options?: { force?: boolean },
  ) => void;
};

const ThemeContext = createContext<UiPrefsContextValue | null>(null);

const DENSITIES = new Set<Density>(['compact', 'comfortable', 'spacious']);
const FONT_SCALES = new Set<FontScale>(['small', 'default', 'large', 'xlarge']);
const MOTION_PREFS = new Set<MotionPreference>(['system', 'reduce', 'allow']);
const GLASS_PREFS = new Set<GlassPreference>(['frosted', 'solid']);

const DEFAULT_CUSTOM_ACCENT = '#0f766e';

const DEFAULT_PREFS: UiAppearancePrefs = {
  theme: 'light',
  density: 'compact',
  fontScale: 'default',
  motion: 'system',
  glass: 'frosted',
  colorTheme: 'wayrune',
  highContrast: false,
  customAccent: DEFAULT_CUSTOM_ACCENT,
  sidebarCollapsedDefault: false,
};

const VISUAL_PREF_KEYS: Array<keyof UiAppearancePrefs> = [
  'theme',
  'density',
  'fontScale',
  'motion',
  'glass',
  'colorTheme',
  'highContrast',
  'customAccent',
];

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getSystemMotion(): 'reduce' | 'allow' {
  if (typeof window === 'undefined') return 'allow';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'allow';
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? getSystemTheme() : theme;
}

function resolveMotion(motion: MotionPreference): 'reduce' | 'allow' {
  return motion === 'system' ? getSystemMotion() : motion;
}

function isHexAccent(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function waitNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function applyDomUiPrefs(prefs: UiAppearancePrefs) {
  const root = document.documentElement;
  const resolvedTheme = resolveTheme(prefs.theme);
  const resolvedMotion = resolveMotion(prefs.motion);
  root.classList.toggle('dark', resolvedTheme === 'dark');
  root.style.colorScheme = resolvedTheme;
  root.dataset.density = prefs.density;
  root.dataset.fontScale = prefs.fontScale;
  root.dataset.motion = prefs.motion;
  root.dataset.motionResolved = resolvedMotion;
  root.dataset.glass = prefs.glass;
  root.dataset.colorTheme = prefs.colorTheme;
  root.dataset.contrast = prefs.highContrast ? 'high' : 'normal';
  if (prefs.colorTheme === 'custom') {
    applyCustomAccentVars(root, prefs.customAccent);
  } else {
    applyCustomAccentVars(root, null);
  }
}

function isTheme(value: string | null | undefined): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

function isDensity(value: string | null | undefined): value is Density {
  return DENSITIES.has(value as Density);
}

function isFontScale(value: string | null | undefined): value is FontScale {
  return FONT_SCALES.has(value as FontScale);
}

function isMotionPreference(value: string | null | undefined): value is MotionPreference {
  return MOTION_PREFS.has(value as MotionPreference);
}

function isGlassPreference(value: string | null | undefined): value is GlassPreference {
  return GLASS_PREFS.has(value as GlassPreference);
}

/** Drop invalid appearance keys left by older clients, then rewrite clean prefs. */
export function repairCorruptAppearanceStorage(defaultTheme: Theme = DEFAULT_PREFS.theme): UiAppearancePrefs {
  const themeRaw = localStorageKit.getItem(StorageKeys.ui.theme);
  if (themeRaw != null && !isTheme(themeRaw)) {
    localStorageKit.removeItem(StorageKeys.ui.theme);
  }
  const densityRaw = localStorageKit.getItem(StorageKeys.ui.density);
  if (densityRaw != null && !isDensity(densityRaw)) {
    localStorageKit.removeItem(StorageKeys.ui.density);
  }
  const fontScaleRaw = localStorageKit.getItem(StorageKeys.ui.fontScale);
  if (fontScaleRaw != null && !isFontScale(fontScaleRaw)) {
    localStorageKit.removeItem(StorageKeys.ui.fontScale);
  }
  const motionRaw = localStorageKit.getItem(StorageKeys.ui.motion);
  if (motionRaw != null && !isMotionPreference(motionRaw)) {
    localStorageKit.removeItem(StorageKeys.ui.motion);
  }
  const glassRaw = localStorageKit.getItem(StorageKeys.ui.glass);
  if (glassRaw != null && !isGlassPreference(glassRaw)) {
    localStorageKit.removeItem(StorageKeys.ui.glass);
  }
  const colorThemeRaw = localStorageKit.getItem(StorageKeys.ui.colorTheme);
  if (colorThemeRaw != null && !isColorThemeId(colorThemeRaw)) {
    localStorageKit.removeItem(StorageKeys.ui.colorTheme);
  }
  const customAccentRaw = localStorageKit.getItem(StorageKeys.ui.customAccent);
  if (customAccentRaw != null && !isHexAccent(customAccentRaw)) {
    localStorageKit.removeItem(StorageKeys.ui.customAccent);
  }
  const prefs = readStoredUiPrefs(defaultTheme);
  persistPrefs(prefs);
  applyDomUiPrefs(prefs);
  return prefs;
}

function readStoredTheme(defaultTheme: Theme): Theme {
  localStorageKit.migrateFrom(LegacyStorageKeys.theme, StorageKeys.ui.theme);
  const stored = localStorageKit.getItem(StorageKeys.ui.theme);
  return isTheme(stored) ? stored : defaultTheme;
}

function readStoredDensity(defaultDensity: Density): Density {
  const stored = localStorageKit.getItem(StorageKeys.ui.density);
  return isDensity(stored) ? stored : defaultDensity;
}

function readStoredFontScale(defaultFontScale: FontScale): FontScale {
  const stored = localStorageKit.getItem(StorageKeys.ui.fontScale);
  return isFontScale(stored) ? stored : defaultFontScale;
}

function readStoredMotion(defaultMotion: MotionPreference): MotionPreference {
  const stored = localStorageKit.getItem(StorageKeys.ui.motion);
  return isMotionPreference(stored) ? stored : defaultMotion;
}

function readStoredGlass(defaultGlass: GlassPreference): GlassPreference {
  const stored = localStorageKit.getItem(StorageKeys.ui.glass);
  return isGlassPreference(stored) ? stored : defaultGlass;
}

function readStoredColorTheme(defaultValue: ColorThemeId): ColorThemeId {
  const stored = localStorageKit.getItem(StorageKeys.ui.colorTheme);
  return isColorThemeId(stored) ? stored : defaultValue;
}

function readStoredHighContrast(defaultValue: boolean): boolean {
  const stored = localStorageKit.getJson<boolean>(StorageKeys.ui.highContrast, { version: 1 });
  return stored ?? defaultValue;
}

function readStoredCustomAccent(defaultValue: string): string {
  const stored = localStorageKit.getItem(StorageKeys.ui.customAccent);
  return isHexAccent(stored) ? stored : defaultValue;
}

function readStoredSidebarCollapsedDefault(defaultValue: boolean): boolean {
  const stored = localStorageKit.getJson<boolean>(StorageKeys.ui.sidebarCollapsedDefault, { version: 1 });
  return stored ?? defaultValue;
}

function persistTheme(theme: Theme) {
  localStorageKit.setItem(StorageKeys.ui.theme, theme);
  setCookie(StorageKeys.ui.themeCookie, theme, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
}

function persistPrefs(prefs: UiAppearancePrefs) {
  persistTheme(prefs.theme);
  localStorageKit.setItem(StorageKeys.ui.density, prefs.density);
  localStorageKit.setItem(StorageKeys.ui.fontScale, prefs.fontScale);
  localStorageKit.setItem(StorageKeys.ui.motion, prefs.motion);
  localStorageKit.setItem(StorageKeys.ui.glass, prefs.glass);
  localStorageKit.setItem(StorageKeys.ui.colorTheme, prefs.colorTheme);
  localStorageKit.setJson(StorageKeys.ui.highContrast, prefs.highContrast, { version: 1 });
  localStorageKit.setItem(StorageKeys.ui.customAccent, prefs.customAccent);
  localStorageKit.setJson(StorageKeys.ui.sidebarCollapsedDefault, prefs.sidebarCollapsedDefault, {
    version: 1,
  });
  localStorageKit.setItem(StorageKeys.ui.appearanceInitialized, '1');
}

/** True when this device already has saved appearance prefs (used when server appearance is empty). */
export function hasDeviceAppearanceCache(): boolean {
  if (localStorageKit.getItem(StorageKeys.ui.appearanceInitialized) === '1') return true;
  return (
    localStorageKit.getItem(StorageKeys.ui.theme) != null ||
    localStorageKit.getItem(StorageKeys.ui.density) != null ||
    localStorageKit.getItem(StorageKeys.ui.fontScale) != null ||
    localStorageKit.getItem(StorageKeys.ui.motion) != null ||
    localStorageKit.getItem(StorageKeys.ui.glass) != null ||
    localStorageKit.getItem(StorageKeys.ui.colorTheme) != null ||
    localStorageKit.getJson<boolean>(StorageKeys.ui.highContrast, { version: 1 }) != null ||
    localStorageKit.getItem(StorageKeys.ui.customAccent) != null ||
    localStorageKit.getJson<boolean>(StorageKeys.ui.sidebarCollapsedDefault, { version: 1 }) != null
  );
}

export function readStoredUiPrefs(defaultTheme: Theme): UiAppearancePrefs {
  return {
    theme: readStoredTheme(defaultTheme),
    density: readStoredDensity(DEFAULT_PREFS.density),
    fontScale: readStoredFontScale(DEFAULT_PREFS.fontScale),
    motion: readStoredMotion(DEFAULT_PREFS.motion),
    glass: readStoredGlass(DEFAULT_PREFS.glass),
    colorTheme: readStoredColorTheme(DEFAULT_PREFS.colorTheme),
    highContrast: readStoredHighContrast(DEFAULT_PREFS.highContrast),
    customAccent: readStoredCustomAccent(DEFAULT_PREFS.customAccent),
    sidebarCollapsedDefault: readStoredSidebarCollapsedDefault(DEFAULT_PREFS.sidebarCollapsedDefault),
  };
}

export function sanitizePrefs(input: Partial<UiAppearancePrefs> | null | undefined): Partial<UiAppearancePrefs> {
  if (!input) return {};
  const next: Partial<UiAppearancePrefs> = {};
  if (input.theme === 'light' || input.theme === 'dark' || input.theme === 'system') {
    next.theme = input.theme;
  }
  if (DENSITIES.has(input.density as Density)) {
    next.density = input.density as Density;
  }
  if (FONT_SCALES.has(input.fontScale as FontScale)) {
    next.fontScale = input.fontScale as FontScale;
  }
  if (MOTION_PREFS.has(input.motion as MotionPreference)) {
    next.motion = input.motion as MotionPreference;
  }
  if (GLASS_PREFS.has(input.glass as GlassPreference)) {
    next.glass = input.glass as GlassPreference;
  }
  if (isColorThemeId(input.colorTheme)) {
    next.colorTheme = input.colorTheme;
  }
  if (typeof input.highContrast === 'boolean') {
    next.highContrast = input.highContrast;
  }
  if (isHexAccent(input.customAccent)) {
    next.customAccent = input.customAccent;
  }
  if (typeof input.sidebarCollapsedDefault === 'boolean') {
    next.sidebarCollapsedDefault = input.sidebarCollapsedDefault;
  }
  return next;
}

function patchNeedsTransition(patch: Partial<UiAppearancePrefs>): boolean {
  return VISUAL_PREF_KEYS.some((key) => Object.prototype.hasOwnProperty.call(patch, key));
}

export function UiPrefsProvider({
  children,
  defaultTheme = 'system',
}: {
  children: ReactNode;
  defaultTheme?: Theme;
}) {
  const [prefsState, setPrefsState] = useState<UiAppearancePrefs>(() => {
    if (typeof window === 'undefined') {
      return { ...DEFAULT_PREFS, theme: defaultTheme };
    }
    return repairCorruptAppearanceStorage(defaultTheme);
  });
  const [appearanceTransitioning, setAppearanceTransitioning] = useState(false);
  const prefsRef = useRef(prefsState);
  const transitionGenRef = useRef(0);

  useEffect(() => {
    prefsRef.current = prefsState;
    applyDomUiPrefs(prefsState);
  }, [prefsState]);

  useEffect(() => {
    const themeMq = window.matchMedia('(prefers-color-scheme: dark)');
    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onThemeChange = () => {
      if (prefsRef.current.theme !== 'system') return;
      applyDomUiPrefs(prefsRef.current);
    };
    const onMotionChange = () => {
      if (prefsRef.current.motion !== 'system') return;
      applyDomUiPrefs(prefsRef.current);
    };
    themeMq.addEventListener('change', onThemeChange);
    motionMq.addEventListener('change', onMotionChange);
    return () => {
      themeMq.removeEventListener('change', onThemeChange);
      motionMq.removeEventListener('change', onMotionChange);
    };
  }, []);

  const commitPrefs = useCallback((updater: (prev: UiAppearancePrefs) => UiAppearancePrefs) => {
    setPrefsState((prev) => {
      const next = updater(prev);
      persistPrefs(next);
      return next;
    });
  }, []);

  const runWithAppearanceTransition = useCallback(
    (updater: (prev: UiAppearancePrefs) => UiAppearancePrefs) => {
      const gen = ++transitionGenRef.current;
      setAppearanceTransitioning(true);
      void (async () => {
        await waitNextPaint();
        if (gen !== transitionGenRef.current) return;
        commitPrefs(updater);
        await waitNextPaint();
        await waitMs(260);
        if (gen !== transitionGenRef.current) return;
        setAppearanceTransitioning(false);
      })();
    },
    [commitPrefs],
  );

  const setPrefs = useCallback(
    (next: Partial<UiAppearancePrefs>) => {
      const sanitized = sanitizePrefs(next);
      if (Object.keys(sanitized).length === 0) return;
      const apply = (prev: UiAppearancePrefs) => ({ ...prev, ...sanitized });
      if (patchNeedsTransition(sanitized)) {
        runWithAppearanceTransition(apply);
      } else {
        commitPrefs(apply);
      }
    },
    [commitPrefs, runWithAppearanceTransition],
  );

  const hydrateFromServer = useCallback(
    (next: Partial<UiAppearancePrefs> | null | undefined, options?: { force?: boolean }) => {
      if (!options?.force && hasDeviceAppearanceCache()) return;
      const sanitized = sanitizePrefs(next);
      if (Object.keys(sanitized).length === 0) return;
      commitPrefs((prev) => ({ ...prev, ...sanitized }));
    },
    [commitPrefs],
  );

  const setTheme = useCallback((theme: Theme) => setPrefs({ theme }), [setPrefs]);
  const toggleTheme = useCallback(() => {
    const resolved = resolveTheme(prefsRef.current.theme);
    setTheme(resolved === 'dark' ? 'light' : 'dark');
  }, [setTheme]);
  const setDensity = useCallback((density: Density) => setPrefs({ density }), [setPrefs]);
  const setFontScale = useCallback((fontScale: FontScale) => setPrefs({ fontScale }), [setPrefs]);
  const setMotion = useCallback((motion: MotionPreference) => setPrefs({ motion }), [setPrefs]);
  const setGlass = useCallback((glass: GlassPreference) => setPrefs({ glass }), [setPrefs]);
  const setColorTheme = useCallback((colorTheme: ColorThemeId) => setPrefs({ colorTheme }), [setPrefs]);
  const setHighContrast = useCallback(
    (highContrast: boolean) => setPrefs({ highContrast }),
    [setPrefs],
  );
  const setCustomAccent = useCallback(
    (customAccent: string) => setPrefs({ customAccent, colorTheme: 'custom' }),
    [setPrefs],
  );
  const setSidebarCollapsedDefault = useCallback(
    (sidebarCollapsedDefault: boolean) => setPrefs({ sidebarCollapsedDefault }),
    [setPrefs],
  );

  const resolvedPrefs = useMemo<ResolvedUiAppearancePrefs>(
    () => ({
      ...prefsState,
      resolvedTheme: resolveTheme(prefsState.theme),
      resolvedMotion: resolveMotion(prefsState.motion),
    }),
    [prefsState],
  );

  const value = useMemo<UiPrefsContextValue>(
    () => ({
      prefs: resolvedPrefs,
      appearanceTransitioning,
      setTheme,
      toggleTheme,
      setDensity,
      setFontScale,
      setMotion,
      setGlass,
      setColorTheme,
      setHighContrast,
      setCustomAccent,
      setSidebarCollapsedDefault,
      setPrefs,
      hydrateFromServer,
    }),
    [
      resolvedPrefs,
      appearanceTransitioning,
      setTheme,
      toggleTheme,
      setDensity,
      setFontScale,
      setMotion,
      setGlass,
      setColorTheme,
      setHighContrast,
      setCustomAccent,
      setSidebarCollapsedDefault,
      setPrefs,
      hydrateFromServer,
    ],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
      <AppearanceTransitionOverlay active={appearanceTransitioning} />
    </ThemeContext.Provider>
  );
}

export const ThemeProvider = UiPrefsProvider;

export function useUiPrefs() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useUiPrefs must be used within UiPrefsProvider');
  return ctx;
}

export function useTheme() {
  const { prefs, setTheme, toggleTheme } = useUiPrefs();
  return {
    theme: prefs.theme,
    resolved: prefs.resolvedTheme,
    setTheme,
    toggle: toggleTheme,
  };
}

export function useDensity() {
  const { prefs, setDensity } = useUiPrefs();
  return {
    density: prefs.density,
    setDensity,
  };
}

export function useFontScale() {
  const { prefs, setFontScale } = useUiPrefs();
  return {
    fontScale: prefs.fontScale,
    setFontScale,
  };
}

export function useMotionPreference() {
  const { prefs, setMotion } = useUiPrefs();
  return {
    motion: prefs.motion,
    resolvedMotion: prefs.resolvedMotion,
    setMotion,
  };
}

export function useGlassPreference() {
  const { prefs, setGlass } = useUiPrefs();
  return {
    glass: prefs.glass,
    setGlass,
  };
}

export function useColorTheme() {
  const { prefs, setColorTheme, setCustomAccent, setHighContrast } = useUiPrefs();
  return {
    colorTheme: prefs.colorTheme,
    customAccent: prefs.customAccent,
    highContrast: prefs.highContrast,
    setColorTheme,
    setCustomAccent,
    setHighContrast,
  };
}

export {
  COLOR_THEME_OPTIONS,
  hexToHslChannels,
  isColorThemeId,
  type ColorThemeMeta,
} from './color-themes';

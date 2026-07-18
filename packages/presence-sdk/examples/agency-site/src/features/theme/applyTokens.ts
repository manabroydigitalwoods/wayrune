import type { ThemeTokens } from '@/lib/site';

const TOKEN_TO_CSS: Record<string, string> = {
  primary: '--presence-primary',
  accent: '--presence-accent',
  background: '--presence-bg',
  foreground: '--presence-fg',
  muted: '--presence-muted',
  surface: '--presence-surface',
  radius: '--presence-radius',
  fontDisplay: '--presence-font-display',
  fontBody: '--presence-font-body',
};

/** Apply site tokens as CSS variables on an element (usually documentElement). */
export function applyThemeTokens(el: HTMLElement, tokens: ThemeTokens): void {
  for (const [key, cssVar] of Object.entries(TOKEN_TO_CSS)) {
    const value = tokens[key];
    if (typeof value === 'string' && value) el.style.setProperty(cssVar, value);
  }
}

import structureJson from '@site/structure.json';
import tokensJson from '@site/tokens.json';
import themeJson from '@site/theme.json';
import type { SitePage, SiteStructure, ThemeTokens } from './types';

export const siteStructure = structureJson as SiteStructure;
export const siteTokens = tokensJson as ThemeTokens;
export const siteThemeMeta = themeJson as {
  key: string;
  name: string;
  version: string;
  description?: string;
};

export function getPageByPath(path: string): SitePage | undefined {
  return siteStructure.pages.find((p) => p.path === path);
}

export function getPageOrFallback(path: string): SitePage {
  return getPageByPath(path) ?? siteStructure.pages[0]!;
}

export function listPagePaths(): string[] {
  return siteStructure.pages.map((p) => p.path);
}

import { useEffect } from 'react';
import { siteTokens } from '@/lib/site';
import { applyThemeTokens } from './applyTokens';

export function useThemeTokens(): typeof siteTokens {
  useEffect(() => {
    applyThemeTokens(document.documentElement, siteTokens);
  }, []);
  return siteTokens;
}

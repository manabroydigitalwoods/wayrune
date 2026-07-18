import type { ReactNode } from 'react';
import { NavigationProvider } from '@/features/navigation';
import { useThemeTokens } from '@/features/theme';

function ThemeBoot({ children }: { children: ReactNode }) {
  useThemeTokens();
  return children;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <NavigationProvider>
      <ThemeBoot>{children}</ThemeBoot>
    </NavigationProvider>
  );
}

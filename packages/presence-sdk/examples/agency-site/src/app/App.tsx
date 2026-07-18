import { useEffect } from 'react';
import { SiteShell } from '@/components/layout';
import { useNavigation } from '@/features/navigation';
import { siteThemeMeta } from '@/lib/site';
import { appRoutes, NotFoundPage } from '@/pages';
import { AppProviders } from './providers';

function RouterOutlet() {
  const { path } = useNavigation();
  const Page = appRoutes[path] ?? NotFoundPage;

  useEffect(() => {
    document.title = `${siteThemeMeta.name} · preview`;
  }, []);

  return (
    <SiteShell>
      <Page />
    </SiteShell>
  );
}

export function App() {
  return (
    <AppProviders>
      <RouterOutlet />
    </AppProviders>
  );
}

import type { ReactNode } from 'react';
import { MobileNav } from '@/features/navigation';
import { PreviewBanner } from './PreviewBanner';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="presence-site">
      <PreviewBanner />
      <SiteHeader />
      <MobileNav />
      <main className="presence-main">{children}</main>
      <SiteFooter />
    </div>
  );
}

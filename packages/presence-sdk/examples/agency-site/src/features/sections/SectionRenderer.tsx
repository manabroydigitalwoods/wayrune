import type { SiteSection } from '@/lib/site';
import { sectionRegistry } from './registry';
import { sectionType } from './types';

export function SectionRenderer({ section }: { section: SiteSection }) {
  const type = sectionType(section);
  const Component = sectionRegistry[type];
  if (!Component) {
    return (
      <section className="presence-section rounded-[var(--presence-radius)] border border-dashed border-black/20 bg-white/60 p-4 text-sm text-[var(--presence-muted)]">
        Preview stub for <code>{type}</code> — register it in{' '}
        <code>features/sections/registry.ts</code>.
      </section>
    );
  }
  return <Component section={section} />;
}

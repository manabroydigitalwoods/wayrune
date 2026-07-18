import type { SitePage } from '@/lib/site';
import { SectionRenderer } from '@/features/sections';

export function StructurePage({ page }: { page: SitePage }) {
  return (
    <>
      <p className="m-0 text-sm text-[var(--presence-muted)]">
        Previewing <strong className="text-[var(--presence-fg)]">{page.title}</strong> ({page.path})
      </p>
      {(page.sections || []).map((section, i) => (
        <SectionRenderer key={`${page.path}-${i}`} section={section} />
      ))}
    </>
  );
}

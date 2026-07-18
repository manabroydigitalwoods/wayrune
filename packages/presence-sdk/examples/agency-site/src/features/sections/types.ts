import type { SiteSection } from '@/lib/site';

export type SectionProps = {
  section: SiteSection;
};

export function sectionType(section: SiteSection): string {
  return section.moduleKey || section.type;
}

export function sectionProps(section: SiteSection): Record<string, unknown> {
  return section.propsJson || {};
}

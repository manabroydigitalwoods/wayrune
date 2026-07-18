import { ButtonLink } from '@/components/ui';
import { str } from '@/lib/utils';
import type { SectionProps } from '../types';
import { sectionProps } from '../types';

/** Local preview of the package component `trip-highlight`. */
export function TripHighlightSection({ section }: SectionProps) {
  const p = sectionProps(section);
  return (
    <section
      className="presence-section rounded-[var(--presence-radius)] p-6 text-[#f7f4ef]"
      style={{
        background: 'linear-gradient(135deg, var(--presence-primary), #163a38)',
      }}
    >
      {str(p.eyebrow) ? (
        <p className="m-0 text-xs uppercase tracking-wide opacity-85">{str(p.eyebrow)}</p>
      ) : null}
      <h2 className="mt-1 font-display text-2xl font-semibold">{str(p.title)}</h2>
      {str(p.body) ? <p className="mt-2 opacity-90">{str(p.body)}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {str(p.price) ? <strong>{str(p.price)}</strong> : null}
        {str(p.ctaLabel) ? (
          <ButtonLink href={str(p.ctaHref, '#')}>{str(p.ctaLabel)}</ButtonLink>
        ) : null}
      </div>
    </section>
  );
}

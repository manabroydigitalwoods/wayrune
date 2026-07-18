import { ButtonLink, Eyebrow } from '@/components/ui';
import { items, str } from '@/lib/utils';
import type { SectionProps } from '../types';
import { sectionProps } from '../types';

export function HeroSection({ section }: SectionProps) {
  const p = sectionProps(section);
  return (
    <section className="presence-hero presence-section">
      {str(p.eyebrow) ? <Eyebrow className="!text-white/80">{str(p.eyebrow)}</Eyebrow> : null}
      <h1>{str(p.headline, 'Headline')}</h1>
      {str(p.subhead) ? <p className="mt-4 max-w-xl text-white/85">{str(p.subhead)}</p> : null}
      <div className="mt-6 flex flex-wrap gap-3">
        {str(p.ctaLabel) ? (
          <ButtonLink href={str(p.ctaHref, '#')}>{str(p.ctaLabel)}</ButtonLink>
        ) : null}
        {str(p.secondaryCtaLabel) ? (
          <ButtonLink href={str(p.secondaryCtaHref, '#')} variant="ghost">
            {str(p.secondaryCtaLabel)}
          </ButtonLink>
        ) : null}
      </div>
    </section>
  );
}

export function OfferBannerSection({ section }: SectionProps) {
  const p = sectionProps(section);
  return (
    <section className="presence-section flex flex-col gap-4 overflow-hidden bg-white shadow-sm sm:flex-row">
      {str(p.imageUrl) ? (
        <img src={str(p.imageUrl)} alt="" className="h-40 w-full object-cover sm:h-auto sm:w-48" />
      ) : null}
      <div className="p-5">
        {str(p.eyebrow) ? <Eyebrow>{str(p.eyebrow)}</Eyebrow> : null}
        <h2 className="m-0 font-display text-xl font-semibold">{str(p.title)}</h2>
        {str(p.body) ? <p className="mt-2 text-[var(--presence-muted)]">{str(p.body)}</p> : null}
        {str(p.ctaLabel) ? (
          <ButtonLink href={str(p.ctaHref, '#')} className="mt-3">
            {str(p.ctaLabel)}
          </ButtonLink>
        ) : null}
      </div>
    </section>
  );
}

export function StatsSection({ section }: SectionProps) {
  const p = sectionProps(section);
  return (
    <section className="presence-section">
      {str(p.eyebrow) ? <Eyebrow>{str(p.eyebrow)}</Eyebrow> : null}
      <div className="presence-stats">
        {items(p.items).map((item, i) => (
          <div key={i} className="presence-stat">
            <strong>{str(item.value)}</strong>
            <span className="text-sm text-[var(--presence-muted)]">{str(item.label)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function TestimonialsSection({ section }: SectionProps) {
  const p = sectionProps(section);
  return (
    <section className="presence-section">
      {str(p.eyebrow) ? <Eyebrow>{str(p.eyebrow)}</Eyebrow> : null}
      {str(p.title) ? (
        <h2 className="mb-4 mt-0 font-display text-2xl font-semibold">{str(p.title)}</h2>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {items(p.items).map((item, i) => (
          <blockquote key={i} className="m-0 rounded-[var(--presence-radius)] bg-white p-5 shadow-sm">
            <p className="m-0 text-[var(--presence-fg)]">“{str(item.quote)}”</p>
            <footer className="mt-3 text-sm text-[var(--presence-muted)]">{str(item.author)}</footer>
          </blockquote>
        ))}
      </div>
    </section>
  );
}

export function CtaSection({ section }: SectionProps) {
  const p = sectionProps(section);
  return (
    <section className="presence-cta-band presence-section">
      {str(p.eyebrow) ? <Eyebrow className="!text-white/80">{str(p.eyebrow)}</Eyebrow> : null}
      <h2 className="m-0 font-display text-2xl font-semibold">{str(p.title)}</h2>
      {str(p.body) ? <p className="mx-auto mt-2 max-w-xl text-white/85">{str(p.body)}</p> : null}
      {str(p.label) ? (
        <ButtonLink href={str(p.href, '#')} className="mt-4">
          {str(p.label)}
        </ButtonLink>
      ) : null}
    </section>
  );
}

import { ButtonLink, Eyebrow } from '@/components/ui';
import { items, str } from '@/lib/utils';
import type { SectionProps } from '../types';
import { sectionProps, sectionType } from '../types';

export function SectionHeadingSection({ section }: SectionProps) {
  const p = sectionProps(section);
  return (
    <section className="presence-section">
      {str(p.eyebrow) ? <Eyebrow>{str(p.eyebrow)}</Eyebrow> : null}
      <h1 className="m-0 font-display text-3xl font-semibold">{str(p.title)}</h1>
      {str(p.subhead) ? (
        <p className="mt-2 max-w-2xl text-[var(--presence-muted)]">{str(p.subhead)}</p>
      ) : null}
    </section>
  );
}

export function ItineraryTimelineSection({ section }: SectionProps) {
  const p = sectionProps(section);
  return (
    <section className="presence-section">
      {str(p.eyebrow) ? <Eyebrow>{str(p.eyebrow)}</Eyebrow> : null}
      {str(p.title) ? (
        <h2 className="mb-4 mt-0 font-display text-2xl font-semibold">{str(p.title)}</h2>
      ) : null}
      <ol className="m-0 list-none space-y-3 p-0">
        {items(p.items).map((item, i) => (
          <li key={i} className="rounded-[var(--presence-radius)] bg-white p-4 shadow-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--presence-accent)]">
              {str(item.day)}
            </span>
            <h3 className="m-0 mt-1 text-base font-semibold">{str(item.title)}</h3>
            <p className="m-0 mt-1 text-sm text-[var(--presence-muted)]">{str(item.body)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SplitContentSection({ section }: SectionProps) {
  const p = sectionProps(section);
  return (
    <section className="presence-section grid items-center gap-6 md:grid-cols-2">
      <div>
        {str(p.eyebrow) ? <Eyebrow>{str(p.eyebrow)}</Eyebrow> : null}
        <h2 className="m-0 font-display text-2xl font-semibold">{str(p.title)}</h2>
        {str(p.body) ? <p className="mt-2 text-[var(--presence-muted)]">{str(p.body)}</p> : null}
        {str(p.ctaLabel) ? (
          <ButtonLink href={str(p.ctaHref, '#')} className="mt-4">
            {str(p.ctaLabel)}
          </ButtonLink>
        ) : null}
      </div>
      {str(p.imageUrl) ? (
        <img
          src={str(p.imageUrl)}
          alt={str(p.imageAlt)}
          className="rounded-[var(--presence-radius)] object-cover"
        />
      ) : null}
    </section>
  );
}

export function TeamProfilesSection({ section }: SectionProps) {
  const p = sectionProps(section);
  return (
    <section className="presence-section">
      {str(p.eyebrow) ? <Eyebrow>{str(p.eyebrow)}</Eyebrow> : null}
      {str(p.title) ? (
        <h2 className="mb-4 mt-0 font-display text-2xl font-semibold">{str(p.title)}</h2>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {items(p.items).map((item, i) => (
          <div key={i} className="flex gap-4 rounded-[var(--presence-radius)] bg-white p-4 shadow-sm">
            {str(item.photo) ? (
              <img src={str(item.photo)} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : null}
            <div>
              <h3 className="m-0 text-base font-semibold">{str(item.name)}</h3>
              <p className="m-0 text-sm text-[var(--presence-accent)]">{str(item.role)}</p>
              <p className="m-0 mt-1 text-sm text-[var(--presence-muted)]">{str(item.bio)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FaqSection({ section }: SectionProps) {
  const p = sectionProps(section);
  return (
    <section className="presence-section">
      {str(p.eyebrow) ? <Eyebrow>{str(p.eyebrow)}</Eyebrow> : null}
      {str(p.title) ? (
        <h2 className="mb-4 mt-0 font-display text-2xl font-semibold">{str(p.title)}</h2>
      ) : null}
      <div className="space-y-3">
        {items(p.items).map((item, i) => (
          <details key={i} className="rounded-[var(--presence-radius)] bg-white p-4 shadow-sm">
            <summary className="cursor-pointer font-semibold">{str(item.q)}</summary>
            <p className="mt-2 text-sm text-[var(--presence-muted)]">{str(item.a)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function TextBlockSection({ section }: SectionProps) {
  const p = sectionProps(section);
  const type = sectionType(section);
  return (
    <section className="presence-section rounded-[var(--presence-radius)] bg-white p-6 shadow-sm">
      {str(p.eyebrow) ? <Eyebrow>{str(p.eyebrow)}</Eyebrow> : null}
      {str(p.title) ? (
        <h2 className="m-0 font-display text-2xl font-semibold">{str(p.title)}</h2>
      ) : null}
      {str(p.body) ? (
        <p className="mt-2 whitespace-pre-line text-[var(--presence-muted)]">{str(p.body)}</p>
      ) : null}
      {type === 'trip_inquiry' ? (
        <p className="mt-4 text-sm italic text-[var(--presence-muted)]">
          Form renders on the live site ({str(p.formKey, 'enquiry')}).
        </p>
      ) : null}
    </section>
  );
}

import { Eyebrow } from '@/components/ui';
import { items, str } from '@/lib/utils';
import type { SectionProps } from '../types';
import { sectionProps } from '../types';

export function CardGridSection({ section }: SectionProps) {
  const p = sectionProps(section);
  return (
    <section className="presence-section">
      {str(p.eyebrow) ? <Eyebrow>{str(p.eyebrow)}</Eyebrow> : null}
      {str(p.title) ? (
        <h2 className="mb-4 mt-0 font-display text-2xl font-semibold">{str(p.title)}</h2>
      ) : null}
      <div className="presence-grid">
        {items(p.items).map((item, i) => (
          <a
            key={i}
            href={str(item.href || item.ctaHref, '#')}
            className="presence-card no-underline"
          >
            {str(item.image) ? <img src={str(item.image)} alt="" /> : null}
            <div className="presence-card-body">
              <h3 className="m-0 text-base font-semibold text-[var(--presence-fg)]">
                {str(item.name)}
              </h3>
              <p className="mt-1 text-sm text-[var(--presence-muted)]">
                {str(item.tagline || item.price)}
              </p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

export function GallerySection({ section }: SectionProps) {
  const p = sectionProps(section);
  return (
    <section className="presence-section">
      {str(p.eyebrow) ? <Eyebrow>{str(p.eyebrow)}</Eyebrow> : null}
      {str(p.title) ? (
        <h2 className="mb-4 mt-0 font-display text-2xl font-semibold">{str(p.title)}</h2>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items(p.images).map((img, i) => (
          <img
            key={i}
            src={str(img.url)}
            alt={str(img.alt)}
            className="aspect-square rounded-[var(--presence-radius)] object-cover"
          />
        ))}
      </div>
    </section>
  );
}

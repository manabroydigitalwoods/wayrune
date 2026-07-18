/**
 * Canvas React renderers for modules that otherwise ship as HTML dumps.
 * When selected + canWrite, text is InlineEditable and syncs to the inspector.
 */
import type { ReactNode } from 'react';
import { InlineEditable } from './InlineEditable';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function Eyebrow({
  value,
  canEdit,
  onChange,
}: {
  value: string;
  canEdit: boolean;
  onChange: (next: string) => void;
}) {
  if (!value && !canEdit) return null;
  return (
    <InlineEditable
      as="div"
      className="eyebrow"
      value={value}
      enabled={canEdit}
      placeholder="Eyebrow"
      onChange={onChange}
    />
  );
}

function SectionHead({
  props,
  canEdit,
  onPropChange,
  titleFallback = '',
  titleAs = 'h2',
}: {
  props: Record<string, unknown>;
  canEdit: boolean;
  onPropChange: (key: string, value: unknown) => void;
  titleFallback?: string;
  titleAs?: 'h1' | 'h2';
}) {
  const title = str(props.title, titleFallback);
  const body = str(props.body || props.subhead);
  return (
    <div className="section-head">
      <Eyebrow
        value={str(props.eyebrow)}
        canEdit={canEdit}
        onChange={(next) => onPropChange('eyebrow', next)}
      />
      {canEdit || title ? (
        <InlineEditable
          as={titleAs}
          className="section-title"
          value={title}
          enabled={canEdit}
          placeholder={titleFallback || 'Title'}
          onChange={(next) => onPropChange('title', next)}
        />
      ) : null}
      {canEdit || body ? (
        <InlineEditable
          as="p"
          className="section-lead"
          value={body}
          enabled={canEdit}
          multiline
          placeholder="Supporting text"
          onChange={(next) => {
            if ('subhead' in props && !('body' in props)) onPropChange('subhead', next);
            else onPropChange('body', next);
          }}
        />
      ) : null}
    </div>
  );
}

function patchItems(
  items: unknown[],
  index: number,
  field: string,
  next: string,
  onPropChange: (key: string, value: unknown) => void,
) {
  onPropChange(
    'items',
    items.map((item, i) => {
      const row = asRecord(item);
      if (i !== index) return row;
      return { ...row, [field]: next };
    }),
  );
}

export function renderLiveEditableExtra(opts: {
  renderType: string;
  props: Record<string, unknown>;
  canEdit: boolean;
  onPropChange: (key: string, value: unknown) => void;
}): ReactNode | null {
  const { renderType, props, canEdit, onPropChange } = opts;
  const items = Array.isArray(props.items) ? props.items : [];

  if (renderType === 'feature_grid') {
    const cols = ['2', '3', '4'].includes(str(props.columns)) ? str(props.columns) : '3';
    return (
      <section>
        <SectionHead props={props} canEdit={canEdit} onPropChange={onPropChange} />
        <div className="feature-grid" style={{ ['--feature-cols' as string]: cols }}>
          {items.map((item, index) => {
            const row = asRecord(item);
            return (
              <article key={index} className="feature-card">
                <InlineEditable
                  as="div"
                  className="feature-icon"
                  value={str(row.icon, '✦')}
                  enabled={canEdit}
                  placeholder="Icon"
                  onChange={(next) => patchItems(items, index, 'icon', next, onPropChange)}
                />
                <InlineEditable
                  as="h3"
                  value={str(row.title, 'Title')}
                  enabled={canEdit}
                  placeholder="Title"
                  onChange={(next) => patchItems(items, index, 'title', next, onPropChange)}
                />
                <InlineEditable
                  as="p"
                  value={str(row.body)}
                  enabled={canEdit}
                  multiline
                  placeholder="Description"
                  onChange={(next) => patchItems(items, index, 'body', next, onPropChange)}
                />
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  if (renderType === 'newsletter') {
    return (
      <section className="newsletter-band">
        <div>
          <SectionHead props={props} canEdit={canEdit} onPropChange={onPropChange} />
        </div>
        <form
          className="newsletter-preview-form"
          style={{
            ['--newsletter-field-gap' as string]: str(props.fieldGap, '0.75rem'),
          }}
          onSubmit={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
        >
          <label>
            Email
            <input disabled placeholder={str(props.placeholder, 'you@email.com')} />
          </label>
          <InlineEditable
            as="span"
            className="btn"
            value={str(props.buttonLabel || props.ctaLabel, 'Subscribe')}
            enabled={canEdit}
            placeholder="Button"
            onChange={(next) => {
              if ('buttonLabel' in props) onPropChange('buttonLabel', next);
              else onPropChange('ctaLabel', next);
            }}
          />
        </form>
      </section>
    );
  }

  if (renderType === 'page_header') {
    return (
      <section className="page-header">
        <Eyebrow
          value={str(props.eyebrow)}
          canEdit={canEdit}
          onChange={(next) => onPropChange('eyebrow', next)}
        />
        <InlineEditable
          as="h1"
          value={str(props.title, 'Page title')}
          enabled={canEdit}
          placeholder="Page title"
          onChange={(next) => onPropChange('title', next)}
        />
        <InlineEditable
          as="p"
          value={str(props.subhead || props.body)}
          enabled={canEdit}
          multiline
          placeholder="Subhead"
          onChange={(next) => {
            if ('subhead' in props || !('body' in props)) onPropChange('subhead', next);
            else onPropChange('body', next);
          }}
        />
      </section>
    );
  }

  if (renderType === 'feature_split') {
    const side = str(props.imageSide, 'right') === 'left' ? 'left' : 'right';
    const imageUrl = str(props.imageUrl);
    return (
      <section className={`feature-split feature-split--image-${side}`}>
        <div className="feature-split-copy">
          <SectionHead props={props} canEdit={canEdit} onPropChange={onPropChange} />
          {canEdit || props.ctaLabel ? (
            <InlineEditable
              as="span"
              className="btn"
              value={str(props.ctaLabel)}
              enabled={canEdit}
              placeholder="CTA label"
              onChange={(next) => onPropChange('ctaLabel', next)}
            />
          ) : null}
        </div>
        <figure className="feature-split-media">
          {imageUrl ? (
            <img src={imageUrl} alt={str(props.imageAlt)} loading="lazy" />
          ) : (
            <div className="feature-split-media-empty">Add image in inspector</div>
          )}
        </figure>
      </section>
    );
  }

  if (renderType === 'banner_slim') {
    return (
      <section className="banner-slim">
        <InlineEditable
          as="p"
          value={str(props.text)}
          enabled={canEdit}
          multiline
          placeholder="Banner text"
          onChange={(next) => onPropChange('text', next)}
        />
        {canEdit || props.ctaLabel ? (
          <InlineEditable
            as="span"
            className="btn"
            value={str(props.ctaLabel)}
            enabled={canEdit}
            placeholder="CTA"
            onChange={(next) => onPropChange('ctaLabel', next)}
          />
        ) : null}
      </section>
    );
  }

  if (renderType === 'season_promo') {
    const image = str(props.imageUrl);
    const bg = image
      ? {
          backgroundImage: `linear-gradient(120deg,rgba(0,0,0,.5),rgba(0,0,0,.2)),url('${image}')`,
        }
      : undefined;
    return (
      <section className="season-promo" style={bg}>
        <div className="season-promo-inner">
          <Eyebrow
            value={str(props.eyebrow)}
            canEdit={canEdit}
            onChange={(next) => onPropChange('eyebrow', next)}
          />
          <InlineEditable
            as="h2"
            className="section-title"
            style={{ color: '#fff' }}
            value={str(props.title, 'Offer')}
            enabled={canEdit}
            placeholder="Title"
            onChange={(next) => onPropChange('title', next)}
          />
          <InlineEditable
            as="p"
            style={{ color: 'rgba(255,255,255,.88)', margin: '0 0 1rem' }}
            value={str(props.body)}
            enabled={canEdit}
            multiline
            placeholder="Body"
            onChange={(next) => onPropChange('body', next)}
          />
          {canEdit || props.ctaLabel ? (
            <InlineEditable
              as="span"
              className="btn"
              value={str(props.ctaLabel)}
              enabled={canEdit}
              placeholder="CTA"
              onChange={(next) => onPropChange('ctaLabel', next)}
            />
          ) : null}
        </div>
      </section>
    );
  }

  if (renderType === 'destination_grid') {
    return (
      <section>
        <SectionHead props={props} canEdit={canEdit} onPropChange={onPropChange} />
        <div className="dest-grid">
          {items.map((item, index) => {
            const row = asRecord(item);
            const image = str(row.image || row.imageUrl);
            return (
              <div key={index} className="dest-card">
                <figure>
                  {image ? (
                    <img src={image} alt={str(row.title)} loading="lazy" />
                  ) : (
                    <div className="dest-card-empty">Image</div>
                  )}
                </figure>
                <div className="dest-card-copy">
                  <InlineEditable
                    as="h3"
                    value={str(row.title, 'Destination')}
                    enabled={canEdit}
                    placeholder="Name"
                    onChange={(next) => patchItems(items, index, 'title', next, onPropChange)}
                  />
                  <InlineEditable
                    as="p"
                    value={str(row.body || row.subtitle)}
                    enabled={canEdit}
                    multiline
                    placeholder="Blurb"
                    onChange={(next) => {
                      if ('body' in row || !('subtitle' in row)) {
                        patchItems(items, index, 'body', next, onPropChange);
                      } else {
                        patchItems(items, index, 'subtitle', next, onPropChange);
                      }
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (renderType === 'package_cards') {
    return (
      <section>
        <SectionHead props={props} canEdit={canEdit} onPropChange={onPropChange} />
        <div className="package-grid">
          {items.map((item, index) => {
            const row = asRecord(item);
            const image = str(row.image || row.imageUrl);
            return (
              <article key={index} className="package-card">
                <figure>
                  {image ? (
                    <img src={image} alt={str(row.title)} loading="lazy" />
                  ) : (
                    <div className="package-card-empty">Image</div>
                  )}
                </figure>
                <div className="package-card-copy">
                  <InlineEditable
                    as="h3"
                    value={str(row.title, 'Package')}
                    enabled={canEdit}
                    placeholder="Title"
                    onChange={(next) => patchItems(items, index, 'title', next, onPropChange)}
                  />
                  <InlineEditable
                    as="p"
                    value={str(row.body || row.excerpt)}
                    enabled={canEdit}
                    multiline
                    placeholder="Summary"
                    onChange={(next) =>
                      patchItems(
                        items,
                        index,
                        'body' in row || !('excerpt' in row) ? 'body' : 'excerpt',
                        next,
                        onPropChange,
                      )
                    }
                  />
                  {canEdit || row.ctaLabel ? (
                    <InlineEditable
                      as="span"
                      className="btn"
                      value={str(row.ctaLabel, 'View')}
                      enabled={canEdit}
                      placeholder="CTA"
                      onChange={(next) => patchItems(items, index, 'ctaLabel', next, onPropChange)}
                    />
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  if (renderType === 'trust_badges') {
    return (
      <section>
        {canEdit || props.title ? (
          <InlineEditable
            as="h2"
            className="section-title"
            value={str(props.title)}
            enabled={canEdit}
            placeholder="Title"
            onChange={(next) => onPropChange('title', next)}
          />
        ) : null}
        <div className="trust-grid">
          {items.map((item, index) => {
            const row = asRecord(item);
            return (
              <div key={index} className="trust-badge">
                <InlineEditable
                  as="h3"
                  value={str(row.label || row.title, 'Badge')}
                  enabled={canEdit}
                  placeholder="Label"
                  onChange={(next) =>
                    patchItems(
                      items,
                      index,
                      'label' in row || !('title' in row) ? 'label' : 'title',
                      next,
                      onPropChange,
                    )
                  }
                />
                <InlineEditable
                  as="p"
                  value={str(row.body)}
                  enabled={canEdit}
                  multiline
                  placeholder="Body"
                  onChange={(next) => patchItems(items, index, 'body', next, onPropChange)}
                />
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (renderType === 'accordion' || renderType === 'tabs_content') {
    return (
      <section>
        <SectionHead props={props} canEdit={canEdit} onPropChange={onPropChange} />
        <div className={renderType === 'accordion' ? 'accordion-list' : 'tabs-block'}>
          {items.map((item, index) => {
            const row = asRecord(item);
            return (
              <div
                key={index}
                className={renderType === 'accordion' ? 'accordion-item' : 'tabs-panel'}
                style={{
                  padding: '0.75rem 1rem',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  marginBottom: '0.5rem',
                  background: 'var(--surface)',
                }}
              >
                <InlineEditable
                  as="h3"
                  value={str(row.label || row.q || row.title, `Item ${index + 1}`)}
                  enabled={canEdit}
                  placeholder="Label"
                  onChange={(next) => {
                    const key = 'label' in row ? 'label' : 'q' in row ? 'q' : 'title';
                    patchItems(items, index, key, next, onPropChange);
                  }}
                />
                <InlineEditable
                  as="p"
                  value={str(row.body || row.a)}
                  enabled={canEdit}
                  multiline
                  placeholder="Body"
                  onChange={(next) => {
                    const key = 'body' in row || !('a' in row) ? 'body' : 'a';
                    patchItems(items, index, key, next, onPropChange);
                  }}
                />
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (renderType === 'timeline' || renderType === 'itinerary' || renderType === 'route_map') {
    return (
      <section>
        <SectionHead props={props} canEdit={canEdit} onPropChange={onPropChange} />
        <div className="timeline">
          {items.map((item, index) => {
            const row = asRecord(item);
            return (
              <div key={index} className="timeline-item">
                <InlineEditable
                  as="h3"
                  value={str(row.title || row.day, `Step ${index + 1}`)}
                  enabled={canEdit}
                  placeholder="Title"
                  onChange={(next) =>
                    patchItems(
                      items,
                      index,
                      'title' in row || !('day' in row) ? 'title' : 'day',
                      next,
                      onPropChange,
                    )
                  }
                />
                <InlineEditable
                  as="p"
                  value={str(row.body)}
                  enabled={canEdit}
                  multiline
                  placeholder="Details"
                  onChange={(next) => patchItems(items, index, 'body', next, onPropChange)}
                />
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (renderType === 'team') {
    return (
      <section>
        <SectionHead props={props} canEdit={canEdit} onPropChange={onPropChange} />
        <div className="team-grid">
          {items.map((item, index) => {
            const row = asRecord(item);
            const photo = str(row.photo || row.image);
            return (
              <article key={index} className="team-card">
                {photo ? <img src={photo} alt={str(row.name)} loading="lazy" /> : null}
                <InlineEditable
                  as="h3"
                  value={str(row.name, 'Name')}
                  enabled={canEdit}
                  placeholder="Name"
                  onChange={(next) => patchItems(items, index, 'name', next, onPropChange)}
                />
                <InlineEditable
                  as="p"
                  value={str(row.role)}
                  enabled={canEdit}
                  placeholder="Role"
                  onChange={(next) => patchItems(items, index, 'role', next, onPropChange)}
                />
                <InlineEditable
                  as="p"
                  value={str(row.bio)}
                  enabled={canEdit}
                  multiline
                  placeholder="Bio"
                  onChange={(next) => patchItems(items, index, 'bio', next, onPropChange)}
                />
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  if (renderType === 'pricing') {
    return (
      <section>
        <SectionHead props={props} canEdit={canEdit} onPropChange={onPropChange} />
        <div className="pricing-grid">
          {items.map((item, index) => {
            const row = asRecord(item);
            const hl = row.highlighted === true || row.highlighted === 'true';
            return (
              <article key={index} className={`price-card${hl ? ' price-card--hl' : ''}`}>
                <InlineEditable
                  as="h3"
                  value={str(row.name, 'Plan')}
                  enabled={canEdit}
                  placeholder="Plan name"
                  onChange={(next) => patchItems(items, index, 'name', next, onPropChange)}
                />
                <InlineEditable
                  as="p"
                  className="price-amount"
                  value={str(row.price)}
                  enabled={canEdit}
                  placeholder="Price"
                  onChange={(next) => patchItems(items, index, 'price', next, onPropChange)}
                />
                <InlineEditable
                  as="p"
                  value={str(row.features)}
                  enabled={canEdit}
                  multiline
                  placeholder="Features (one per line)"
                  onChange={(next) => patchItems(items, index, 'features', next, onPropChange)}
                />
                {canEdit || row.ctaLabel ? (
                  <InlineEditable
                    as="span"
                    className="btn"
                    value={str(row.ctaLabel, 'Choose')}
                    enabled={canEdit}
                    placeholder="CTA"
                    onChange={(next) => patchItems(items, index, 'ctaLabel', next, onPropChange)}
                  />
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  if (renderType === 'trip_search_cta') {
    return (
      <section className="trip-search">
        <InlineEditable
          as="h2"
          className="section-title"
          value={str(props.title, 'Where to next?')}
          enabled={canEdit}
          placeholder="Title"
          onChange={(next) => onPropChange('title', next)}
        />
        <InlineEditable
          as="p"
          className="section-lead"
          value={str(props.body)}
          enabled={canEdit}
          multiline
          placeholder="Supporting text"
          onChange={(next) => onPropChange('body', next)}
        />
        <div className="trip-search-fields">
          <div>
            <InlineEditable
              as="label"
              value={str(props.destinationLabel, 'Destination')}
              enabled={canEdit}
              placeholder="Destination label"
              onChange={(next) => onPropChange('destinationLabel', next)}
            />
            <input disabled placeholder="e.g. Sri Lanka" />
          </div>
          <div>
            <InlineEditable
              as="label"
              value={str(props.datesLabel, 'Travel dates')}
              enabled={canEdit}
              placeholder="Dates label"
              onChange={(next) => onPropChange('datesLabel', next)}
            />
            <input disabled placeholder="Month / year" />
          </div>
          <InlineEditable
            as="span"
            className="btn"
            value={str(props.ctaLabel, 'Start enquiry')}
            enabled={canEdit}
            placeholder="CTA"
            onChange={(next) => onPropChange('ctaLabel', next)}
          />
        </div>
      </section>
    );
  }

  if (renderType === 'contact_block') {
    return (
      <section>
        <SectionHead
          props={props}
          canEdit={canEdit}
          onPropChange={onPropChange}
          titleFallback="Contact"
        />
        <div className="contact-block">
          <dl className="contact-meta">
            <div>
              <dt>Address</dt>
              <dd>
                <InlineEditable
                  as="span"
                  value={str(props.address)}
                  enabled={canEdit}
                  multiline
                  placeholder="Address"
                  onChange={(next) => onPropChange('address', next)}
                />
              </dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>
                <InlineEditable
                  as="span"
                  value={str(props.phone)}
                  enabled={canEdit}
                  placeholder="Phone"
                  onChange={(next) => onPropChange('phone', next)}
                />
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>
                <InlineEditable
                  as="span"
                  value={str(props.email)}
                  enabled={canEdit}
                  placeholder="Email"
                  onChange={(next) => onPropChange('email', next)}
                />
              </dd>
            </div>
            <div>
              <dt>Hours</dt>
              <dd>
                <InlineEditable
                  as="span"
                  value={str(props.hours)}
                  enabled={canEdit}
                  placeholder="Hours"
                  onChange={(next) => onPropChange('hours', next)}
                />
              </dd>
            </div>
          </dl>
        </div>
      </section>
    );
  }

  if (renderType === 'hotel_highlight') {
    return (
      <section className="hotel-highlight">
        <SectionHead props={props} canEdit={canEdit} onPropChange={onPropChange} />
        {canEdit || props.ctaLabel ? (
          <InlineEditable
            as="span"
            className="btn"
            value={str(props.ctaLabel)}
            enabled={canEdit}
            placeholder="CTA"
            onChange={(next) => onPropChange('ctaLabel', next)}
          />
        ) : null}
      </section>
    );
  }

  if (renderType === 'legal_text') {
    return (
      <section className="legal-text">
        <InlineEditable
          as="h2"
          className="section-title"
          value={str(props.title, 'Legal')}
          enabled={canEdit}
          placeholder="Title"
          onChange={(next) => onPropChange('title', next)}
        />
        <InlineEditable
          as="p"
          value={str(props.body)}
          enabled={canEdit}
          multiline
          placeholder="Legal body"
          onChange={(next) => onPropChange('body', next)}
        />
      </section>
    );
  }

  if (renderType === 'enquiry_split') {
    return (
      <section className="enquiry-split">
        <div>
          <SectionHead
            props={props}
            canEdit={canEdit}
            onPropChange={onPropChange}
            titleFallback="Enquire"
          />
        </div>
        <div className="enquiry-split-form-preview">
          <p className="section-lead">Form fields — edit labels in the inspector</p>
        </div>
      </section>
    );
  }

  if (renderType === 'image_text_list') {
    return (
      <section>
        {canEdit || props.title ? (
          <InlineEditable
            as="h2"
            className="section-title"
            value={str(props.title)}
            enabled={canEdit}
            placeholder="Title"
            onChange={(next) => onPropChange('title', next)}
          />
        ) : null}
        <div className="image-text-list">
          {items.map((item, index) => {
            const row = asRecord(item);
            const image = str(row.image);
            return (
              <div key={index} className="image-text-row">
                <figure>
                  {image ? <img src={image} alt={str(row.title)} loading="lazy" /> : null}
                </figure>
                <div>
                  <InlineEditable
                    as="h3"
                    value={str(row.title, 'Title')}
                    enabled={canEdit}
                    placeholder="Title"
                    onChange={(next) => patchItems(items, index, 'title', next, onPropChange)}
                  />
                  <InlineEditable
                    as="p"
                    value={str(row.body)}
                    enabled={canEdit}
                    multiline
                    placeholder="Body"
                    onChange={(next) => patchItems(items, index, 'body', next, onPropChange)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (renderType === 'video_feature' || renderType === 'map_block') {
    return (
      <section className={renderType === 'video_feature' ? 'video-feature' : 'map-block'}>
        <div className={renderType === 'map_block' ? 'map-block-side' : undefined}>
          <Eyebrow
            value={str(props.eyebrow)}
            canEdit={canEdit}
            onChange={(next) => onPropChange('eyebrow', next)}
          />
          <InlineEditable
            as="h2"
            className="section-title"
            value={str(props.title, renderType === 'map_block' ? 'Location' : 'Video')}
            enabled={canEdit}
            placeholder="Title"
            onChange={(next) => onPropChange('title', next)}
          />
          <InlineEditable
            as="p"
            className="section-lead"
            value={str(props.body)}
            enabled={canEdit}
            multiline
            placeholder="Body"
            onChange={(next) => onPropChange('body', next)}
          />
          {canEdit || props.ctaLabel ? (
            <InlineEditable
              as="span"
              className="btn"
              value={str(props.ctaLabel)}
              enabled={canEdit}
              placeholder="CTA"
              onChange={(next) => onPropChange('ctaLabel', next)}
            />
          ) : null}
        </div>
        <figure className={renderType === 'map_block' ? 'contact-map' : 'embed-frame'}>
          <div style={{ padding: '2rem', color: 'var(--muted)', textAlign: 'center' }}>
            {renderType === 'map_block' ? 'Map preview — set embed URL in inspector' : 'Video — set URL in inspector'}
          </div>
        </figure>
      </section>
    );
  }

  if (renderType === 'blog_cards' || renderType === 'cards_carousel') {
    const gridClass = renderType === 'blog_cards' ? 'blog-grid' : 'cards-carousel';
    const cardClass = renderType === 'blog_cards' ? 'blog-card' : 'carousel-card';
    return (
      <section>
        <SectionHead props={props} canEdit={canEdit} onPropChange={onPropChange} />
        <div className={gridClass}>
          {items.map((item, index) => {
            const row = asRecord(item);
            const image = str(row.image);
            return (
              <div key={index} className={cardClass}>
                <figure>
                  {image ? <img src={image} alt={str(row.title)} loading="lazy" /> : null}
                </figure>
                <div className={renderType === 'blog_cards' ? 'blog-card-body' : 'carousel-card-body'}>
                  <InlineEditable
                    as="h3"
                    value={str(row.title, 'Title')}
                    enabled={canEdit}
                    placeholder="Title"
                    onChange={(next) => patchItems(items, index, 'title', next, onPropChange)}
                  />
                  <InlineEditable
                    as="p"
                    value={str(row.body || row.excerpt)}
                    enabled={canEdit}
                    multiline
                    placeholder="Summary"
                    onChange={(next) =>
                      patchItems(
                        items,
                        index,
                        'body' in row || !('excerpt' in row) ? 'body' : 'excerpt',
                        next,
                        onPropChange,
                      )
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (renderType === 'footer_columns') {
    return (
      <section className="footer-cols">
        {([1, 2, 3] as const).map((n) => (
          <div key={n}>
            <InlineEditable
              as="h3"
              value={str(props[`col${n}Title`])}
              enabled={canEdit}
              placeholder={`Column ${n} title`}
              onChange={(next) => onPropChange(`col${n}Title`, next)}
            />
            <InlineEditable
              as="p"
              value={str(props[`col${n}Body`])}
              enabled={canEdit}
              multiline
              placeholder={`Column ${n} body`}
              onChange={(next) => onPropChange(`col${n}Body`, next)}
            />
          </div>
        ))}
      </section>
    );
  }

  if (renderType === 'embed') {
    return (
      <section className="embed-block">
        {canEdit || props.title ? (
          <InlineEditable
            as="h2"
            className="section-title"
            value={str(props.title)}
            enabled={canEdit}
            placeholder="Title"
            onChange={(next) => onPropChange('title', next)}
          />
        ) : null}
        <figure className="embed-frame" style={{ aspectRatio: str(props.aspectRatio, '16/9') }}>
          <div style={{ padding: '2rem', color: 'var(--muted)', textAlign: 'center' }}>
            Embed — set URL in inspector
          </div>
        </figure>
      </section>
    );
  }

  if (renderType === 'gallery_masonry') {
    return (
      <section>
        <SectionHead props={props} canEdit={canEdit} onPropChange={onPropChange} />
        <p className="section-lead">Images — manage in the inspector</p>
      </section>
    );
  }

  return null;
}

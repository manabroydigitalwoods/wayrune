import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { extraModulesCss, renderExtraModule, resolveRenderableModuleType } from '@wayrune/contracts';
import { api } from '../../../api';
import { cn } from '@wayrune/ui';
import { sectionLayoutClass, styleInlineProps, layoutBoxStyle, columnSlotKeys, effectiveStyleProps } from './helpers';
import { InlineEditable } from './InlineEditable';
import { renderLiveEditableExtra } from './LiveEditableExtras';
import type { DeviceMode, FormDef, ModuleDef, Section } from './types';

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
  editable,
  onChange,
}: {
  value: string;
  editable?: boolean;
  onChange?: (next: string) => void;
}) {
  if (!value && !editable) return null;
  return (
    <InlineEditable
      as="div"
      className="eyebrow"
      value={value}
      enabled={Boolean(editable && onChange)}
      placeholder="Eyebrow"
      onChange={(next) => onChange?.(next)}
    />
  );
}

function SectionShell({
  type,
  props,
  className,
  style,
  children,
}: {
  type: string;
  props: Record<string, unknown>;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className={cn(sectionLayoutClass(type, props), className)} style={style}>
      <div className="presence-section-inner">{children}</div>
    </div>
  );
}

/** Live preview of a `liquid`/`js_module` section — debounced round-trip to the preview-module endpoint. */
function DynamicModulePreview({
  rendererKey,
  propsJson,
  templateSource,
  moduleSource,
  themeTokens,
}: {
  rendererKey: 'liquid' | 'js_module';
  propsJson: Record<string, unknown>;
  templateSource?: string | null;
  moduleSource?: string | null;
  themeTokens?: Record<string, unknown> | null;
}) {
  const [html, setHtml] = useState<string>('');
  const [error, setError] = useState('');
  const requestKey = JSON.stringify({ rendererKey, propsJson, templateSource, moduleSource });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      let cancelled = false;
      void api<{ html: string }>('/presence/preview-module', {
        method: 'POST',
        body: JSON.stringify({
          rendererKey,
          propsJson,
          templateSource,
          moduleSource,
          themeTokens: themeTokens || {},
        }),
      })
        .then((res) => {
          if (!cancelled) {
            setHtml(res.html || '');
            setError('');
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Preview failed');
        });
      return () => {
        cancelled = true;
      };
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const headline = str(propsJson.title || propsJson.headline);
  if (error) {
    return (
      <div className="presence-dynamic-fallback">
        <div className="presence-dynamic-fallback-title">
          {headline || (rendererKey === 'liquid' ? 'Liquid module' : 'JS module')}
        </div>
        <div className="presence-dynamic-fallback-error">{error}</div>
      </div>
    );
  }
  if (!html) {
    return (
      <div className="presence-dynamic-fallback">
        <div className="presence-dynamic-fallback-title">{headline || 'Rendering preview…'}</div>
      </div>
    );
  }
  return <div className="presence-dynamic-html" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function LiveSectionView({
  section,
  forms,
  modules,
  themeTokens,
  renderSlot,
  editable = false,
  onPropChange,
  device = 'desktop',
}: {
  section: Section;
  forms: FormDef[];
  modules?: ModuleDef[];
  themeTokens?: Record<string, unknown> | null;
  /** Renders nested children of a container/two_column — supplied by the interactive canvas. */
  renderSlot?: (parentClientId: string, slotKey: string | null) => ReactNode;
  /** When true (selected + canWrite), text props are editable on the canvas. */
  editable?: boolean;
  onPropChange?: (key: string, value: unknown) => void;
  device?: DeviceMode;
}) {
  const props = section.propsJson || {};
  const type = section.type;
  const effective = effectiveStyleProps(props, device);
  const style: CSSProperties = styleInlineProps(effective);
  const cssClass = typeof props.cssClass === 'string' ? props.cssClass : '';
  const canEdit = Boolean(editable && onPropChange);
  const setProp = (key: string) => (next: string) => onPropChange?.(key, next);
  const layoutProps = { ...props, ...effective };

  if (type === 'hero') {
    const variant = str(props.variant, 'spotlight');
    const variantClass =
      variant === 'minimal'
        ? ' hero-variant-minimal'
        : variant === 'split'
          ? ' hero-variant-split'
          : variant === 'immersive'
            ? ' hero-variant-immersive'
            : '';
    const imageUrl = str(props.imageUrl);
    const heroStyle = imageUrl
      ? ({
          backgroundImage: `linear-gradient(135deg, color-mix(in srgb, var(--hero-from) 72%, transparent), color-mix(in srgb, var(--hero-to) 78%, transparent)), url(${imageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } as CSSProperties)
      : undefined;
    const hasPrimary = Boolean(canEdit || props.ctaLabel);
    const hasSecondary = Boolean(canEdit || props.secondaryCtaLabel);
    return (
      <SectionShell type={type} props={layoutProps} className={cssClass} style={style}>
        <section className={`hero${variantClass}`} style={heroStyle}>
          <div className="hero-copy">
            <Eyebrow value={str(props.eyebrow)} editable={canEdit} onChange={setProp('eyebrow')} />
            <InlineEditable
              as="h1"
              value={str(props.headline, 'Headline')}
              enabled={canEdit}
              placeholder="Headline"
              onChange={setProp('headline')}
            />
            <InlineEditable
              as="p"
              value={str(props.subhead)}
              enabled={canEdit}
              placeholder="Subhead"
              multiline
              onChange={setProp('subhead')}
            />
            {hasPrimary || hasSecondary ? (
              <div className="hero-actions">
                {hasPrimary ? (
                  <InlineEditable
                    as="span"
                    className="btn"
                    value={str(props.ctaLabel)}
                    enabled={canEdit}
                    placeholder="Primary CTA"
                    onChange={setProp('ctaLabel')}
                  />
                ) : null}
                {hasSecondary ? (
                  <InlineEditable
                    as="span"
                    className="btn-secondary"
                    value={str(props.secondaryCtaLabel)}
                    enabled={canEdit}
                    placeholder="Secondary CTA"
                    onChange={setProp('secondaryCtaLabel')}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </SectionShell>
    );
  }

  if (type === 'rich_text') {
    const body = str(props.body || props.html);
    return (
      <SectionShell type={type} props={layoutProps} className={cssClass} style={style}>
        <section className="presence-prose">
          <Eyebrow value={str(props.eyebrow)} editable={canEdit} onChange={setProp('eyebrow')} />
          <InlineEditable
            as="h2"
            className="presence-title"
            value={str(props.title)}
            enabled={canEdit}
            placeholder="Title"
            onChange={setProp('title')}
          />
          {canEdit ? (
            <InlineEditable
              as="p"
              value={body}
              enabled
              multiline
              placeholder="Body text"
              onChange={(next) => onPropChange?.('body', next)}
            />
          ) : (
            body
              .split(/\n{2,}/)
              .filter(Boolean)
              .map((paragraph, index) => <p key={index}>{paragraph}</p>)
          )}
        </section>
      </SectionShell>
    );
  }

  if (type === 'faq') {
    const items = Array.isArray(props.items) ? props.items : [];
    const setItemField = (index: number, field: string, next: string) => {
      onPropChange?.(
        'items',
        items.map((item, i) => {
          const row = asRecord(item);
          if (i !== index) return row;
          return { ...row, [field]: next };
        }),
      );
    };
    return (
      <SectionShell type={type} props={layoutProps} className={cssClass} style={style}>
        <section>
          <Eyebrow value={str(props.eyebrow)} editable={canEdit} onChange={setProp('eyebrow')} />
          <InlineEditable
            as="h2"
            className="presence-title"
            value={str(props.title, 'FAQ')}
            enabled={canEdit}
            placeholder="FAQ"
            onChange={setProp('title')}
          />
          <div className="presence-faq-list">
            {items.map((item, index) => {
              const row = asRecord(item);
              const qKey = 'q' in row || !('question' in row) ? 'q' : 'question';
              const aKey = 'a' in row || !('answer' in row) ? 'a' : 'answer';
              return (
                <div key={index} className="presence-faq-item">
                  <InlineEditable
                    as="div"
                    className="font-semibold"
                    value={str(row.q || row.question, 'Question')}
                    enabled={canEdit}
                    placeholder="Question"
                    onChange={(next) => setItemField(index, qKey, next)}
                  />
                  <InlineEditable
                    as="div"
                    className="text-[color:var(--presence-muted)]"
                    value={str(row.a || row.answer, 'Answer')}
                    enabled={canEdit}
                    multiline
                    placeholder="Answer"
                    onChange={(next) => setItemField(index, aKey, next)}
                  />
                </div>
              );
            })}
          </div>
        </section>
      </SectionShell>
    );
  }

  if (type === 'testimonials') {
    const items = Array.isArray(props.items) ? props.items : [];
    const setItemField = (index: number, field: 'quote' | 'author', next: string) => {
      const nextItems = items.map((item, i) => {
        const row = asRecord(item);
        if (i !== index) return row;
        return { ...row, [field]: next };
      });
      onPropChange?.('items', nextItems);
    };
    return (
      <SectionShell type={type} props={layoutProps} className={cssClass} style={style}>
        <section>
          <Eyebrow value={str(props.eyebrow)} editable={canEdit} onChange={setProp('eyebrow')} />
          <InlineEditable
            as="h2"
            className="presence-title"
            value={str(props.title, 'Testimonials')}
            enabled={canEdit}
            placeholder="Testimonials"
            onChange={setProp('title')}
          />
          <div className="presence-quote-grid">
            {items.map((item, index) => {
              const row = asRecord(item);
              return (
                <blockquote key={index} className="presence-quote">
                  <InlineEditable
                    as="p"
                    value={str(row.quote, 'Quote')}
                    enabled={canEdit}
                    multiline
                    placeholder="Quote"
                    onChange={(next) => setItemField(index, 'quote', next)}
                  />
                  <InlineEditable
                    as="cite"
                    value={str(row.author, 'Author')}
                    enabled={canEdit}
                    placeholder="Author"
                    onChange={(next) => setItemField(index, 'author', next)}
                  />
                </blockquote>
              );
            })}
          </div>
        </section>
      </SectionShell>
    );
  }

  // stats + catalog alias trip_facts — inline-editable (not HTML dump)
  if (type === 'stats' || type === 'trip_facts') {
    const items = Array.isArray(props.items) ? props.items : [];
    const setItemField = (index: number, field: 'value' | 'label', next: string) => {
      const nextItems = items.map((item, i) => {
        const row = asRecord(item);
        if (i !== index) return row;
        return { ...row, [field]: next };
      });
      onPropChange?.('items', nextItems);
    };
    return (
      <SectionShell type={type} props={layoutProps} className={cssClass} style={style}>
        <section>
          <Eyebrow value={str(props.eyebrow)} editable={canEdit} onChange={setProp('eyebrow')} />
          {canEdit || str(props.title) ? (
            <InlineEditable
              as="h2"
              className="presence-title"
              value={str(props.title)}
              enabled={canEdit}
              placeholder="Title (optional)"
              onChange={setProp('title')}
            />
          ) : null}
          <div className="stats-strip">
            {items.map((item, index) => {
              const row = asRecord(item);
              return (
                <div key={index} className="stat-card">
                  <InlineEditable
                    as="p"
                    className="stat-value"
                    value={str(row.value, '0')}
                    enabled={canEdit}
                    placeholder="Value"
                    onChange={(next) => setItemField(index, 'value', next)}
                  />
                  <InlineEditable
                    as="p"
                    className="stat-label"
                    value={str(row.label, 'Label')}
                    enabled={canEdit}
                    placeholder="Label"
                    onChange={(next) => setItemField(index, 'label', next)}
                  />
                </div>
              );
            })}
          </div>
        </section>
      </SectionShell>
    );
  }

  if (type === 'cta' || type === 'widget_cta') {
    const band = type === 'cta' && str(props.variant, 'band') !== 'card';
    return (
      <SectionShell type={type} props={layoutProps} className={cssClass} style={style}>
        <section className={band ? 'presence-cta-band' : 'presence-cta-card'}>
          <Eyebrow value={str(props.eyebrow)} editable={canEdit} onChange={setProp('eyebrow')} />
          <InlineEditable
            as="h2"
            className="presence-title"
            value={str(props.title, 'Call to action')}
            enabled={canEdit}
            placeholder="Call to action"
            onChange={setProp('title')}
          />
          <InlineEditable
            as="p"
            className="presence-lead"
            value={str(props.body)}
            enabled={canEdit}
            multiline
            placeholder="Supporting text"
            onChange={setProp('body')}
          />
          <InlineEditable
            as="span"
            className="presence-btn"
            value={str(props.label || props.ctaLabel, 'Get in touch')}
            enabled={canEdit}
            placeholder="Button label"
            onChange={(next) => {
              if ('label' in props) onPropChange?.('label', next);
              else onPropChange?.('ctaLabel', next);
            }}
          />
        </section>
      </SectionShell>
    );
  }

  if (type === 'gallery') {
    const images = Array.isArray(props.images) ? props.images : [];
    const validImages = images.filter((img) => {
      const row = typeof img === 'string' ? { url: img } : asRecord(img);
      return Boolean(str(row.url));
    });
    return (
      <SectionShell type={type} props={layoutProps} className={cssClass} style={style}>
        <section>
          <Eyebrow value={str(props.eyebrow)} editable={canEdit} onChange={setProp('eyebrow')} />
          <InlineEditable
            as="h2"
            className="presence-title"
            value={str(props.title, 'Gallery')}
            enabled={canEdit}
            placeholder="Gallery"
            onChange={setProp('title')}
          />
          <div className="presence-gallery">
            {validImages.map((img, index) => {
              const row = typeof img === 'string' ? { url: img } : asRecord(img);
              return (
                <figure key={index} className="presence-gallery-item">
                  <img src={str(row.url)} alt={str(row.alt)} />
                </figure>
              );
            })}
            {!validImages.length ? (
              <div className="presence-gallery-empty">Add images in the inspector</div>
            ) : null}
          </div>
        </section>
      </SectionShell>
    );
  }

  if (type === 'form') {
    const formKey = str(props.formKey, 'contact');
    const form = forms.find((row) => row.key === formKey);
    const fields = Array.isArray(form?.fieldsJson)
      ? (form!.fieldsJson as Array<Record<string, unknown>>)
      : [
          { name: 'name', label: 'Name', type: 'text' },
          { name: 'email', label: 'Email', type: 'email' },
          { name: 'message', label: 'Message', type: 'textarea' },
        ];
    return (
      <SectionShell type={type} props={layoutProps} className={cssClass} style={style}>
        <section className="presence-form">
          <Eyebrow value={str(props.eyebrow)} editable={canEdit} onChange={setProp('eyebrow')} />
          <InlineEditable
            as="h2"
            className="presence-title"
            value={str(props.title, form?.name || 'Contact')}
            enabled={canEdit}
            placeholder="Form title"
            onChange={setProp('title')}
          />
          <InlineEditable
            as="p"
            className="presence-lead"
            value={str(props.body)}
            enabled={canEdit}
            multiline
            placeholder="Form intro"
            onChange={setProp('body')}
          />
          <div className="presence-form-fields">
            {fields.map((field) => {
              const name = str(field.name);
              const label = str(field.label, name);
              const inputType = str(field.type, 'text');
              return (
                <label key={name || label}>
                  {label}
                  {inputType === 'textarea' ? (
                    <textarea disabled rows={3} placeholder={label} />
                  ) : (
                    <input disabled type={inputType === 'email' || inputType === 'tel' ? inputType : 'text'} placeholder={label} />
                  )}
                </label>
              );
            })}
            <InlineEditable
              as="span"
              className="presence-btn"
              value={str(props.submitLabel || props.ctaLabel, 'Send')}
              enabled={canEdit}
              placeholder="Send"
              onChange={(next) => {
                if ('submitLabel' in props) onPropChange?.('submitLabel', next);
                else onPropChange?.('ctaLabel', next);
              }}
            />
          </div>
        </section>
      </SectionShell>
    );
  }

  if (type === 'container') {
    const children = renderSlot ? renderSlot(section.clientId, null) : null;
    return (
      <SectionShell type={type} props={layoutProps} className={cssClass} style={style}>
        <section className="presence-container" style={layoutBoxStyle('container', props)}>
          {children || <div className="presence-container-empty">Drop a module here</div>}
        </section>
      </SectionShell>
    );
  }

  if (type === 'two_column') {
    const left = renderSlot ? renderSlot(section.clientId, 'left') : null;
    const right = renderSlot ? renderSlot(section.clientId, 'right') : null;
    return (
      <SectionShell type={type} props={layoutProps} className={cssClass} style={style}>
        <section className="presence-two-col" style={layoutBoxStyle('two_column', props)}>
          <div className="presence-two-col-slot">
            {left || <div className="presence-container-empty">Left column</div>}
          </div>
          <div className="presence-two-col-slot">
            {right || <div className="presence-container-empty">Right column</div>}
          </div>
        </section>
      </SectionShell>
    );
  }

  if (type === 'columns') {
    const slots = columnSlotKeys(props.columnCount);
    return (
      <SectionShell type={type} props={layoutProps} className={cssClass} style={style}>
        <section className="presence-columns" style={layoutBoxStyle('columns', props)}>
          {slots.map((slot, index) => {
            const child = renderSlot ? renderSlot(section.clientId, slot) : null;
            return (
              <div key={slot} className="presence-two-col-slot">
                {child || (
                  <div className="presence-container-empty">Column {index + 1}</div>
                )}
              </div>
            );
          })}
        </section>
      </SectionShell>
    );
  }

  if (type === 'package') {
    const moduleDef = modules?.find((m) => m.id === section.moduleDefinitionId);
    const assets = (moduleDef?.assetsJson || {}) as {
      packageHtml?: string;
      packageCss?: string;
      jsUrls?: string[];
    };
    const height = Number(props.minHeight || props.height || 240);
    const propsJson = JSON.stringify(props).replace(/</g, '\\u003c');
    const themeJson = JSON.stringify(themeTokens || {}).replace(/</g, '\\u003c');
    const scriptTags = (assets.jsUrls || [])
      .map((src) => `<script src="${src.replace(/"/g, '')}"></script>`)
      .join('\n');
    const srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
html,body{margin:0;padding:0;background:transparent;}
${assets.packageCss || ''}
</style></head><body>
${assets.packageHtml || '<div id="root"></div>'}
<script>window.__PRESENCE_PROPS__=${propsJson};window.__PRESENCE_CTX__={tokens:${themeJson},api:null};</script>
${scriptTags}
<script>
(function(){
  var root = document.getElementById('root') || document.body;
  var props = window.__PRESENCE_PROPS__ || {};
  var ctx = window.__PRESENCE_CTX__ || {};
  var mount = window.PresenceMount || (window.PresenceComponent && window.PresenceComponent.mount) || null;
  if (typeof mount === 'function') { try { mount(root, props, ctx); } catch (e) {} }
})();
</script>
</body></html>`;
    return (
      <SectionShell type={type} props={layoutProps} className={cn('presence-package-wrap', cssClass)} style={style}>
        <iframe
          className="presence-package-frame w-full border-0"
          sandbox="allow-scripts"
          title="Package component"
          srcDoc={srcdoc}
          style={{ minHeight: Math.max(80, height) }}
        />
      </SectionShell>
    );
  }

  if (type === 'liquid' || type === 'js_module') {
    const moduleDef = modules?.find((m) => m.id === section.moduleDefinitionId);
    const templateSource =
      (typeof moduleDef?.templateSource === 'string' && moduleDef.templateSource) ||
      (typeof props.templateSource === 'string' ? props.templateSource : '');
    const moduleSource =
      (typeof moduleDef?.moduleSource === 'string' && moduleDef.moduleSource) ||
      (typeof props.moduleSource === 'string' ? props.moduleSource : '');
    return (
      <SectionShell
        type={type}
        props={layoutProps}
        className={cn('presence-dynamic-wrap', cssClass)}
        style={style}
      >
        <DynamicModulePreview
          rendererKey={type}
          propsJson={props}
          templateSource={templateSource}
          moduleSource={moduleSource}
          themeTokens={themeTokens}
        />
      </SectionShell>
    );
  }

  const formLookup = new Map(
    forms.map((f) => [
      f.key,
      { key: f.key, name: f.name, ingestMode: f.ingestMode || 'contact', fieldsJson: f.fieldsJson },
    ]),
  );
  const renderType = resolveRenderableModuleType(type);
  const liveExtra = renderLiveEditableExtra({
    renderType,
    props,
    canEdit,
    onPropChange: onPropChange ?? (() => undefined),
  });
  if (liveExtra) {
    return (
      <SectionShell type={type} props={layoutProps} className={cn('presence-extra-module', cssClass)} style={style}>
        {liveExtra}
      </SectionShell>
    );
  }
  const extraHtml = renderExtraModule(renderType, props, formLookup);
  if (extraHtml) {
    return (
      <SectionShell type={type} props={layoutProps} className={cn('presence-extra-module', cssClass)} style={style}>
        <div dangerouslySetInnerHTML={{ __html: extraHtml }} />
      </SectionShell>
    );
  }

  return (
    <SectionShell type={type} props={layoutProps} className={cssClass} style={style}>
      <section>
        <h2 className="presence-title">{type}</h2>
        <p className="presence-lead">Module preview</p>
      </section>
    </SectionShell>
  );
}

export function themeCssVars(tokens: Record<string, unknown> | null | undefined): CSSProperties {
  const primary = str(tokens?.primary, '#0f766e');
  const accent = str(tokens?.accent, primary);
  const bg = str(tokens?.background, '#f8fafc');
  const fg = str(tokens?.foreground, '#0f172a');
  const muted = str(tokens?.muted, '#64748b');
  const surface = str(tokens?.surface, '#ffffff');
  const surfaceMuted = str(tokens?.surfaceMuted, '#eef2f7');
  const border = str(tokens?.border, 'rgba(15,23,42,.1)');
  const radius = str(tokens?.radius, '14px');
  const heroFrom = str(tokens?.heroFrom, primary);
  const heroTo = str(tokens?.heroTo, '#0f172a');
  const fontDisplay = str(tokens?.fontDisplay, 'Georgia, serif');
  const fontBody = str(tokens?.fontBody, 'system-ui, sans-serif');
  return {
    // Builder-prefixed vars
    ['--presence-primary' as string]: primary,
    ['--presence-accent' as string]: accent,
    ['--presence-bg' as string]: bg,
    ['--presence-fg' as string]: fg,
    ['--presence-muted' as string]: muted,
    ['--presence-surface' as string]: surface,
    ['--presence-surface-muted' as string]: surfaceMuted,
    ['--presence-border' as string]: border,
    ['--presence-radius' as string]: radius,
    ['--presence-hero-from' as string]: heroFrom,
    ['--presence-hero-to' as string]: heroTo,
    ['--presence-font-display' as string]: fontDisplay,
    ['--presence-font-body' as string]: fontBody,
    // Public-runtime aliases so theme swatches / pasted CSS vars resolve in the canvas too
    ['--primary' as string]: primary,
    ['--accent' as string]: accent,
    ['--bg' as string]: bg,
    ['--fg' as string]: fg,
    ['--muted' as string]: muted,
    ['--surface' as string]: surface,
    ['--surface-muted' as string]: surfaceMuted,
    ['--border' as string]: border,
    ['--radius' as string]: radius,
    ['--hero-from' as string]: heroFrom,
    ['--hero-to' as string]: heroTo,
    ['--font-display' as string]: fontDisplay,
    ['--font-body' as string]: fontBody,
    ['--shadow' as string]: '0 18px 50px rgba(15,23,42,.08)',
    ['--section-gap' as string]: '2.75rem',
  };
}

/** Public-module CSS for Phase 1–3 modules (shared with runtime). */
export const EXTRA_MODULES_LIVE_CSS = extraModulesCss();

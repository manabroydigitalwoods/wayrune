/** HTML + CSS for Phase 1–3 presence modules (public runtime). */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function str(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function eyebrowHtml(value: unknown) {
  const text = str(value).trim();
  return text ? `<div class="eyebrow">${escapeHtml(text)}</div>` : '';
}

function sectionHead(props: Record<string, unknown>, titleFallback = '') {
  const title = str(props.title, titleFallback);
  return `<div class="section-head">${eyebrowHtml(props.eyebrow)}${
    title ? `<h2 class="section-title">${escapeHtml(title)}</h2>` : ''
  }${props.body ? `<p class="section-lead">${escapeHtml(str(props.body))}</p>` : ''}</div>`;
}

function linesToList(text: string, tag: 'ul' | 'ol' = 'ul') {
  const lines = text
    .split(/\n/)
    .map((l) => l.replace(/^[•\-*]\s*/, '').trim())
    .filter(Boolean);
  if (!lines.length) return '';
  return `<${tag}>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</${tag}>`;
}

function safeEmbedSrc(src: string) {
  const trimmed = src.trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return trimmed;
  } catch {
    return '';
  }
}

function formFieldsHtml(
  fields: Array<Record<string, unknown>>,
  opts?: { emailOnly?: boolean; placeholder?: string },
) {
  if (opts?.emailOnly) {
    return `<label>Email<input type="email" name="email" required placeholder="${escapeHtml(
      opts.placeholder || 'you@email.com',
    )}"/></label>`;
  }
  return fields
    .map((f) => {
      const name = str(f.name);
      const label = str(f.label, name);
      const required = f.required === true ? 'required' : '';
      const inputType = str(f.type, 'text');
      return inputType === 'textarea'
        ? `<label>${escapeHtml(label)}<textarea name="${escapeHtml(name)}" ${required} rows="4"></textarea></label>`
        : `<label>${escapeHtml(label)}<input type="${escapeHtml(inputType)}" name="${escapeHtml(name)}" ${required}/></label>`;
    })
    .join('');
}

export function extraModulesCss() {
  return `
    .logo-cloud { text-align:center; }
    .logo-cloud-grid {
      display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(120px,1fr));
      align-items:center; margin-top:1.25rem;
    }
    .logo-cloud-item {
      display:flex; align-items:center; justify-content:center; min-height:3.5rem;
      padding:.75rem 1rem; border-radius:var(--radius); background:var(--surface);
      border:1px solid var(--border); color:var(--muted); font-weight:650; font-size:.85rem;
      text-decoration:none;
    }
    .logo-cloud-item img { max-height:2rem; max-width:100%; object-fit:contain; filter:grayscale(.2); opacity:.85; }

    .stats-strip { display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); }
    .stat-card {
      text-align:center; padding:1.25rem 1rem; border-radius:var(--radius);
      background:var(--surface); border:1px solid var(--border);
    }
    .stat-value {
      font-family:var(--font-display); font-size:clamp(1.6rem,3vw,2.2rem);
      letter-spacing:-0.03em; margin:0 0 .25rem; color:var(--primary);
    }
    .stat-label { margin:0; color:var(--muted); font-size:.9rem; font-weight:600; }

    .feature-grid {
      display:grid; gap:1rem;
      grid-template-columns:repeat(var(--feature-cols, 3), minmax(0,1fr));
    }
    @media (max-width:720px) { .feature-grid { grid-template-columns:1fr; } }
    .feature-card {
      padding:1.25rem; border-radius:var(--radius); background:var(--surface);
      border:1px solid var(--border);
    }
    .feature-icon {
      width:2.25rem; height:2.25rem; display:inline-flex; align-items:center; justify-content:center;
      border-radius:999px; margin-bottom:.75rem; font-size:1rem;
      background:color-mix(in srgb, var(--primary) 12%, var(--surface)); color:var(--primary);
    }
    .feature-card h3 { margin:0 0 .4rem; font-size:1.05rem; letter-spacing:-0.02em; }
    .feature-card p { margin:0; color:var(--muted); font-size:.95rem; }

    .feature-split {
      display:grid; gap:1.5rem; align-items:center;
      grid-template-columns:1.05fr .95fr;
    }
    .feature-split--image-left { grid-template-columns:.95fr 1.05fr; }
    .feature-split--image-left .feature-split-media { order:-1; }
    @media (max-width:720px) {
      .feature-split, .feature-split--image-left { grid-template-columns:1fr; }
      .feature-split--image-left .feature-split-media { order:0; }
    }
    .feature-split-media {
      margin:0; overflow:hidden; border-radius:var(--radius); border:1px solid var(--border);
      aspect-ratio:4/3; background:var(--surface-muted);
    }
    .feature-split-media img { width:100%; height:100%; object-fit:cover; display:block; }

    .pricing-grid { display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); }
    .price-card {
      padding:1.35rem; border-radius:var(--radius); background:var(--surface);
      border:1px solid var(--border); display:flex; flex-direction:column; gap:.75rem;
    }
    .price-card--hl {
      border-color:color-mix(in srgb, var(--primary) 45%, var(--border));
      box-shadow:0 14px 36px color-mix(in srgb, var(--primary) 16%, transparent);
    }
    .price-card h3 { margin:0; font-size:1.1rem; }
    .price-amount {
      margin:0; font-family:var(--font-display); font-size:1.6rem; letter-spacing:-0.03em;
    }
    .price-card ul { margin:0; padding-left:1.1rem; color:var(--muted); }
    .price-card .btn { margin-top:auto; width:100%; }

    .team-grid { display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); }
    .team-card {
      padding:1.1rem; border-radius:var(--radius); background:var(--surface);
      border:1px solid var(--border); text-align:center;
    }
    .team-photo {
      width:5.5rem; height:5.5rem; border-radius:999px; object-fit:cover; margin:0 auto .85rem;
      display:block; border:1px solid var(--border); background:var(--surface-muted);
    }
    .team-card h3 { margin:0 0 .2rem; font-size:1.05rem; }
    .team-role { margin:0 0 .5rem; color:var(--primary); font-size:.85rem; font-weight:650; }
    .team-bio { margin:0; color:var(--muted); font-size:.9rem; }

    .announce-bar {
      display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:.75rem 1.25rem;
      padding:.85rem 1.25rem; border-radius:var(--radius); text-align:center;
      background:color-mix(in srgb, var(--primary) 10%, var(--surface));
      border:1px solid color-mix(in srgb, var(--primary) 22%, var(--border));
      font-weight:600; font-size:.95rem;
    }
    .announce-bar a { color:var(--primary); font-weight:700; text-decoration:none; }

    .blog-grid { display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); }
    .blog-card {
      border-radius:var(--radius); overflow:hidden; background:var(--surface);
      border:1px solid var(--border); text-decoration:none; color:inherit; display:block;
    }
    .blog-card figure { margin:0; aspect-ratio:16/10; background:var(--surface-muted); overflow:hidden; }
    .blog-card img { width:100%; height:100%; object-fit:cover; display:block; }
    .blog-card-body { padding:1rem 1.1rem 1.2rem; }
    .blog-card h3 { margin:0 0 .4rem; font-size:1.05rem; letter-spacing:-0.02em; }
    .blog-card p { margin:0; color:var(--muted); font-size:.92rem; }

    .contact-block {
      display:grid; gap:1.5rem; grid-template-columns:1fr 1.1fr; align-items:start;
    }
    @media (max-width:720px) { .contact-block { grid-template-columns:1fr; } }
    .contact-meta { display:grid; gap:.85rem; }
    .contact-meta dt { font-weight:700; font-size:.78rem; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
    .contact-meta dd { margin:.2rem 0 0; white-space:pre-line; }
    .contact-map {
      margin:0; border-radius:var(--radius); overflow:hidden; border:1px solid var(--border);
      min-height:220px; background:var(--surface-muted);
    }
    .contact-map iframe { width:100%; height:100%; min-height:220px; border:0; display:block; }

    .newsletter-band {
      display:grid; gap:1rem; padding:1.75rem; border-radius:calc(var(--radius) + 2px);
      background:var(--surface); border:1px solid var(--border);
      grid-template-columns:1.2fr .8fr; align-items:center;
    }
    @media (max-width:720px) { .newsletter-band { grid-template-columns:1fr; } }
    .newsletter-band form {
      display:flex; flex-wrap:wrap; align-items:center; gap:.65rem;
      --newsletter-field-gap: .75rem;
    }
    .newsletter-band label {
      display:flex; align-items:center; gap:var(--newsletter-field-gap, .75rem);
      flex:1 1 12rem; min-width:0; font-size:.85rem; font-weight:600; color:var(--muted);
    }
    .newsletter-band input {
      flex:1; min-width:10rem; padding:.72rem .85rem; border-radius:calc(var(--radius) - 4px);
      border:1px solid color-mix(in srgb, var(--border) 80%, #94a3b8);
      background:color-mix(in srgb, var(--surface) 92%, var(--bg)); color:var(--fg); font:inherit;
    }

    .divider-block { display:flex; align-items:center; justify-content:center; }
    .divider-rule { width:100%; height:1px; background:var(--border); border:0; margin:0; }

    .embed-block { display:grid; gap:.75rem; }
    .embed-frame {
      margin:0; border-radius:var(--radius); overflow:hidden; border:1px solid var(--border);
      background:var(--surface-muted); aspect-ratio:16/9;
    }
    .embed-frame iframe { width:100%; height:100%; border:0; display:block; }

    .page-header {
      padding:2rem 0 1rem; border-bottom:1px solid var(--border); margin-bottom:.5rem;
    }
    .page-header h1 {
      font-family:var(--font-display); font-size:clamp(1.8rem,3.5vw,2.6rem);
      letter-spacing:-0.03em; margin:0 0 .5rem; line-height:1.1;
    }
    .page-header p { margin:0; color:var(--muted); max-width:40rem; font-size:1.05rem; }

    .tabs-block { display:grid; gap:1rem; }
    .tabs-nav { display:flex; flex-wrap:wrap; gap:.4rem; }
    .tabs-nav label {
      padding:.45rem .9rem; border-radius:999px; border:1px solid var(--border);
      background:var(--surface); cursor:pointer; font-size:.88rem; font-weight:600;
    }
    .tabs-block input[type=radio] { position:absolute; opacity:0; pointer-events:none; }
    .tabs-panel { display:none; padding:1.15rem; border-radius:var(--radius); background:var(--surface); border:1px solid var(--border); }
    .tabs-block input[type=radio]:checked + label {
      background:var(--primary); color:#fff; border-color:var(--primary);
    }
    .tabs-block input[type=radio]:nth-of-type(1):checked ~ .tabs-panels .tabs-panel:nth-child(1),
    .tabs-block input[type=radio]:nth-of-type(2):checked ~ .tabs-panels .tabs-panel:nth-child(2),
    .tabs-block input[type=radio]:nth-of-type(3):checked ~ .tabs-panels .tabs-panel:nth-child(3),
    .tabs-block input[type=radio]:nth-of-type(4):checked ~ .tabs-panels .tabs-panel:nth-child(4),
    .tabs-block input[type=radio]:nth-of-type(5):checked ~ .tabs-panels .tabs-panel:nth-child(5),
    .tabs-block input[type=radio]:nth-of-type(6):checked ~ .tabs-panels .tabs-panel:nth-child(6) { display:block; }

    .accordion-list { display:grid; gap:.55rem; }
    .accordion-item {
      border-radius:var(--radius); background:var(--surface); border:1px solid var(--border);
      padding:.15rem 1rem;
    }
    .accordion-item summary {
      cursor:pointer; font-weight:700; padding:.75rem 0; list-style:none;
    }
    .accordion-item summary::-webkit-details-marker { display:none; }
    .accordion-item p { margin:0 0 .9rem; color:var(--muted); }

    .timeline { display:grid; gap:0; position:relative; padding-left:1.25rem; }
    .timeline::before {
      content:""; position:absolute; left:.35rem; top:.35rem; bottom:.35rem; width:2px;
      background:color-mix(in srgb, var(--primary) 35%, var(--border));
    }
    .timeline-item { position:relative; padding:0 0 1.25rem 1rem; }
    .timeline-item::before {
      content:""; position:absolute; left:-1.05rem; top:.45rem; width:.7rem; height:.7rem;
      border-radius:999px; background:var(--primary); border:2px solid var(--surface);
    }
    .timeline-item h3 { margin:0 0 .35rem; font-size:1.05rem; }
    .timeline-item p { margin:0; color:var(--muted); }

    .compare-wrap { overflow:auto; border-radius:var(--radius); border:1px solid var(--border); }
    .compare-table { width:100%; border-collapse:collapse; background:var(--surface); font-size:.92rem; }
    .compare-table th, .compare-table td {
      padding:.75rem 1rem; text-align:left; border-bottom:1px solid var(--border);
    }
    .compare-table th { background:color-mix(in srgb, var(--primary) 8%, var(--surface)); font-weight:700; }
    .compare-table tr:last-child td { border-bottom:0; }

    .image-text-list { display:grid; gap:1.25rem; }
    .image-text-row {
      display:grid; gap:1rem; grid-template-columns:140px 1fr; align-items:center;
    }
    @media (max-width:560px) { .image-text-row { grid-template-columns:1fr; } }
    .image-text-row figure {
      margin:0; aspect-ratio:1; border-radius:var(--radius); overflow:hidden;
      border:1px solid var(--border); background:var(--surface-muted);
    }
    .image-text-row img { width:100%; height:100%; object-fit:cover; display:block; }
    .image-text-row h3 { margin:0 0 .35rem; font-size:1.05rem; }
    .image-text-row p { margin:0; color:var(--muted); }

    .video-feature {
      display:grid; gap:1.5rem; grid-template-columns:1.15fr .85fr; align-items:center;
    }
    @media (max-width:720px) { .video-feature { grid-template-columns:1fr; } }
    .video-feature .embed-frame { aspect-ratio:16/9; }

    .map-block {
      display:grid; gap:1.25rem; grid-template-columns:.85fr 1.15fr; align-items:stretch;
    }
    @media (max-width:720px) { .map-block { grid-template-columns:1fr; } }
    .map-block-side {
      padding:1.25rem; border-radius:var(--radius); background:var(--surface); border:1px solid var(--border);
    }

    .footer-cols {
      display:grid; gap:1.25rem; grid-template-columns:repeat(3,minmax(0,1fr));
      padding:1.5rem 0;
    }
    @media (max-width:720px) { .footer-cols { grid-template-columns:1fr; } }
    .footer-cols h3 { margin:0 0 .5rem; font-size:.92rem; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); }
    .footer-cols p { margin:0; white-space:pre-line; color:var(--fg); font-size:.95rem; }

    .legal-text {
      padding:1.5rem; border-radius:var(--radius); background:var(--surface); border:1px solid var(--border);
    }
    .legal-text .updated { color:var(--muted); font-size:.85rem; margin:0 0 1rem; }
    .legal-text .body { white-space:pre-wrap; line-height:1.7; }

    .cards-carousel {
      display:flex; gap:1rem; overflow-x:auto; scroll-snap-type:x mandatory;
      padding-bottom:.5rem; -webkit-overflow-scrolling:touch;
    }
    .carousel-card {
      flex:0 0 min(280px, 78vw); scroll-snap-align:start;
      border-radius:var(--radius); overflow:hidden; background:var(--surface);
      border:1px solid var(--border); text-decoration:none; color:inherit;
    }
    .carousel-card figure { margin:0; aspect-ratio:16/10; background:var(--surface-muted); }
    .carousel-card img { width:100%; height:100%; object-fit:cover; display:block; }
    .carousel-card-body { padding:1rem; }
    .carousel-card h3 { margin:0 0 .35rem; font-size:1.05rem; }
    .carousel-card p { margin:0; color:var(--muted); font-size:.9rem; }

    .banner-slim {
      display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:1rem;
      padding:1.1rem 1.35rem; border-radius:var(--radius);
      background:color-mix(in srgb, var(--primary) 92%, #000); color:#fff;
    }
    .banner-slim p { margin:0; font-weight:600; max-width:40rem; }
    .banner-slim .btn { background:#fff; color:var(--hero-from); box-shadow:none; }

    .dest-grid { display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); }
    .dest-card {
      border-radius:var(--radius); overflow:hidden; background:var(--surface);
      border:1px solid var(--border); text-decoration:none; color:inherit; display:block;
      position:relative;
    }
    .dest-card figure { margin:0; aspect-ratio:4/3; background:var(--surface-muted); }
    .dest-card img { width:100%; height:100%; object-fit:cover; display:block; }
    .dest-card-body {
      position:absolute; inset:auto 0 0; padding:1.1rem;
      background:linear-gradient(transparent, rgba(0,0,0,.72)); color:#fff;
    }
    .dest-card h3 { margin:0 0 .25rem; font-size:1.15rem; }
    .dest-card p { margin:0; opacity:.9; font-size:.9rem; }

    .package-grid { display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); }
    .package-card {
      border-radius:var(--radius); overflow:hidden; background:var(--surface);
      border:1px solid var(--border); display:flex; flex-direction:column;
    }
    .package-card figure { margin:0; aspect-ratio:16/10; background:var(--surface-muted); }
    .package-card img { width:100%; height:100%; object-fit:cover; display:block; }
    .package-card-body { padding:1.15rem; display:flex; flex-direction:column; gap:.55rem; flex:1; }
    .package-meta { display:flex; gap:.75rem; flex-wrap:wrap; color:var(--muted); font-size:.88rem; font-weight:600; }
    .package-card ul { margin:0; padding-left:1.1rem; color:var(--muted); font-size:.92rem; }
    .package-card .btn { margin-top:auto; width:100%; }

    .itinerary-list { display:grid; gap:.75rem; }
    .itinerary-day {
      display:grid; gap:.35rem .85rem; grid-template-columns:5.5rem 1fr;
      padding:1rem 1.1rem; border-radius:var(--radius); background:var(--surface); border:1px solid var(--border);
    }
    @media (max-width:560px) { .itinerary-day { grid-template-columns:1fr; } }
    .itinerary-day .day {
      font-weight:750; color:var(--primary); font-size:.85rem; letter-spacing:.04em; text-transform:uppercase;
    }
    .itinerary-day h3 { margin:0; font-size:1.05rem; }
    .itinerary-day p { margin:0; color:var(--muted); }

    .hotel-highlight {
      display:grid; gap:1.25rem; grid-template-columns:1.1fr .9fr; align-items:stretch;
      border-radius:var(--radius); overflow:hidden; border:1px solid var(--border); background:var(--surface);
    }
    @media (max-width:720px) { .hotel-highlight { grid-template-columns:1fr; } }
    .hotel-highlight figure { margin:0; min-height:220px; background:var(--surface-muted); }
    .hotel-highlight img { width:100%; height:100%; object-fit:cover; display:block; }
    .hotel-highlight-body { padding:1.35rem; display:flex; flex-direction:column; gap:.65rem; }
    .hotel-stars { color:var(--primary); font-weight:700; letter-spacing:.08em; }

    .trip-search {
      padding:1.75rem; border-radius:calc(var(--radius) + 2px);
      background:var(--surface); border:1px solid var(--border);
    }
    .trip-search-fields {
      display:grid; gap:.75rem; grid-template-columns:1fr 1fr auto; align-items:end; margin-top:1rem;
    }
    @media (max-width:720px) { .trip-search-fields { grid-template-columns:1fr; } }
    .trip-search label { display:block; font-size:.82rem; font-weight:650; margin-bottom:.3rem; }
    .trip-search input {
      width:100%; padding:.72rem .85rem; border-radius:calc(var(--radius) - 4px);
      border:1px solid color-mix(in srgb, var(--border) 80%, #94a3b8);
      background:color-mix(in srgb, var(--surface) 92%, var(--bg)); color:var(--fg); font:inherit;
    }

    .season-promo {
      position:relative; overflow:hidden; border-radius:calc(var(--radius) + 4px);
      min-height:280px; display:flex; align-items:flex-end; color:#fff;
      background:linear-gradient(135deg, var(--hero-from), var(--hero-to));
      background-size:cover; background-position:center;
    }
    .season-promo-inner {
      position:relative; z-index:1; padding:clamp(1.5rem,4vw,2.5rem); max-width:36rem;
    }
    .season-promo::after {
      content:""; position:absolute; inset:0;
      background:linear-gradient(120deg, rgba(0,0,0,.55), rgba(0,0,0,.2));
    }
    .season-promo .eyebrow { color:#fff; background:rgba(255,255,255,.14); }
    .season-promo .section-title { color:#fff; }
    .season-promo-inner > p,
    .season-promo .section-lead {
      color:rgba(255,255,255,.88); margin:0 0 1rem;
    }
    .season-promo .btn { background:#fff; color:var(--hero-from); box-shadow:none; }

    .trust-grid { display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); }
    .trust-badge {
      text-align:center; padding:1.15rem; border-radius:var(--radius);
      background:var(--surface); border:1px solid var(--border);
    }
    .trust-badge h3 { margin:0 0 .35rem; font-size:.95rem; }
    .trust-badge p { margin:0; color:var(--muted); font-size:.88rem; }

    .enquiry-split {
      display:grid; gap:1.5rem; grid-template-columns:1fr 1fr; align-items:start;
    }
    @media (max-width:720px) { .enquiry-split { grid-template-columns:1fr; } }
    .enquiry-points { white-space:pre-line; color:var(--muted); }

    .masonry-grid {
      columns:3; column-gap:.75rem;
    }
    @media (max-width:900px) { .masonry-grid { columns:2; } }
    @media (max-width:560px) { .masonry-grid { columns:1; } }
    .masonry-item {
      break-inside:avoid; margin:0 0 .75rem; border-radius:var(--radius); overflow:hidden;
      border:1px solid var(--border); background:var(--surface-muted);
    }
    .masonry-item img { width:100%; display:block; height:auto; }

    .route-map {
      display:grid; gap:1.25rem; grid-template-columns:.9fr 1.1fr; align-items:start;
    }
    @media (max-width:720px) { .route-map { grid-template-columns:1fr; } }
    .route-stops { display:grid; gap:.65rem; }
    .route-stop {
      padding:.9rem 1rem; border-radius:var(--radius); background:var(--surface); border:1px solid var(--border);
    }
    .route-stop h3 { margin:0 0 .25rem; font-size:1rem; }
    .route-stop p { margin:0; color:var(--muted); font-size:.9rem; }
`;
}

export type ExtraFormLookup = Map<
  string,
  { key: string; name: string; ingestMode: string; fieldsJson: unknown }
>;

export function renderExtraModule(
  type: string,
  props: Record<string, unknown>,
  formByKey?: ExtraFormLookup,
  formCtx?: { apiUrl: string; orgRef: string; publicKey: string },
): string | null {
  if (type === 'logo_cloud') {
    const items = Array.isArray(props.items) ? props.items : [];
    return `<section class="logo-cloud">${sectionHead(props)}<div class="logo-cloud-grid">${items
      .map((item) => {
        const row = asRecord(item);
        const url = str(row.url);
        const alt = str(row.alt, 'Logo');
        const href = str(row.href);
        const inner = url
          ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy"/>`
          : escapeHtml(alt);
        return href
          ? `<a class="logo-cloud-item" href="${escapeHtml(href)}">${inner}</a>`
          : `<div class="logo-cloud-item">${inner}</div>`;
      })
      .join('')}</div></section>`;
  }

  if (type === 'stats') {
    const items = Array.isArray(props.items) ? props.items : [];
    return `<section>${sectionHead(props)}<div class="stats-strip">${items
      .map((item) => {
        const row = asRecord(item);
        return `<div class="stat-card"><p class="stat-value">${escapeHtml(str(row.value))}</p><p class="stat-label">${escapeHtml(
          str(row.label),
        )}</p></div>`;
      })
      .join('')}</div></section>`;
  }

  if (type === 'feature_grid') {
    const cols = ['2', '3', '4'].includes(str(props.columns)) ? str(props.columns) : '3';
    const items = Array.isArray(props.items) ? props.items : [];
    return `<section>${sectionHead(props)}<div class="feature-grid" style="--feature-cols:${escapeHtml(
      cols,
    )}">${items
      .map((item) => {
        const row = asRecord(item);
        return `<article class="feature-card"><div class="feature-icon">${escapeHtml(
          str(row.icon, '✦'),
        )}</div><h3>${escapeHtml(str(row.title))}</h3><p>${escapeHtml(str(row.body))}</p></article>`;
      })
      .join('')}</div></section>`;
  }

  if (type === 'feature_split') {
    const side = str(props.imageSide, 'right') === 'left' ? 'left' : 'right';
    const imageUrl = str(props.imageUrl);
    const cta =
      props.ctaLabel
        ? `<a class="btn" href="${escapeHtml(str(props.ctaHref, '#'))}">${escapeHtml(str(props.ctaLabel))}</a>`
        : '';
    return `<section class="feature-split feature-split--image-${side}"><div class="feature-split-copy">${eyebrowHtml(
      props.eyebrow,
    )}${props.title ? `<h2 class="section-title">${escapeHtml(str(props.title))}</h2>` : ''}${
      props.body ? `<p class="section-lead">${escapeHtml(str(props.body))}</p>` : ''
    }${cta}</div><figure class="feature-split-media">${
      imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(str(props.imageAlt))}" loading="lazy"/>`
        : ''
    }</figure></section>`;
  }

  if (type === 'pricing') {
    const items = Array.isArray(props.items) ? props.items : [];
    return `<section>${sectionHead(props)}<div class="pricing-grid">${items
      .map((item) => {
        const row = asRecord(item);
        const hl = row.highlighted === true || row.highlighted === 'true';
        return `<article class="price-card${hl ? ' price-card--hl' : ''}"><h3>${escapeHtml(
          str(row.name),
        )}</h3><p class="price-amount">${escapeHtml(str(row.price))}</p>${linesToList(
          str(row.features),
        )}${
          row.ctaLabel
            ? `<a class="btn" href="${escapeHtml(str(row.ctaHref, '#'))}">${escapeHtml(str(row.ctaLabel))}</a>`
            : ''
        }</article>`;
      })
      .join('')}</div></section>`;
  }

  if (type === 'team') {
    const items = Array.isArray(props.items) ? props.items : [];
    return `<section>${sectionHead(props)}<div class="team-grid">${items
      .map((item) => {
        const row = asRecord(item);
        const photo = str(row.photo);
        return `<article class="team-card">${
          photo
            ? `<img class="team-photo" src="${escapeHtml(photo)}" alt="${escapeHtml(str(row.name))}" loading="lazy"/>`
            : '<div class="team-photo"></div>'
        }<h3>${escapeHtml(str(row.name))}</h3><p class="team-role">${escapeHtml(
          str(row.role),
        )}</p><p class="team-bio">${escapeHtml(str(row.bio))}</p></article>`;
      })
      .join('')}</div></section>`;
  }

  if (type === 'logo_header_strip') {
    const link =
      props.href && props.linkLabel
        ? `<a href="${escapeHtml(str(props.href))}">${escapeHtml(str(props.linkLabel))}</a>`
        : props.href
          ? `<a href="${escapeHtml(str(props.href))}">Learn more</a>`
          : '';
    return `<section class="announce-bar"><span>${escapeHtml(str(props.text))}</span>${link}</section>`;
  }

  if (type === 'blog_cards') {
    const items = Array.isArray(props.items) ? props.items : [];
    return `<section>${sectionHead(props)}<div class="blog-grid">${items
      .map((item) => {
        const row = asRecord(item);
        const href = str(row.href, '#');
        const image = str(row.image);
        return `<a class="blog-card" href="${escapeHtml(href)}"><figure>${
          image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(str(row.title))}" loading="lazy"/>` : ''
        }</figure><div class="blog-card-body"><h3>${escapeHtml(str(row.title))}</h3><p>${escapeHtml(
          str(row.excerpt),
        )}</p></div></a>`;
      })
      .join('')}</div></section>`;
  }

  if (type === 'contact_block') {
    const mapSrc = safeEmbedSrc(str(props.mapEmbedUrl));
    return `<section>${sectionHead(props)}<div class="contact-block"><dl class="contact-meta">${
      props.address
        ? `<div><dt>Address</dt><dd>${escapeHtml(str(props.address))}</dd></div>`
        : ''
    }${
      props.phone ? `<div><dt>Phone</dt><dd>${escapeHtml(str(props.phone))}</dd></div>` : ''
    }${
      props.email ? `<div><dt>Email</dt><dd>${escapeHtml(str(props.email))}</dd></div>` : ''
    }${
      props.hours ? `<div><dt>Hours</dt><dd>${escapeHtml(str(props.hours))}</dd></div>` : ''
    }</dl><figure class="contact-map">${
      mapSrc
        ? `<iframe src="${escapeHtml(mapSrc)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>`
        : '<div style="padding:2rem;color:var(--muted);text-align:center">Add a map embed URL</div>'
    }</figure></div></section>`;
  }

  if (type === 'newsletter') {
    const formKey = str(props.formKey, 'contact');
    const form = formByKey?.get(formKey);
    const mode = form?.ingestMode || 'contact';
    const formId = `nl_${formKey.replace(/[^a-z0-9_]/gi, '_')}`;
    const script =
      formCtx
        ? `<script>(function(){var form=document.getElementById('${formId}');if(!form)return;form.addEventListener('submit',function(e){e.preventDefault();var fd=new FormData(form);var status=form.querySelector('.form-status');var body={organizationId:${JSON.stringify(
            formCtx.orgRef,
          )},publicKey:${JSON.stringify(formCtx.publicKey)},mode:${JSON.stringify(
            mode,
          )},formKey:${JSON.stringify(
            formKey,
          )},email:fd.get('email')||null,message:'Newsletter signup',idempotencyKey:'nl_'+Date.now()};if(!body.publicKey){if(status)status.textContent='Widget public key not configured.';return;}fetch(${JSON.stringify(
            `${formCtx.apiUrl}/leads/widget/ingest`,
          )},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){if(!r.ok)throw new Error('failed');if(status)status.textContent='Thanks — you are subscribed.';form.reset();}).catch(function(){if(status)status.textContent='Could not send. Please try again.';});});})();</script>`
        : '';
    return `<section class="newsletter-band"><div>${sectionHead(props)}</div><form id="${formId}" style="--newsletter-field-gap:${escapeHtml(
      str(props.fieldGap, '0.75rem'),
    )}">${formFieldsHtml(
      [],
      { emailOnly: true, placeholder: str(props.placeholder, 'you@email.com') },
    )}<button class="btn" type="submit">${escapeHtml(
      str(props.buttonLabel, 'Subscribe'),
    )}</button><p class="form-status" style="color:var(--muted);font-size:.85rem;min-height:1.2em;width:100%"></p></form>${script}</section>`;
  }

  if (type === 'divider') {
    const height = str(props.height, '2.5rem');
    const showRule = props.showRule !== false && props.showRule !== 'false';
    return `<section class="divider-block" style="height:${escapeHtml(height)}">${
      showRule ? '<hr class="divider-rule"/>' : ''
    }</section>`;
  }

  if (type === 'embed') {
    const src = safeEmbedSrc(str(props.src));
    const ratio = str(props.aspectRatio, '16/9');
    return `<section class="embed-block">${
      props.title ? `<h2 class="section-title">${escapeHtml(str(props.title))}</h2>` : ''
    }<figure class="embed-frame" style="aspect-ratio:${escapeHtml(ratio)}">${
      src
        ? `<iframe src="${escapeHtml(src)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
        : '<div style="padding:2rem;color:var(--muted);text-align:center">Add an embed URL</div>'
    }</figure></section>`;
  }

  if (type === 'page_header') {
    return `<section class="page-header">${eyebrowHtml(props.eyebrow)}<h1>${escapeHtml(
      str(props.title, 'Page title'),
    )}</h1>${props.subhead ? `<p>${escapeHtml(str(props.subhead))}</p>` : ''}</section>`;
  }

  if (type === 'tabs_content') {
    const items = Array.isArray(props.items) ? props.items : [];
    const uid = `tabs_${Math.random().toString(36).slice(2, 8)}`;
    const radios = items
      .map((item, i) => {
        const row = asRecord(item);
        return `<input type="radio" name="${uid}" id="${uid}_${i}"${i === 0 ? ' checked' : ''}/><label for="${uid}_${i}">${escapeHtml(
          str(row.label, `Tab ${i + 1}`),
        )}</label>`;
      })
      .join('');
    const panels = items
      .map((item) => {
        const row = asRecord(item);
        return `<div class="tabs-panel"><p>${escapeHtml(str(row.body)).replace(/\n/g, '<br/>')}</p></div>`;
      })
      .join('');
    return `<section class="tabs-block">${
      props.title ? `<h2 class="section-title">${escapeHtml(str(props.title))}</h2>` : ''
    }${radios}<div class="tabs-panels">${panels}</div></section>`;
  }

  if (type === 'accordion') {
    const items = Array.isArray(props.items) ? props.items : [];
    return `<section>${sectionHead(props)}<div class="accordion-list">${items
      .map((item) => {
        const row = asRecord(item);
        return `<details class="accordion-item"><summary>${escapeHtml(
          str(row.label, str(row.q)),
        )}</summary><p>${escapeHtml(str(row.body, str(row.a))).replace(/\n/g, '<br/>')}</p></details>`;
      })
      .join('')}</div></section>`;
  }

  if (type === 'timeline') {
    const items = Array.isArray(props.items) ? props.items : [];
    return `<section>${sectionHead(props)}<div class="timeline">${items
      .map((item) => {
        const row = asRecord(item);
        return `<div class="timeline-item"><h3>${escapeHtml(str(row.title))}</h3><p>${escapeHtml(
          str(row.body),
        )}</p></div>`;
      })
      .join('')}</div></section>`;
  }

  if (type === 'comparison_table') {
    const headers = str(props.headers)
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    const rows = Array.isArray(props.rows) ? props.rows : [];
    return `<section>${
      props.title ? `<h2 class="section-title">${escapeHtml(str(props.title))}</h2>` : ''
    }<div class="compare-wrap"><table class="compare-table"><thead><tr>${headers
      .map((h) => `<th>${escapeHtml(h)}</th>`)
      .join('')}</tr></thead><tbody>${rows
      .map((row) => {
        const cells = str(asRecord(row).cells)
          .split(',')
          .map((c) => c.trim());
        return `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`;
      })
      .join('')}</tbody></table></div></section>`;
  }

  if (type === 'image_text_list') {
    const items = Array.isArray(props.items) ? props.items : [];
    return `<section>${
      props.title ? `<h2 class="section-title">${escapeHtml(str(props.title))}</h2>` : ''
    }<div class="image-text-list">${items
      .map((item) => {
        const row = asRecord(item);
        const image = str(row.image);
        return `<div class="image-text-row"><figure>${
          image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(str(row.title))}" loading="lazy"/>` : ''
        }</figure><div><h3>${escapeHtml(str(row.title))}</h3><p>${escapeHtml(str(row.body))}</p></div></div>`;
      })
      .join('')}</div></section>`;
  }

  if (type === 'video_feature') {
    const src = safeEmbedSrc(str(props.videoUrl));
    const cta =
      props.ctaLabel
        ? `<a class="btn" href="${escapeHtml(str(props.ctaHref, '#'))}">${escapeHtml(str(props.ctaLabel))}</a>`
        : '';
    return `<section class="video-feature"><figure class="embed-frame">${
      src
        ? `<iframe src="${escapeHtml(src)}" loading="lazy" allowfullscreen></iframe>`
        : ''
    }</figure><div>${eyebrowHtml(props.eyebrow)}${
      props.title ? `<h2 class="section-title">${escapeHtml(str(props.title))}</h2>` : ''
    }${props.body ? `<p class="section-lead">${escapeHtml(str(props.body))}</p>` : ''}${cta}</div></section>`;
  }

  if (type === 'map_block') {
    const mapSrc = safeEmbedSrc(str(props.mapEmbedUrl));
    const cta =
      props.ctaLabel
        ? `<a class="btn" href="${escapeHtml(str(props.ctaHref, '#'))}">${escapeHtml(str(props.ctaLabel))}</a>`
        : '';
    return `<section class="map-block"><div class="map-block-side"><h2 class="section-title">${escapeHtml(
      str(props.title, 'Location'),
    )}</h2>${props.body ? `<p class="section-lead">${escapeHtml(str(props.body))}</p>` : ''}${cta}</div><figure class="contact-map">${
      mapSrc
        ? `<iframe src="${escapeHtml(mapSrc)}" loading="lazy" allowfullscreen></iframe>`
        : '<div style="padding:2rem;color:var(--muted);text-align:center">Add a map embed URL</div>'
    }</figure></section>`;
  }

  if (type === 'footer_columns') {
    return `<section class="footer-cols"><div><h3>${escapeHtml(str(props.col1Title))}</h3><p>${escapeHtml(
      str(props.col1Body),
    )}</p></div><div><h3>${escapeHtml(str(props.col2Title))}</h3><p>${escapeHtml(
      str(props.col2Body),
    )}</p></div><div><h3>${escapeHtml(str(props.col3Title))}</h3><p>${escapeHtml(
      str(props.col3Body),
    )}</p></div></section>`;
  }

  if (type === 'legal_text') {
    return `<section class="legal-text">${
      props.title ? `<h2 class="section-title">${escapeHtml(str(props.title))}</h2>` : ''
    }${
      props.updatedAt ? `<p class="updated">${escapeHtml(str(props.updatedAt))}</p>` : ''
    }<div class="body">${escapeHtml(str(props.body))}</div></section>`;
  }

  if (type === 'cards_carousel') {
    const items = Array.isArray(props.items) ? props.items : [];
    return `<section>${
      props.title ? `<h2 class="section-title">${escapeHtml(str(props.title))}</h2>` : ''
    }<div class="cards-carousel">${items
      .map((item) => {
        const row = asRecord(item);
        const href = str(row.href, '#');
        const image = str(row.image);
        return `<a class="carousel-card" href="${escapeHtml(href)}"><figure>${
          image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(str(row.title))}" loading="lazy"/>` : ''
        }</figure><div class="carousel-card-body"><h3>${escapeHtml(str(row.title))}</h3><p>${escapeHtml(
          str(row.body),
        )}</p></div></a>`;
      })
      .join('')}</div></section>`;
  }

  if (type === 'banner_slim') {
    const cta =
      props.ctaLabel
        ? `<a class="btn" href="${escapeHtml(str(props.ctaHref, '#'))}">${escapeHtml(str(props.ctaLabel))}</a>`
        : '';
    return `<section class="banner-slim"><p>${escapeHtml(str(props.text))}</p>${cta}</section>`;
  }

  if (type === 'destination_grid') {
    const items = Array.isArray(props.items) ? props.items : [];
    return `<section>${sectionHead(props)}<div class="dest-grid">${items
      .map((item) => {
        const row = asRecord(item);
        const href = str(row.href, '#');
        const image = str(row.image);
        return `<a class="dest-card" href="${escapeHtml(href)}"><figure>${
          image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(str(row.name))}" loading="lazy"/>` : ''
        }</figure><div class="dest-card-body"><h3>${escapeHtml(str(row.name))}</h3><p>${escapeHtml(
          str(row.tagline),
        )}</p></div></a>`;
      })
      .join('')}</div></section>`;
  }

  if (type === 'package_cards') {
    const items = Array.isArray(props.items) ? props.items : [];
    return `<section>${sectionHead(props)}<div class="package-grid">${items
      .map((item) => {
        const row = asRecord(item);
        const image = str(row.image);
        return `<article class="package-card"><figure>${
          image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(str(row.name))}" loading="lazy"/>` : ''
        }</figure><div class="package-card-body"><h3 class="section-title" style="font-size:1.2rem">${escapeHtml(
          str(row.name),
        )}</h3><div class="package-meta"><span>${escapeHtml(str(row.price))}</span><span>${escapeHtml(
          str(row.nights),
        )}</span></div>${linesToList(str(row.highlights))}${
          row.ctaLabel
            ? `<a class="btn" href="${escapeHtml(str(row.ctaHref, '#'))}">${escapeHtml(str(row.ctaLabel))}</a>`
            : ''
        }</div></article>`;
      })
      .join('')}</div></section>`;
  }

  if (type === 'itinerary') {
    const items = Array.isArray(props.items) ? props.items : [];
    return `<section>${sectionHead(props)}<div class="itinerary-list">${items
      .map((item) => {
        const row = asRecord(item);
        return `<div class="itinerary-day"><div class="day">${escapeHtml(
          str(row.day),
        )}</div><div><h3>${escapeHtml(str(row.title))}</h3><p>${escapeHtml(str(row.body))}</p></div></div>`;
      })
      .join('')}</div></section>`;
  }

  if (type === 'hotel_highlight') {
    const image = str(props.imageUrl);
    const stars = str(props.stars);
    const cta =
      props.ctaLabel
        ? `<a class="btn" href="${escapeHtml(str(props.ctaHref, '#'))}">${escapeHtml(str(props.ctaLabel))}</a>`
        : '';
    return `<section class="hotel-highlight"><figure>${
      image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(str(props.name))}" loading="lazy"/>` : ''
    }</figure><div class="hotel-highlight-body"><h2 class="section-title">${escapeHtml(
      str(props.name),
    )}</h2>${
      stars ? `<div class="hotel-stars">${'★'.repeat(Math.min(5, Math.max(1, Number(stars) || 4)))}</div>` : ''
    }${props.body ? `<p class="section-lead">${escapeHtml(str(props.body))}</p>` : ''}${linesToList(
      str(props.amenities),
    )}${cta}</div></section>`;
  }

  if (type === 'trip_search_cta') {
    return `<section class="trip-search"><h2 class="section-title">${escapeHtml(
      str(props.title, 'Where to next?'),
    )}</h2>${
      props.body ? `<p class="section-lead">${escapeHtml(str(props.body))}</p>` : ''
    }<div class="trip-search-fields"><div><label>${escapeHtml(
      str(props.destinationLabel, 'Destination'),
    )}</label><input disabled placeholder="e.g. Sri Lanka"/></div><div><label>${escapeHtml(
      str(props.datesLabel, 'Travel dates'),
    )}</label><input disabled placeholder="Month / year"/></div><a class="btn" href="${escapeHtml(
      str(props.ctaHref, '#'),
    )}">${escapeHtml(str(props.ctaLabel, 'Start enquiry'))}</a></div></section>`;
  }

  if (type === 'season_promo') {
    const image = str(props.imageUrl);
    const bg = image
      ? ` style="background-image:linear-gradient(120deg,rgba(0,0,0,.5),rgba(0,0,0,.2)),url('${escapeHtml(image)}')"`
      : '';
    const cta =
      props.ctaLabel
        ? `<a class="btn" href="${escapeHtml(str(props.ctaHref, '#'))}">${escapeHtml(str(props.ctaLabel))}</a>`
        : '';
    return `<section class="season-promo"${bg}><div class="season-promo-inner">${eyebrowHtml(
      props.eyebrow,
    )}<h2 class="section-title" style="color:#fff">${escapeHtml(str(props.title))}</h2>${
      props.body ? `<p style="color:rgba(255,255,255,.88);margin:0 0 1rem">${escapeHtml(str(props.body))}</p>` : ''
    }${cta}</div></section>`;
  }

  if (type === 'trust_badges') {
    const items = Array.isArray(props.items) ? props.items : [];
    return `<section>${
      props.title ? `<h2 class="section-title">${escapeHtml(str(props.title))}</h2>` : ''
    }<div class="trust-grid">${items
      .map((item) => {
        const row = asRecord(item);
        return `<div class="trust-badge"><h3>${escapeHtml(str(row.label))}</h3><p>${escapeHtml(
          str(row.body),
        )}</p></div>`;
      })
      .join('')}</div></section>`;
  }

  if (type === 'enquiry_split') {
    const formKey = str(props.formKey, 'contact');
    const form = formByKey?.get(formKey);
    const fields = Array.isArray(form?.fieldsJson)
      ? (form!.fieldsJson as Array<Record<string, unknown>>)
      : [
          { name: 'name', label: 'Name', type: 'text', required: true },
          { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'message', label: 'Message', type: 'textarea', required: true },
        ];
    const mode = form?.ingestMode || 'contact';
    const formId = `eq_${formKey.replace(/[^a-z0-9_]/gi, '_')}`;
    const script =
      formCtx
        ? `<script>(function(){var form=document.getElementById('${formId}');if(!form)return;form.addEventListener('submit',function(e){e.preventDefault();var fd=new FormData(form);var status=form.querySelector('.form-status');var body={organizationId:${JSON.stringify(
            formCtx.orgRef,
          )},publicKey:${JSON.stringify(formCtx.publicKey)},mode:${JSON.stringify(
            mode,
          )},formKey:${JSON.stringify(
            formKey,
          )},contactName:fd.get('name')||null,email:fd.get('email')||null,phone:fd.get('phone')||null,destinations:fd.get('destinations')||null,message:fd.get('message')||null,idempotencyKey:'eq_'+Date.now()};if(!body.publicKey){if(status)status.textContent='Widget public key not configured.';return;}fetch(${JSON.stringify(
            `${formCtx.apiUrl}/leads/widget/ingest`,
          )},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){if(!r.ok)throw new Error('failed');if(status)status.textContent='Thanks — we received your message.';form.reset();}).catch(function(){if(status)status.textContent='Could not send. Please try again.';});});})();</script>`
        : '';
    return `<section class="enquiry-split"><div>${eyebrowHtml(props.eyebrow)}${
      props.title ? `<h2 class="section-title">${escapeHtml(str(props.title))}</h2>` : ''
    }<div class="enquiry-points">${escapeHtml(str(props.body))}</div></div><section class="form-card"><h3 class="section-title" style="font-size:1.25rem">${escapeHtml(
      str(props.formTitle, form?.name || 'Contact'),
    )}</h3><form id="${formId}">${formFieldsHtml(fields)}<button class="btn" type="submit">Send</button><p class="form-status" style="color:var(--muted);font-size:.875rem;min-height:1.2em"></p></form>${script}</section></section>`;
  }

  if (type === 'gallery_masonry') {
    const images = Array.isArray(props.images) ? props.images : [];
    return `<section>${sectionHead(props)}<div class="masonry-grid">${images
      .map((img) => {
        const row = typeof img === 'string' ? { url: img } : asRecord(img);
        const url = str(row.url);
        return url
          ? `<figure class="masonry-item"><img src="${escapeHtml(url)}" alt="${escapeHtml(
              str(row.alt),
            )}" loading="lazy"/></figure>`
          : '';
      })
      .join('')}</div></section>`;
  }

  if (type === 'route_map') {
    const items = Array.isArray(props.items) ? props.items : [];
    const mapSrc = safeEmbedSrc(str(props.mapEmbedUrl));
    return `<section>${sectionHead(props)}<div class="route-map"><div class="route-stops">${items
      .map((item) => {
        const row = asRecord(item);
        return `<div class="route-stop"><h3>${escapeHtml(str(row.title))}</h3><p>${escapeHtml(
          str(row.body),
        )}</p></div>`;
      })
      .join('')}</div><figure class="contact-map">${
      mapSrc
        ? `<iframe src="${escapeHtml(mapSrc)}" loading="lazy" allowfullscreen></iframe>`
        : '<div style="padding:2rem;color:var(--muted);text-align:center">Optional map embed</div>'
    }</figure></div></section>`;
  }

  return null;
}

import JSZip from 'jszip';

async function zipToFile(zip: JSZip, fileName: string): Promise<File> {
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return new File([blob], fileName, { type: 'application/zip' });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Minimal valid parent theme package for upload demos / docs. */
export async function buildSampleThemePackageZip(): Promise<File> {
  const zip = new JSZip();

  zip.file(
    'theme.json',
    JSON.stringify(
      {
        key: 'sample-coastal',
        name: 'Sample Coastal',
        version: '1.0.0',
        description:
          'Full sample theme — tokens, CSS, chrome, a bundled promo component, and Home + Contact pages.',
        author: 'Wayrune',
        tags: ['sample', 'travel'],
        supports: ['travel', 'marketing'],
        stylesheets: ['styles/theme.css'],
        chrome: {
          header: 'chrome/header.html',
          footer: 'chrome/footer.html',
        },
        preview: 'preview.svg',
        components: [{ path: 'components/sample-promo-banner', key: 'sample-promo-banner' }],
        site: 'site/structure.json',
        installSite: 'create_site',
      },
      null,
      2,
    ),
  );

  zip.file(
    'preview.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f4faf9"/>
      <stop offset="55%" stop-color="#0f766e"/>
      <stop offset="100%" stop-color="#0ea5a4"/>
    </linearGradient>
  </defs>
  <rect width="800" height="400" fill="url(#g)"/>
  <rect x="48" y="56" width="220" height="18" rx="4" fill="#0b1f1c" opacity="0.85"/>
  <rect x="48" y="90" width="140" height="12" rx="3" fill="#0b1f1c" opacity="0.35"/>
  <rect x="48" y="300" width="120" height="36" rx="8" fill="#ffffff"/>
  <text x="48" y="250" fill="#ffffff" font-family="Georgia, serif" font-size="36">Sample Coastal</text>
</svg>
`,
  );

  zip.file(
    'tokens.json',
    JSON.stringify(
      {
        primary: '#0f766e',
        accent: '#0ea5a4',
        background: '#f4faf9',
        foreground: '#0b1f1c',
        muted: '#5b736e',
        surface: '#ffffff',
        fontDisplay: 'Fraunces, Georgia, serif',
        fontBody: '"DM Sans", system-ui, sans-serif',
      },
      null,
      2,
    ),
  );

  zip.file(
    'styles/theme.css',
    `/* Sample Coastal — package CSS (no remote @import / url) */
:root {
  --primary: #0f766e;
  --accent: #0ea5a4;
  --bg: #f4faf9;
  --fg: #0b1f1c;
  --muted: #5b736e;
  --surface: #ffffff;
  --font-display: Fraunces, Georgia, serif;
  --font-body: "DM Sans", system-ui, sans-serif;
}

.sample-theme-chrome {
  font-family: var(--font-body);
  color: var(--fg);
}

.sample-theme-chrome a {
  color: var(--primary);
}
`,
  );

  zip.file(
    'chrome/header.html',
    `<header class="sample-theme-chrome" style="padding:0.75rem 1.25rem;border-bottom:1px solid color-mix(in srgb, var(--primary) 20%, transparent);background:var(--surface)">
  <strong style="font-family:var(--font-display)">Sample Coastal</strong>
</header>
`,
  );

  zip.file(
    'chrome/footer.html',
    `<footer class="sample-theme-chrome" style="padding:1rem 1.25rem;margin-top:2rem;border-top:1px solid color-mix(in srgb, var(--primary) 20%, transparent);font-size:0.875rem;color:var(--muted)">
  Sample theme package · replace with your brand
</footer>
`,
  );

  zip.file(
    'README.md',
    `# Sample Coastal theme

Upload this ZIP from Digital Presence → Themes → Upload theme ZIP.

A theme can include:
- theme.json, tokens.json, styles/ (look)
- components/*/ (optional bundled components)
- site/structure.json (optional pages — installSite: create_site)
`,
  );

  zip.file(
    'components/sample-promo-banner/component.json',
    JSON.stringify(
      {
        key: 'sample-promo-banner',
        name: 'Sample Promo Banner',
        version: '1.0.0',
        category: 'content',
        rendererKind: 'package',
        entry: { html: 'index.html', css: ['styles.css'], js: ['index.js'] },
        schema: [{ key: 'title', label: 'Title', type: 'text', required: true }],
        defaultProps: { title: 'Welcome from the sample theme' },
        preview: 'preview.svg',
      },
      null,
      2,
    ),
  );
  zip.file('components/sample-promo-banner/index.html', '<div id="root"></div>\n');
  zip.file(
    'components/sample-promo-banner/styles.css',
    `.promo{padding:1.5rem;border-radius:12px;background:#0f766e22;}\n`,
  );
  zip.file(
    'components/sample-promo-banner/index.js',
    `(function(){window.PresenceMount=function(el,props){el.innerHTML='<section class="promo"><h2>'+((props&&props.title)||'Promo')+'</h2></section>';};})();\n`,
  );
  zip.file(
    'components/sample-promo-banner/preview.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#134e4a"/><text x="24" y="110" fill="#fff" font-size="20">Promo</text></svg>\n`,
  );

  zip.file(
    'site/structure.json',
    JSON.stringify(
      {
        navigation: [
          { label: 'Home', href: '/' },
          { label: 'Contact', href: '/contact' },
        ],
        globalRegions: {
          header: { showNav: true, ctaLabel: 'Enquire' },
          footer: { secondaryNote: 'Sample Coastal theme' },
        },
        pages: [
          {
            path: '/',
            title: 'Home',
            layoutMode: 'flow',
            sections: [
              {
                ref: 's0',
                parentRef: null,
                type: 'hero',
                moduleKey: 'hero',
                position: 0,
                propsJson: {
                  eyebrow: 'Sample theme',
                  headline: 'Your coastal brand site',
                  subhead: 'Installed from a full theme ZIP.',
                  ctaLabel: 'Contact us',
                  ctaHref: '/contact',
                },
              },
              {
                ref: 's1',
                parentRef: null,
                type: 'sample-promo-banner',
                moduleKey: 'sample-promo-banner',
                position: 1,
                propsJson: { title: 'Custom component from the theme' },
              },
            ],
          },
          {
            path: '/contact',
            title: 'Contact',
            layoutMode: 'flow',
            sections: [
              {
                ref: 'c0',
                parentRef: null,
                type: 'form',
                moduleKey: 'form',
                position: 0,
                propsJson: {
                  title: 'Get in touch',
                  body: 'We will reply shortly.',
                  formKey: 'contact',
                },
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
  );

  return zipToFile(zip, 'sample-coastal-theme.zip');
}

/** Minimal valid component package (PresenceMount) for upload demos. */
export async function buildSampleComponentPackageZip(): Promise<File> {
  const zip = new JSZip();

  zip.file(
    'component.json',
    JSON.stringify(
      {
        key: 'sample-promo-banner',
        name: 'Sample Promo Banner',
        version: '1.0.0',
        description: 'Starter component ZIP — title + body with PresenceMount.',
        category: 'content',
        rendererKind: 'package',
        entry: {
          html: 'index.html',
          css: ['styles.css'],
          js: ['index.js'],
        },
        preview: 'preview.svg',
        schema: [
          { key: 'title', label: 'Title', type: 'text', required: true },
          { key: 'body', label: 'Body', type: 'textarea', required: false },
        ],
        defaultProps: {
          title: 'Your next trip starts here',
          body: 'Tell us where you want to go.',
        },
      },
      null,
      2,
    ),
  );

  zip.file(
    'preview.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
  <rect width="800" height="400" fill="#0f172a"/>
  <rect x="64" y="120" width="672" height="160" rx="16" fill="#0f766e" opacity="0.25" stroke="#14b8a6"/>
  <text x="96" y="190" fill="#e2e8f0" font-family="system-ui,sans-serif" font-size="32" font-weight="600">Sample Promo Banner</text>
  <text x="96" y="230" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="18">Title + body · PresenceMount</text>
</svg>
`,
  );

  zip.file('index.html', '<div id="root"></div>\n');

  zip.file(
    'styles.css',
    `.promo {
  padding: 1.5rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary, #0f766e) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary, #0f766e) 35%, transparent);
  font-family: var(--font-body, system-ui, sans-serif);
}
.promo h2 {
  margin: 0 0 0.5rem;
  font-family: var(--font-display, Georgia, serif);
  color: var(--fg, #0f172a);
}
.promo p {
  margin: 0;
  color: var(--muted, #64748b);
}
`,
  );

  zip.file(
    'index.js',
    `(function () {
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  window.PresenceMount = function (el, props) {
    var title = escapeHtml(props && props.title ? props.title : 'Promo');
    var body = escapeHtml(props && props.body ? props.body : '');
    el.innerHTML =
      '<section class="promo"><h2>' +
      title +
      '</h2>' +
      (body ? '<p>' + body + '</p>' : '') +
      '</section>';
  };
})();
`,
  );

  zip.file(
    'README.md',
    `# Sample Promo Banner

Upload this ZIP from Digital Presence → Components → Upload component ZIP.

Requires PresenceMount in index.js when JS is present.
`,
  );

  return zipToFile(zip, 'sample-promo-banner-component.zip');
}

export async function downloadSampleThemePackage() {
  const file = await buildSampleThemePackageZip();
  downloadBlob(file, file.name);
  return file;
}

export async function downloadSampleComponentPackage() {
  const file = await buildSampleComponentPackageZip();
  downloadBlob(file, file.name);
  return file;
}

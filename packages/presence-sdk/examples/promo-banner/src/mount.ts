/**
 * Presence package mount — built as IIFE → dist/index.js.
 * Do not upload TypeScript; only the built package.
 */
type Props = {
  title?: string;
  body?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mount(el: HTMLElement, props: Props = {}) {
  const title = escapeHtml(props.title || 'Promo');
  const body = escapeHtml(props.body || '');
  el.innerHTML =
    '<section class="promo"><h2>' +
    title +
    '</h2>' +
    (body ? '<p>' + body + '</p>' : '') +
    '</section>';
}

(window as unknown as { PresenceMount: typeof mount }).PresenceMount = mount;

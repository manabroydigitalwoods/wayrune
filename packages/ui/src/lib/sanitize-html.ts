import DOMPurify from 'dompurify';

const ALLOWED_TAGS = ['p', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'a', 'br', 'img', 'span'];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'class'];

export function sanitizeRichHtml(html: string): string {
  if (!html) return '';
  if (typeof window === 'undefined') return html;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isEmptyRichHtml(html: string): boolean {
  return !stripHtml(html) && !/<img\b/i.test(html);
}

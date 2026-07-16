import { useMemo } from 'react';
import { cn } from '../../lib/utils';
import { sanitizeRichHtml } from '../../lib/sanitize-html';

export function RichTextContent({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const clean = useMemo(() => sanitizeRichHtml(html), [html]);
  if (!clean) return null;
  return (
    <div
      className={cn(
        'rich-text-content prose prose-sm max-w-none text-foreground',
        '[&_a]:text-primary [&_a]:underline',
        '[&_img]:my-2 [&_img]:max-h-64 [&_img]:rounded-md [&_img]:border [&_img]:border-border',
        '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_p]:my-1.5',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

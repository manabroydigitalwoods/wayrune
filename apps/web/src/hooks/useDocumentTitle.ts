import { useEffect } from 'react';

const BRAND_SUFFIX = 'Wayrune';

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title.includes(BRAND_SUFFIX) ? title : `${title} · ${BRAND_SUFFIX}`;
  }, [title]);
}

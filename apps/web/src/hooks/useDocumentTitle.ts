import { useEffect } from 'react';

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title.includes('CodePoetry') ? title : `${title} · CodePoetry Travel`;
  }, [title]);
}

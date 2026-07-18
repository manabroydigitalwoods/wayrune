import { getPageOrFallback } from '@/lib/site';
import { StructurePage } from './StructurePage';

export function AboutPage() {
  return <StructurePage page={getPageOrFallback('/about')} />;
}

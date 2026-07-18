import { getPageOrFallback } from '@/lib/site';
import { StructurePage } from './StructurePage';

export function ContactPage() {
  return <StructurePage page={getPageOrFallback('/contact')} />;
}

import { getPageOrFallback } from '@/lib/site';
import { StructurePage } from './StructurePage';

export function HomePage() {
  return <StructurePage page={getPageOrFallback('/')} />;
}

import { getPageOrFallback } from '@/lib/site';
import { StructurePage } from './StructurePage';

export function DestinationsPage() {
  return <StructurePage page={getPageOrFallback('/destinations')} />;
}

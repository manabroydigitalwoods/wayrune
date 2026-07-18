import { getPageOrFallback } from '@/lib/site';
import { StructurePage } from './StructurePage';

export function TripsPage() {
  return <StructurePage page={getPageOrFallback('/trips')} />;
}

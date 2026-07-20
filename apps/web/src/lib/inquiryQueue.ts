import type { InquiriesPageVariant } from './agencyPageVariants';

export type InquiryQueueApiParam = 'my_requests' | 'planning' | 'active';

export function inquiryQueueForVariant(
  variant: InquiriesPageVariant,
): InquiryQueueApiParam | undefined {
  switch (variant) {
    case 'requests':
      return 'my_requests';
    case 'planning':
      return 'planning';
    case 'sales':
      return 'active';
    default:
      return undefined;
  }
}

export function buildInquiriesListQuery(input: {
  variant: InquiriesPageVariant;
  incomplete?: boolean;
  unassigned?: boolean;
  pageSize?: number;
}): string {
  const params = new URLSearchParams();
  params.set('pageSize', String(input.pageSize ?? 100));
  const queue = inquiryQueueForVariant(input.variant);
  if (queue) params.set('queue', queue);
  if (input.incomplete) params.set('incomplete', '1');
  if (input.unassigned) params.set('ownerId', 'unassigned');
  return params.toString();
}

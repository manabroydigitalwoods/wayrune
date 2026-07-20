import { rateVersionLabel } from './rate-version-chain';

export type RateTipActivationEntityType =
  | 'supplier_hotel_rate'
  | 'transfer_fare'
  | 'supplier_activity_rate';

export function rateTipActivationSupplierLinkPath(
  supplierId: string | null,
): string {
  return supplierId
    ? `/suppliers/${supplierId}#supplier-rate-chart`
    : `/rates`;
}

export function rateTipActivationTaskTitle(opts: {
  product: 'hotel' | 'transfer' | 'activity';
  versionNumber: number;
  detail?: string | null;
}): string {
  const v = rateVersionLabel(opts.versionNumber);
  if (opts.product === 'hotel') {
    const room = opts.detail?.trim() || 'Room';
    return `Activate hotel rate ${v} · ${room}`;
  }
  if (opts.product === 'transfer') {
    return `Activate transfer fare ${v}`;
  }
  const name = opts.detail?.trim() || 'Activity';
  return `Activate activity rate ${v} · ${name}`;
}

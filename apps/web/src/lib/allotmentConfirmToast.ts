/** Toast suffix for Ops / partner confirm inventory sync. */
export function allotmentConfirmToastCue(res: {
  allotmentUpgraded?: boolean;
  allotmentQuantityResynced?: boolean;
  allotmentDatesResynced?: boolean;
  allotmentAssetRebound?: boolean;
  allotmentRoomProductRematched?: boolean;
  allotmentFleetWindowResynced?: boolean;
  allotmentOrphanReleased?: boolean;
  allotmentSyncFailed?: string | null;
}): string {
  if (res.allotmentSyncFailed) {
    return ` · allotment not synced — ${res.allotmentSyncFailed}`;
  }
  const parts: string[] = [];
  if (res.allotmentUpgraded) parts.push('allotment confirmed');
  if (res.allotmentOrphanReleased) parts.push('allotment released');
  if (res.allotmentAssetRebound) parts.push('property rebound');
  if (res.allotmentRoomProductRematched) parts.push('room product synced');
  if (res.allotmentDatesResynced) parts.push('stay dates synced');
  if (res.allotmentFleetWindowResynced) parts.push('transfer window synced');
  if (res.allotmentQuantityResynced) parts.push('rooms qty synced');
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

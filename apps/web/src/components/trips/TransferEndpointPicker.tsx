import { PlaceSinglePicker } from '../places/PlacePicker';
import {
  TRANSFER_DROP_PURPOSE,
  TRANSFER_PICKUP_PURPOSE,
  applyTransferEndpointSelection,
  transferEndpointIsLinked,
  transferEndpointLegacyLabel,
  transferEndpointPickerValue,
  type TransferEndpointSnapshot,
} from '../../lib/transferEndpointRefs';
import type { PlaceSearchPurpose } from '@wayrune/contracts';

/**
 * Transfer From/To picker — catalog IDs only, no invent.
 * Name-only historical endpoints stay visible until the employee selects a Place.
 */
export function TransferEndpointPicker({
  endpoint,
  label,
  placeId,
  placeName,
  onChange,
}: {
  endpoint: 'pickup' | 'drop';
  label: string;
  placeId?: string | null;
  placeName?: string | null;
  onChange: (next: TransferEndpointSnapshot) => void;
}) {
  const purpose: PlaceSearchPurpose =
    endpoint === 'pickup' ? TRANSFER_PICKUP_PURPOSE : TRANSFER_DROP_PURPOSE;
  const linked = transferEndpointIsLinked(placeId);
  const legacy = !linked ? transferEndpointLegacyLabel(placeName) : null;

  return (
    <div className="space-y-1" data-testid={`transfer-endpoint-${endpoint}`}>
      {legacy ? (
        <p
          className="text-[11px] text-muted-foreground"
          data-testid={`transfer-endpoint-legacy-${endpoint}`}
        >
          <span className="font-medium text-foreground">{legacy}</span>
          <br />
          Not linked to Places catalog
        </p>
      ) : null}
      <PlaceSinglePicker
        label={label}
        purpose={purpose}
        value={transferEndpointPickerValue(placeId, placeName)}
        onChange={(ref) => onChange(applyTransferEndpointSelection(ref))}
        placeholder={
          endpoint === 'pickup' ? 'Select pickup…' : 'Select drop…'
        }
        // Intentionally no onCreateNew — transfer endpoints are catalog-only (Step 5).
      />
    </div>
  );
}

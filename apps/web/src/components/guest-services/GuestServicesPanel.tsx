import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { reportError } from '../../lib/errors';
import { GuestLinksPanel, type GsLocation } from './GuestLinksPanel';
import { GuestMenuPanel, type GsOffering } from './GuestMenuPanel';
import { GuestOrderBoard, type GsOrder } from './GuestOrderBoard';
import { GuestSettingsPanel } from './GuestSettingsPanel';

export type GuestCompanionSection =
  | 'qr_locations'
  | 'guest_menu'
  | 'live_tickets'
  | 'companion_settings';

export function GuestServicesPanel({
  assetId,
  orgKind,
  section,
}: {
  assetId: string;
  orgKind?: string | null;
  section: GuestCompanionSection;
}) {
  const isRestaurant = orgKind === 'restaurant';
  const { me } = useAuth();
  const [locations, setLocations] = useState<GsLocation[]>([]);
  const [offerings, setOfferings] = useState<GsOffering[]>([]);
  const [orders, setOrders] = useState<GsOrder[]>([]);
  const [sessions, setSessions] = useState<
    Array<{ id: string; serviceLocation: { id: string; label: string }; guestCount: number }>
  >([]);

  const load = useCallback(async () => {
    try {
      const [locs, offs, ords, sess] = await Promise.all([
        api<GsLocation[]>(`/guest-services/assets/${assetId}/locations`),
        api<GsOffering[]>(`/guest-services/assets/${assetId}/offerings`),
        api<GsOrder[]>(
          `/guest-services/assets/${assetId}/orders?board=${isRestaurant ? 'kitchen' : 'host'}`,
        ),
        isRestaurant
          ? api<typeof sessions>(`/guest-services/assets/${assetId}/sessions`)
          : Promise.resolve([]),
      ]);
      setLocations(locs);
      setOfferings(offs);
      setOrders(ords);
      setSessions(sess);
    } catch (e) {
      reportError(e, 'Could not load Guest Companion');
    }
  }, [assetId, isRestaurant]);

  useEffect(() => {
    void load();
  }, [load]);

  if (section === 'qr_locations') {
    return (
      <GuestLinksPanel
        assetId={assetId}
        isRestaurant={isRestaurant}
        locations={locations}
        sessions={sessions}
        businessName={me?.organization?.name || 'Guest order'}
        onChanged={load}
      />
    );
  }
  if (section === 'guest_menu') {
    return <GuestMenuPanel assetId={assetId} offerings={offerings} onChanged={load} />;
  }
  if (section === 'live_tickets') {
    return (
      <GuestOrderBoard assetId={assetId} orders={orders} onChanged={load} />
    );
  }
  return <GuestSettingsPanel isRestaurant={isRestaurant} />;
}

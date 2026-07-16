import { useCallback, useEffect, useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import { Button, Card, CardContent, Input, SimpleFormField as FormField, toastError, toastSuccess } from '@travel/ui';
import { api } from '../../api';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { usePermissions } from '../../lib/permissions';

type Floor = {
  id: string;
  name: string;
  level: number;
};

type Building = {
  id: string;
  name: string;
  floors: Floor[];
};

export function StayPropertyStructurePanel({ assetId }: { assetId: string }) {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingName, setBuildingName] = useState('');
  const [floorDrafts, setFloorDrafts] = useState<Record<string, string>>({});
  const { hasAny } = usePermissions();
  const canManage = hasAny(CAP.inventoryManage);

  const load = useCallback(async () => {
    try {
      const rows = await api<Building[]>(`/commerce/assets/${assetId}/buildings`);
      setBuildings(rows);
    } catch (e) {
      reportError(e, 'Could not load buildings');
    }
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addBuilding() {
    if (!buildingName.trim()) {
      toastError('Enter a building name');
      return;
    }
    try {
      await api('/commerce/buildings', {
        method: 'POST',
        body: JSON.stringify({ assetId, name: buildingName.trim() }),
      });
      toastSuccess('Building added');
      setBuildingName('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add building');
    }
  }

  async function addFloor(buildingId: string) {
    const name = (floorDrafts[buildingId] || '').trim();
    if (!name) {
      toastError('Enter a floor name');
      return;
    }
    const building = buildings.find((b) => b.id === buildingId);
    const level = building?.floors.length || 0;
    try {
      await api(`/commerce/buildings/${buildingId}/floors`, {
        method: 'POST',
        body: JSON.stringify({ name, level }),
      });
      toastSuccess('Floor added');
      setFloorDrafts((d) => ({ ...d, [buildingId]: '' }));
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add floor');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="size-5 text-primary" />
        <div>
          <h2 className="text-sm font-semibold">Property structure</h2>
          <p className="text-xs text-muted-foreground">Buildings and floors for this property.</p>
        </div>
      </div>
      {canManage ? (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <FormField label="New building">
              <Input
                value={buildingName}
                onChange={(e) => setBuildingName(e.target.value)}
                placeholder="Main block"
              />
            </FormField>
            <Button type="button" size="sm" onClick={() => void addBuilding()}>
              <Plus className="size-4" />
              Add building
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {buildings.map((b) => (
          <Card key={b.id}>
            <CardContent className="space-y-3 pt-4">
              <h3 className="text-sm font-semibold">{b.name}</h3>
              <ul className="space-y-1.5">
                {b.floors.map((f) => (
                  <li
                    key={f.id}
                    className="rounded-lg border border-border/60 px-2.5 py-1.5 text-sm"
                  >
                    {f.name}
                    <span className="ml-1.5 text-xs text-muted-foreground">Lvl {f.level}</span>
                  </li>
                ))}
                {!b.floors.length ? (
                  <li className="text-xs text-muted-foreground">No floors yet.</li>
                ) : null}
              </ul>
              {canManage ? (
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    value={floorDrafts[b.id] || ''}
                    onChange={(e) =>
                      setFloorDrafts((d) => ({ ...d, [b.id]: e.target.value }))
                    }
                    placeholder="Floor name (e.g. 1st Floor)"
                  />
                  <Button size="sm" variant="secondary" onClick={() => void addFloor(b.id)}>
                    Add floor
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
        {!buildings.length ? (
          <p className="text-sm text-muted-foreground">No buildings yet.</p>
        ) : null}
      </div>
    </div>
  );
}

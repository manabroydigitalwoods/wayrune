/**
 * System transfer fare seeds + cluster definitions for cartesian matrix generation.
 * Costs are curated estimates (INR, per_vehicle) editable by platform admin.
 */

export type SystemVehicleRateBand = {
  inrPerKm: number;
  minFare: number;
};

/** ₹/km bands used for Google/edge distance suggestions. */
export const SYSTEM_VEHICLE_RATE_BANDS: Record<string, SystemVehicleRateBand> = {
  'hatchback-sedan': { inrPerKm: 22, minFare: 1200 },
  'suv-innova': { inrPerKm: 28, minFare: 1800 },
  'tempo-traveller-12': { inrPerKm: 36, minFare: 3200 },
  'tempo-traveller-17': { inrPerKm: 42, minFare: 4000 },
  'mini-bus': { inrPerKm: 48, minFare: 5000 },
  'ac-coach': { inrPerKm: 55, minFare: 7000 },
};

export type SystemFareCluster = {
  key: string;
  name: string;
  /** Place keys (cities + landmarks) for cartesian pairs. */
  placeKeys: string[];
  vehicleTypeKeys: string[];
  /** Skip pairs above this distance when generating from edges/haversine. */
  maxDistanceKm?: number;
};

export const SYSTEM_FARE_CLUSTERS: SystemFareCluster[] = [
  {
    key: 'darjeeling-hills',
    name: 'Darjeeling hills',
    placeKeys: [
      'darjeeling',
      'kalimpong',
      'kurseong',
      'siliguri',
      'tiger-hill',
      'batasia-loop',
      'mall-road-darjeeling',
      'peace-pagoda-darjeeling',
      'ghoom-monastery',
      'delo-hill',
      'durpin-monastery',
    ],
    vehicleTypeKeys: ['hatchback-sedan', 'suv-innova', 'tempo-traveller-12'],
    maxDistanceKm: 120,
  },
  {
    key: 'gangtok-day-trips',
    name: 'Gangtok day trips',
    placeKeys: [
      'gangtok',
      'mg-marg-gangtok',
      'tsomgo-lake',
      'baba-mandir',
      'rumtek-monastery',
      'nathula-pass',
      'pelling',
      'namchi',
      'ravangla',
    ],
    vehicleTypeKeys: ['hatchback-sedan', 'suv-innova', 'tempo-traveller-12'],
    maxDistanceKm: 160,
  },
  {
    key: 'guwahati-meghalaya',
    name: 'Guwahati–Shillong–Sohra',
    placeKeys: [
      'guwahati',
      'shillong',
      'sohra',
      'dawki',
      'kamakhya-temple',
      'elephant-falls',
      'living-root-bridge-nongriat',
    ],
    vehicleTypeKeys: ['hatchback-sedan', 'suv-innova', 'tempo-traveller-12'],
    maxDistanceKm: 200,
  },
  {
    key: 'kaziranga-leg',
    name: 'Kaziranga corridor',
    placeKeys: ['guwahati', 'kaziranga', 'tezpur', 'jorhat'],
    vehicleTypeKeys: ['suv-innova', 'tempo-traveller-12'],
    maxDistanceKm: 280,
  },
];

export type SystemTransferFareSeed = {
  fromKey: string;
  toKey: string;
  vehicleTypeKey: string;
  unitCost: number;
  childUnitCost?: number | null;
  pricingMode?: 'per_vehicle' | 'per_adult';
  currency?: string;
};

/** Explicit corridor hubs — always seeded even outside clusters. */
export const SYSTEM_TRANSFER_FARE_CORRIDORS: SystemTransferFareSeed[] = [
  // Bagdogra / NJP / Siliguri ↔ hills
  { fromKey: 'bagdogra-airport', toKey: 'darjeeling', vehicleTypeKey: 'suv-innova', unitCost: 4500 },
  { fromKey: 'darjeeling', toKey: 'bagdogra-airport', vehicleTypeKey: 'suv-innova', unitCost: 4200 },
  { fromKey: 'bagdogra-airport', toKey: 'darjeeling', vehicleTypeKey: 'hatchback-sedan', unitCost: 3500 },
  { fromKey: 'darjeeling', toKey: 'bagdogra-airport', vehicleTypeKey: 'hatchback-sedan', unitCost: 3200 },
  { fromKey: 'bagdogra-airport', toKey: 'darjeeling', vehicleTypeKey: 'tempo-traveller-12', unitCost: 7500 },
  { fromKey: 'new-jalpaiguri-railway', toKey: 'darjeeling', vehicleTypeKey: 'suv-innova', unitCost: 4300 },
  { fromKey: 'darjeeling', toKey: 'new-jalpaiguri-railway', vehicleTypeKey: 'suv-innova', unitCost: 4000 },
  { fromKey: 'siliguri', toKey: 'darjeeling', vehicleTypeKey: 'suv-innova', unitCost: 4000 },
  { fromKey: 'darjeeling', toKey: 'siliguri', vehicleTypeKey: 'suv-innova', unitCost: 3800 },
  { fromKey: 'bagdogra-airport', toKey: 'kalimpong', vehicleTypeKey: 'suv-innova', unitCost: 4800 },
  { fromKey: 'kalimpong', toKey: 'bagdogra-airport', vehicleTypeKey: 'suv-innova', unitCost: 4500 },
  { fromKey: 'bagdogra-airport', toKey: 'gangtok', vehicleTypeKey: 'suv-innova', unitCost: 5500 },
  { fromKey: 'gangtok', toKey: 'bagdogra-airport', vehicleTypeKey: 'suv-innova', unitCost: 5200 },
  { fromKey: 'new-jalpaiguri-railway', toKey: 'gangtok', vehicleTypeKey: 'suv-innova', unitCost: 5300 },
  { fromKey: 'gangtok', toKey: 'new-jalpaiguri-railway', vehicleTypeKey: 'suv-innova', unitCost: 5000 },
  { fromKey: 'pakyong-airport', toKey: 'gangtok', vehicleTypeKey: 'suv-innova', unitCost: 2500 },
  { fromKey: 'gangtok', toKey: 'pakyong-airport', vehicleTypeKey: 'suv-innova', unitCost: 2300 },
  // Hill circuit
  { fromKey: 'darjeeling', toKey: 'kalimpong', vehicleTypeKey: 'suv-innova', unitCost: 3500 },
  { fromKey: 'kalimpong', toKey: 'darjeeling', vehicleTypeKey: 'suv-innova', unitCost: 3500 },
  { fromKey: 'darjeeling', toKey: 'gangtok', vehicleTypeKey: 'suv-innova', unitCost: 4500 },
  { fromKey: 'gangtok', toKey: 'darjeeling', vehicleTypeKey: 'suv-innova', unitCost: 4500 },
  { fromKey: 'kalimpong', toKey: 'gangtok', vehicleTypeKey: 'suv-innova', unitCost: 3800 },
  { fromKey: 'gangtok', toKey: 'kalimpong', vehicleTypeKey: 'suv-innova', unitCost: 3800 },
  // Guwahati hub
  { fromKey: 'guwahati-airport', toKey: 'guwahati', vehicleTypeKey: 'suv-innova', unitCost: 1200 },
  { fromKey: 'guwahati', toKey: 'guwahati-airport', vehicleTypeKey: 'suv-innova', unitCost: 1100 },
  { fromKey: 'guwahati', toKey: 'shillong', vehicleTypeKey: 'suv-innova', unitCost: 4500 },
  { fromKey: 'shillong', toKey: 'guwahati', vehicleTypeKey: 'suv-innova', unitCost: 4300 },
  { fromKey: 'guwahati', toKey: 'kaziranga', vehicleTypeKey: 'suv-innova', unitCost: 7000 },
  { fromKey: 'kaziranga', toKey: 'guwahati', vehicleTypeKey: 'suv-innova', unitCost: 6800 },
  { fromKey: 'shillong', toKey: 'sohra', vehicleTypeKey: 'suv-innova', unitCost: 2800 },
  { fromKey: 'sohra', toKey: 'shillong', vehicleTypeKey: 'suv-innova', unitCost: 2700 },
  { fromKey: 'shillong', toKey: 'dawki', vehicleTypeKey: 'suv-innova', unitCost: 3500 },
  { fromKey: 'dawki', toKey: 'shillong', vehicleTypeKey: 'suv-innova', unitCost: 3400 },
];

/**
 * Build cluster cartesian seeds from distance bands (no Google at seed time).
 * unitCost = max(minFare, estimateKm * inrPerKm) with curated estimateKm table.
 */
export function buildClusterFareSeeds(
  estimateKmByPair: Record<string, number> = CLUSTER_PAIR_KM_ESTIMATES,
): SystemTransferFareSeed[] {
  const out: SystemTransferFareSeed[] = [];
  const seen = new Set<string>();

  for (const cluster of SYSTEM_FARE_CLUSTERS) {
    const maxKm = cluster.maxDistanceKm ?? 200;
    for (const fromKey of cluster.placeKeys) {
      for (const toKey of cluster.placeKeys) {
        if (fromKey === toKey) continue;
        const pairKey = `${fromKey}|${toKey}`;
        const revKey = `${toKey}|${fromKey}`;
        const km =
          estimateKmByPair[pairKey] ??
          estimateKmByPair[revKey] ??
          DEFAULT_CLUSTER_KM;
        if (km > maxKm) continue;
        for (const vehicleTypeKey of cluster.vehicleTypeKeys) {
          const dedupe = `${fromKey}|${toKey}|${vehicleTypeKey}`;
          if (seen.has(dedupe)) continue;
          seen.add(dedupe);
          const band =
            SYSTEM_VEHICLE_RATE_BANDS[vehicleTypeKey] ||
            SYSTEM_VEHICLE_RATE_BANDS['suv-innova'];
          const unitCost = Math.max(
            band.minFare,
            Math.round(km * band.inrPerKm),
          );
          out.push({
            fromKey,
            toKey,
            vehicleTypeKey,
            unitCost,
            pricingMode: 'per_vehicle',
          });
        }
      }
    }
  }
  return out;
}

const DEFAULT_CLUSTER_KM = 25;

/** Curated km estimates for landmark/city pairs (symmetric lookups allowed). */
export const CLUSTER_PAIR_KM_ESTIMATES: Record<string, number> = {
  'darjeeling|tiger-hill': 14,
  'darjeeling|batasia-loop': 6,
  'darjeeling|mall-road-darjeeling': 2,
  'darjeeling|peace-pagoda-darjeeling': 4,
  'darjeeling|ghoom-monastery': 8,
  'darjeeling|kalimpong': 50,
  'darjeeling|kurseong': 30,
  'darjeeling|siliguri': 65,
  'kalimpong|delo-hill': 8,
  'kalimpong|durpin-monastery': 6,
  'kalimpong|siliguri': 70,
  'kurseong|siliguri': 35,
  'tiger-hill|batasia-loop': 10,
  'tiger-hill|ghoom-monastery': 8,
  'gangtok|mg-marg-gangtok': 2,
  'gangtok|tsomgo-lake': 40,
  'gangtok|baba-mandir': 55,
  'gangtok|rumtek-monastery': 24,
  'gangtok|nathula-pass': 56,
  'gangtok|pelling': 115,
  'gangtok|namchi': 80,
  'gangtok|ravangla': 65,
  'tsomgo-lake|baba-mandir': 18,
  'tsomgo-lake|nathula-pass': 20,
  'pelling|namchi': 70,
  'pelling|ravangla': 50,
  'namchi|ravangla': 28,
  'guwahati|kamakhya-temple': 10,
  'guwahati|shillong': 100,
  'guwahati|kaziranga': 220,
  'guwahati|tezpur': 180,
  'shillong|sohra': 55,
  'shillong|dawki': 80,
  'shillong|elephant-falls': 12,
  'sohra|living-root-bridge-nongriat': 18,
  'sohra|dawki': 50,
  'kaziranga|tezpur': 90,
  'kaziranga|jorhat': 95,
  'tezpur|jorhat': 180,
};

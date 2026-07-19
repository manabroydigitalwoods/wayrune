/** Sample FIT quote-template pack for empty agencies (first-quote walkthrough). */

export const FIT_TEMPLATES_PACK_ID = 'fit_templates_v1' as const;

export type StarterPackTemplateSpec = {
  name: string;
  contentJson: Record<string, unknown>;
};

export type StarterPackCatalogItem = {
  id: typeof FIT_TEMPLATES_PACK_ID;
  label: string;
  detail: string;
  creates: {
    quoteTemplates: string[];
    demoTrips?: string[];
  };
};

/** Darjeeling + Goa priced packages (mirrors prisma seed templateSpecs). */
export const FIT_TEMPLATE_SPECS: StarterPackTemplateSpec[] = [
  {
    name: 'Darjeeling classic FIT',
    contentJson: {
      currency: 'INR',
      destinationHint: 'Darjeeling',
      tags: ['hill', 'family'],
      folder: 'Hill stations/Darjeeling',
      inclusions: [
        'Private transfers (IXB–Darjeeling–Kalimpong–IXB)',
        '2N Darjeeling + 1N Kalimpong on twin sharing',
        'Breakfast daily',
        'Toy train / local sightseeing as listed',
      ],
      exclusions: ['Flights', 'Lunch & dinner', 'Personal expenses', 'Monument fees'],
      terms:
        'Pay 40% to confirm. Balance 7 days before travel. Rates subject to hotel availability.',
      items: [
        {
          id: 'pack-dj-t1',
          description: 'Day 1: Bagdogra Airport → Darjeeling',
          quantity: 1,
          unitCost: 3200,
          unitSell: 4000,
          taxPercent: 5,
          pricingUnit: 'per_service',
          serviceType: 'transfer',
          rateKind: 'transfer',
          details: {
            fromPlaceName: 'Bagdogra (IXB)',
            toPlaceName: 'Darjeeling',
            vehicleLabel: 'Sedan',
            vehicles: 1,
            priceSource: 'manual',
          },
        },
        {
          id: 'pack-dj-h1',
          description: 'Day 1–3: Darjeeling boutique stay',
          quantity: 2,
          unitCost: 4500,
          unitSell: 5400,
          taxPercent: 5,
          pricingUnit: 'per_room',
          serviceType: 'hotel',
          rateKind: 'hotel',
          details: {
            placeName: 'Darjeeling',
            propertyName: 'Heritage boutique hotel',
            roomType: 'Deluxe mountain view',
            mealPlan: 'CP',
            nights: 2,
            rooms: 1,
            priceSource: 'manual',
          },
        },
        {
          id: 'pack-dj-a1',
          description: 'Day 2: Tiger Hill sunrise + local sightseeing',
          quantity: 2,
          unitCost: 800,
          unitSell: 1200,
          taxPercent: 5,
          pricingUnit: 'per_person',
          serviceType: 'activity',
          details: {
            placeName: 'Darjeeling',
            privateOrSic: 'private',
            priceSource: 'manual',
          },
        },
        {
          id: 'pack-dj-t2',
          description: 'Day 3: Darjeeling → Kalimpong',
          quantity: 1,
          unitCost: 2800,
          unitSell: 3500,
          taxPercent: 5,
          pricingUnit: 'per_service',
          serviceType: 'transfer',
          rateKind: 'transfer',
          details: {
            fromPlaceName: 'Darjeeling',
            toPlaceName: 'Kalimpong',
            vehicleLabel: 'Sedan',
            vehicles: 1,
            priceSource: 'manual',
          },
        },
        {
          id: 'pack-dj-h2',
          description: 'Day 3–4: Kalimpong boutique stay',
          quantity: 1,
          unitCost: 4200,
          unitSell: 5200,
          taxPercent: 5,
          pricingUnit: 'per_room',
          serviceType: 'hotel',
          rateKind: 'hotel',
          details: {
            placeName: 'Kalimpong',
            propertyName: 'Hillside boutique hotel',
            roomType: 'Deluxe',
            mealPlan: 'CP',
            nights: 1,
            rooms: 1,
            priceSource: 'manual',
          },
        },
        {
          id: 'pack-dj-t3',
          description: 'Day 4: Kalimpong → Bagdogra Airport',
          quantity: 1,
          unitCost: 3000,
          unitSell: 3800,
          taxPercent: 5,
          pricingUnit: 'per_service',
          serviceType: 'transfer',
          rateKind: 'transfer',
          details: {
            fromPlaceName: 'Kalimpong',
            toPlaceName: 'Bagdogra (IXB)',
            vehicleLabel: 'Sedan',
            vehicles: 1,
            priceSource: 'manual',
          },
        },
      ],
    },
  },
  {
    name: 'Goa beach FIT',
    contentJson: {
      currency: 'INR',
      destinationHint: 'Goa',
      tags: ['beach', 'honeymoon'],
      folder: 'Beach/Goa',
      inclusions: [
        'Airport transfers (GOI)',
        '3N North Goa hotel on twin sharing',
        'Breakfast daily',
        'Half-day North Goa sightseeing',
      ],
      exclusions: ['Flights', 'Water sports', 'Lunch & dinner', 'Personal expenses'],
      terms:
        'Pay 50% to confirm. Balance before check-in. Peak-season supplements may apply.',
      items: [
        {
          id: 'pack-goa-t1',
          description: 'Arrival: Goa Airport → North Goa hotel',
          quantity: 1,
          unitCost: 1800,
          unitSell: 2400,
          taxPercent: 5,
          pricingUnit: 'per_service',
          serviceType: 'transfer',
          rateKind: 'transfer',
          details: {
            fromPlaceName: 'Goa Airport (GOI)',
            toPlaceName: 'Calangute',
            vehicleLabel: 'Sedan',
            vehicles: 1,
            priceSource: 'manual',
          },
        },
        {
          id: 'pack-goa-h1',
          description: '3N North Goa beach hotel',
          quantity: 3,
          unitCost: 5500,
          unitSell: 7200,
          taxPercent: 5,
          pricingUnit: 'per_room',
          serviceType: 'hotel',
          rateKind: 'hotel',
          details: {
            placeName: 'Calangute',
            propertyName: 'Beach resort',
            roomType: 'Superior sea view',
            mealPlan: 'CP',
            nights: 3,
            rooms: 1,
            priceSource: 'manual',
          },
        },
        {
          id: 'pack-goa-a1',
          description: 'North Goa half-day sightseeing',
          quantity: 2,
          unitCost: 900,
          unitSell: 1400,
          taxPercent: 5,
          pricingUnit: 'per_person',
          serviceType: 'activity',
          details: {
            placeName: 'North Goa',
            privateOrSic: 'private',
            priceSource: 'manual',
          },
        },
        {
          id: 'pack-goa-t2',
          description: 'Departure: North Goa hotel → Goa Airport',
          quantity: 1,
          unitCost: 1800,
          unitSell: 2400,
          taxPercent: 5,
          pricingUnit: 'per_service',
          serviceType: 'transfer',
          rateKind: 'transfer',
          details: {
            fromPlaceName: 'Calangute',
            toPlaceName: 'Goa Airport (GOI)',
            vehicleLabel: 'Sedan',
            vehicles: 1,
            priceSource: 'manual',
          },
        },
      ],
    },
  },
];

export function listStarterPackCatalog(): StarterPackCatalogItem[] {
  return [
    {
      id: FIT_TEMPLATES_PACK_ID,
      label: 'Sample FIT quote packs',
      detail:
        'Adds Darjeeling and Goa priced templates plus demo trip TRP-DEMO-01 (draft quote, sample guest).',
      creates: {
        quoteTemplates: FIT_TEMPLATE_SPECS.map((s) => s.name),
        demoTrips: [DEMO_TRIP_SPEC.tripNumber],
      },
    },
  ];
}

export type DemoTripSpec = {
  tripNumber: string;
  title: string;
  partyDisplayName: string;
  travellerFullName: string;
  destinationName: string;
  /** Days from today until trip start. */
  startOffsetDays: number;
  nights: number;
  /** FIT template whose items seed the draft quotation. */
  templateName: string;
};

/** Buyer-facing bullets for install toast / onboarding (claim-safe). */
export const DEMO_TRIP_INCLUDES = [
  'Darjeeling classic FIT draft quote',
  'Hotel, transfer, and activity lines',
  'Sample guest party (editable)',
] as const;

export const DEMO_TRIP_SPEC: DemoTripSpec = {
  tripNumber: 'TRP-DEMO-01',
  title: 'Darjeeling classic FIT — demo',
  partyDisplayName: 'Sample guest (demo)',
  travellerFullName: 'Sample Guest',
  destinationName: 'Darjeeling',
  startOffsetDays: 45,
  nights: 5,
  templateName: 'Darjeeling classic FIT',
};

export type DemoTripInstallMeta = {
  tripId: string;
  tripNumber: string;
  title: string;
  includes: string[];
  created: boolean;
};

export function buildDemoTripInstallMeta(input: {
  tripId: string;
  created: boolean;
  tripNumber?: string;
  title?: string;
}): DemoTripInstallMeta {
  return {
    tripId: input.tripId,
    tripNumber: input.tripNumber || DEMO_TRIP_SPEC.tripNumber,
    title: input.title || DEMO_TRIP_SPEC.title,
    includes: [...DEMO_TRIP_INCLUDES],
    created: input.created,
  };
}

/** Local calendar dates for the demo trip (stable YYYY-MM-DD). */
export function demoTripDateRange(
  spec: DemoTripSpec = DEMO_TRIP_SPEC,
  from = new Date(),
): { startDate: string; endDate: string } {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  start.setDate(start.getDate() + spec.startOffsetDays);
  const end = new Date(start);
  end.setDate(end.getDate() + spec.nights);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { startDate: iso(start), endDate: iso(end) };
}

export function resolveStarterPackTemplates(
  packId: string,
): StarterPackTemplateSpec[] | null {
  if (packId !== FIT_TEMPLATES_PACK_ID) return null;
  return FIT_TEMPLATE_SPECS;
}

export function summarizeStarterPackInstall(input: {
  createdNames: string[];
  skippedNames: string[];
  createdTrips?: string[];
  skippedTrips?: string[];
}): {
  installed: boolean;
  created: { templates: string[]; trips: string[] };
  skipped: { templates: string[]; trips: string[] };
} {
  const createdTrips = input.createdTrips ?? [];
  const skippedTrips = input.skippedTrips ?? [];
  return {
    installed: input.createdNames.length > 0 || createdTrips.length > 0,
    created: { templates: input.createdNames, trips: createdTrips },
    skipped: { templates: input.skippedNames, trips: skippedTrips },
  };
}

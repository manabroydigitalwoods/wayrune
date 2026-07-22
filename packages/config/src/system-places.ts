export type PlaceKind =
  | 'country'
  | 'region'
  | 'state'
  | 'city'
  | 'area'
  | 'landmark'
  | 'airport'
  | 'railway_station';

/** Rich destination-guide fields stored on Place.profileJson. */
export type PlaceProfile = {
  description?: string;
  imageUrls?: string[];
  latitude?: number;
  longitude?: number;
  openingHours?: string;
  durationMin?: number;
  bestTime?: string;
  entryFee?: string;
  suitabilityTags?: string[];
  googleMapsUrl?: string;
  googleRating?: number;
  googleReviewCount?: number;
  reviewSnippet?: string;
  /** IATA code for airports (e.g. DEL). */
  iataCode?: string;
  /** ICAO code for airports (e.g. VIDP). */
  icaoCode?: string;
  /** Indian Railways station code (e.g. NDLS). */
  stationCode?: string;
  /** Official long name when `name` is the everyday short label. */
  officialName?: string;
  /** Alternate short / local nickname (e.g. IGI, CSMT). */
  shortName?: string;
  /** Catalog source URL from CSV ingest. */
  sourceUrl?: string;
  /** Previous short keys after path-key migration (CSV ingest). */
  legacyKeys?: string[];
};

export type SystemPlaceNode = {
  name: string;
  key: string;
  kind: PlaceKind;
  /** Parent place key (system). Null for root countries. */
  parentKey?: string | null;
  country: string;
  /** Display fallback while parent chain hydrates */
  region?: string;
  domesticOrIntl: 'domestic' | 'international';
  subcategoryKeys?: string[];
  /** Optional rich profile (landmarks / notable cities). */
  profile?: PlaceProfile;
};

export type SystemPlaceCategory = {
  name: string;
  key: string;
  subcategories: Array<{ name: string; key: string }>;
};

export const SYSTEM_PLACE_CATEGORIES: SystemPlaceCategory[] = [
  {
    name: 'Domestic circuits',
    key: 'domestic-circuits',
    subcategories: [
      { name: 'Hill circuit', key: 'hill-circuit' },
      { name: 'Beach circuit', key: 'beach-circuit' },
      { name: 'Heritage circuit', key: 'heritage-circuit' },
      { name: 'Wildlife circuit', key: 'wildlife-circuit' },
    ],
  },
  {
    name: 'Hill stations',
    key: 'hill-stations',
    subcategories: [
      { name: 'Himalayan', key: 'himalayan' },
      { name: 'Western Ghats', key: 'western-ghats' },
    ],
  },
  {
    name: 'Beaches',
    key: 'beaches',
    subcategories: [
      { name: 'West coast', key: 'west-coast' },
      { name: 'East coast', key: 'east-coast' },
      { name: 'Island', key: 'island-beach' },
    ],
  },
  {
    name: 'International',
    key: 'international',
    subcategories: [
      { name: 'Asia', key: 'intl-asia' },
      { name: 'Middle East', key: 'intl-middle-east' },
      { name: 'Europe', key: 'intl-europe' },
      { name: 'Island getaways', key: 'intl-islands' },
    ],
  },
];

/**
 * Geographic tree seed. Order must be parents before children (seed upserts by key).
 * Parents like India / North Bengal enable region-scoped multi-city packages.
 */
export const SYSTEM_PLACES: SystemPlaceNode[] = [
  // Countries
  {
    name: 'India',
    key: 'india',
    kind: 'country',
    country: 'India',
    domesticOrIntl: 'domestic',
  },
  {
    name: 'Nepal',
    key: 'nepal',
    kind: 'country',
    country: 'Nepal',
    domesticOrIntl: 'international',
    subcategoryKeys: ['intl-asia'],
  },
  {
    name: 'Sri Lanka',
    key: 'sri-lanka',
    kind: 'country',
    country: 'Sri Lanka',
    domesticOrIntl: 'international',
    subcategoryKeys: ['intl-asia', 'island-beach'],
  },
  {
    name: 'Maldives',
    key: 'maldives',
    kind: 'country',
    country: 'Maldives',
    domesticOrIntl: 'international',
    subcategoryKeys: ['intl-islands', 'island-beach'],
  },
  {
    name: 'UAE',
    key: 'uae',
    kind: 'country',
    country: 'UAE',
    domesticOrIntl: 'international',
    subcategoryKeys: ['intl-middle-east'],
  },
  {
    name: 'Singapore',
    key: 'singapore',
    kind: 'country',
    country: 'Singapore',
    domesticOrIntl: 'international',
    subcategoryKeys: ['intl-asia'],
  },
  {
    name: 'Indonesia',
    key: 'indonesia',
    kind: 'country',
    country: 'Indonesia',
    domesticOrIntl: 'international',
    subcategoryKeys: ['intl-asia'],
  },
  {
    name: 'Thailand',
    key: 'thailand',
    kind: 'country',
    country: 'Thailand',
    domesticOrIntl: 'international',
    subcategoryKeys: ['intl-asia'],
  },
  {
    name: 'Mauritius',
    key: 'mauritius',
    kind: 'country',
    country: 'Mauritius',
    domesticOrIntl: 'international',
    subcategoryKeys: ['intl-islands'],
  },
  {
    name: 'France',
    key: 'france',
    kind: 'country',
    country: 'France',
    region: 'Europe',
    domesticOrIntl: 'international',
    subcategoryKeys: ['intl-europe'],
  },
  {
    name: 'Switzerland',
    key: 'switzerland',
    kind: 'country',
    country: 'Switzerland',
    region: 'Europe',
    domesticOrIntl: 'international',
    subcategoryKeys: ['intl-europe'],
  },

  // India regions / states
  {
    name: 'North Bengal',
    key: 'north-bengal',
    kind: 'region',
    parentKey: 'west-bengal',
    country: 'India',
    region: 'East',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['hill-circuit', 'himalayan'],
  },
  {
    name: 'Kerala',
    key: 'kerala',
    kind: 'state',
    parentKey: 'india',
    country: 'India',
    region: 'South',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['beach-circuit', 'western-ghats'],
  },
  {
    name: 'Rajasthan',
    key: 'rajasthan',
    kind: 'state',
    parentKey: 'india',
    country: 'India',
    region: 'North',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['heritage-circuit'],
  },
  {
    name: 'Himachal',
    key: 'himachal',
    kind: 'state',
    parentKey: 'india',
    country: 'India',
    region: 'North',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['hill-circuit', 'himalayan'],
  },
  {
    name: 'Goa',
    key: 'goa',
    kind: 'state',
    parentKey: 'india',
    country: 'India',
    region: 'West',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['beach-circuit', 'west-coast'],
  },
  {
    name: 'Andaman',
    key: 'andaman',
    kind: 'region',
    parentKey: 'india',
    country: 'India',
    region: 'Islands',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['island-beach', 'beach-circuit'],
  },
  {
    name: 'Ladakh',
    key: 'ladakh',
    kind: 'region',
    parentKey: 'india',
    country: 'India',
    region: 'North',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['himalayan', 'hill-circuit'],
  },

  // North Bengal cities
  {
    name: 'Darjeeling',
    key: 'darjeeling',
    kind: 'city',
    parentKey: 'north-bengal',
    country: 'India',
    region: 'East',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['himalayan', 'hill-circuit'],
    profile: {
      description:
        'Queen of the Hills — tea gardens, toy train heritage, and sunrise views of Kanchenjunga. The emotional centre of classic North Bengal packages.',
      imageUrls: [
        'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1582972236019-ea4af5ffe587?auto=format&fit=crop&w=1200&q=80',
      ],
      latitude: 27.036,
      longitude: 88.2627,
      bestTime: 'March–May and October–December',
      suitabilityTags: ['honeymoon', 'family', 'hills', 'tea', 'photography'],
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Darjeeling',
      googleRating: 4.6,
      googleReviewCount: 28000,
    },
  },
  {
    name: 'Kalimpong',
    key: 'kalimpong',
    kind: 'city',
    parentKey: 'north-bengal',
    country: 'India',
    region: 'East',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['himalayan', 'hill-circuit'],
    profile: {
      description:
        'Quieter hill town with orchid nurseries, monasteries, and open skyline views from Delo — a calm second stop after Darjeeling.',
      imageUrls: [
        'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1483728642387-6c3bdd4aa93d?auto=format&fit=crop&w=1200&q=80',
      ],
      latitude: 27.0594,
      longitude: 88.4695,
      bestTime: 'October–May; clear mornings for Delo views',
      suitabilityTags: ['family', 'hills', 'monastery', 'relaxed'],
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Kalimpong',
      googleRating: 4.5,
      googleReviewCount: 8200,
    },
  },
  {
    name: 'Gangtok',
    key: 'gangtok',
    kind: 'city',
    parentKey: 'sikkim',
    country: 'India',
    region: 'East',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['himalayan', 'hill-circuit'],
    profile: {
      description:
        'Capital of Sikkim — MG Marg promenade, monasteries, and gateway to North/East Sikkim excursions. Often paired with Darjeeling packages.',
      imageUrls: [
        'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80',
      ],
      latitude: 27.3389,
      longitude: 88.6065,
      bestTime: 'March–June and September–December',
      suitabilityTags: ['family', 'honeymoon', 'sikkim', 'monastery'],
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Gangtok',
      googleRating: 4.6,
      googleReviewCount: 19000,
    },
  },
  {
    name: 'Kurseong',
    key: 'kurseong',
    kind: 'city',
    parentKey: 'north-bengal',
    country: 'India',
    region: 'East',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['himalayan'],
    profile: {
      description:
        'Tea-town on the Bagdogra–Darjeeling climb — misty estates, colonial bungalows, and a gentle mid-way pause for families.',
      imageUrls: [
        'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=1200&q=80',
      ],
      latitude: 26.8821,
      longitude: 88.2773,
      bestTime: 'October–May',
      suitabilityTags: ['tea', 'photo-stop', 'family', 'hills'],
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Kurseong',
      googleRating: 4.4,
      googleReviewCount: 2400,
    },
  },
  {
    name: 'Siliguri',
    key: 'siliguri',
    kind: 'city',
    parentKey: 'north-bengal',
    country: 'India',
    region: 'East',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['hill-circuit'],
    profile: {
      description:
        'Plains hub for NJP rail and Bagdogra airport — base for hill climbs to Darjeeling, Kalimpong, and Sikkim.',
      imageUrls: [
        'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80',
      ],
      latitude: 26.7271,
      longitude: 88.3953,
      bestTime: 'Year-round gateway; start hill transfers early',
      suitabilityTags: ['arrival', 'departure', 'transit', 'shopping'],
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Siliguri',
      googleRating: 4.2,
      googleReviewCount: 5600,
    },
  },

  // North Bengal landmarks / POIs (Travel OS destination guide)
  {
    name: 'Bagdogra (IXB)',
    key: 'bagdogra-airport',
    kind: 'airport',
    parentKey: 'north-bengal',
    country: 'India',
    region: 'East',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['hill-circuit'],
    profile: {
      description:
        'Gateway airport for Darjeeling, Kalimpong, and Sikkim. Private transfers climb into the hills in about 3–4 hours depending on traffic and road conditions.',
      officialName: 'Bagdogra Airport',
      shortName: 'Bagdogra',
      imageUrls: [
        'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1000&q=80',
      ],
      latitude: 26.6812,
      longitude: 88.3286,
      durationMin: 60,
      bestTime: 'Morning arrivals leave more daylight for the hill climb',
      suitabilityTags: ['arrival', 'departure', 'family', 'airport'],
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Bagdogra+Airport',
      googleRating: 4.1,
      googleReviewCount: 4200,
      iataCode: 'IXB',
      icaoCode: 'VEBD',
    },
  },
  {
    name: 'Tiger Hill',
    key: 'tiger-hill',
    kind: 'landmark',
    parentKey: 'darjeeling',
    country: 'India',
    region: 'East',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['himalayan', 'hill-circuit'],
    profile: {
      description:
        'Iconic sunrise viewpoint above Darjeeling. On clear mornings, first light paints Kanchenjunga — the emotional peak of a North Bengal hills journey.',
      imageUrls: [
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1000&q=80',
        'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1000&q=80',
        'https://images.unsplash.com/photo-1483728642387-6c3bdd4aa93d?auto=format&fit=crop&w=1000&q=80',
      ],
      latitude: 27.0073,
      longitude: 88.2827,
      openingHours: 'Usually open before dawn for sunrise visits',
      durationMin: 180,
      bestTime: 'Arrive by 4:45 AM for clear Kanchenjunga colour',
      entryFee: 'Local entry fee; confirm seasonally',
      suitabilityTags: ['sunrise', 'viewpoint', 'photography', 'early-start'],
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Tiger+Hill+Darjeeling',
      googleRating: 4.6,
      googleReviewCount: 18500,
    },
  },
  {
    name: 'Batasia Loop',
    key: 'batasia-loop',
    kind: 'landmark',
    parentKey: 'darjeeling',
    country: 'India',
    region: 'East',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['himalayan', 'hill-circuit'],
    profile: {
      description:
        'A spiraling railway loop with war memorial gardens and panoramic valley views. A classic stop after Tiger Hill or with the toy train.',
      imageUrls: [
        'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=1000&q=80',
      ],
      latitude: 27.0225,
      longitude: 88.2433,
      durationMin: 60,
      bestTime: 'Late morning after sunrise, or with toy-train timing',
      suitabilityTags: ['family', 'railway', 'garden', 'photo-stop'],
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Batasia+Loop+Darjeeling',
      googleRating: 4.5,
      googleReviewCount: 9200,
    },
  },
  {
    name: 'Mall Road',
    key: 'mall-road-darjeeling',
    kind: 'landmark',
    parentKey: 'darjeeling',
    country: 'India',
    region: 'East',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['himalayan', 'hill-circuit'],
    profile: {
      description:
        'Darjeeling’s pedestrian heart — cafés, souvenir stalls, and Chowrasta square with mountain air and evening promenades.',
      imageUrls: [
        'https://images.unsplash.com/photo-1582972236019-ea4af5ffe587?auto=format&fit=crop&w=1000&q=80',
      ],
      latitude: 27.0410,
      longitude: 88.2663,
      durationMin: 120,
      bestTime: 'Late afternoon into evening for the promenade buzz',
      suitabilityTags: ['family', 'shopping', 'evening', 'cafe'],
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Mall+Road+Darjeeling',
      googleRating: 4.4,
      googleReviewCount: 6700,
    },
  },
  {
    name: 'Peace Pagoda',
    key: 'peace-pagoda-darjeeling',
    kind: 'landmark',
    parentKey: 'darjeeling',
    country: 'India',
    region: 'East',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['himalayan', 'hill-circuit'],
    profile: {
      description:
        'White Japanese Peace Pagoda on the ridge with quiet gardens and valley views — a calm midday or sunset stop after Mall Road.',
      imageUrls: [
        'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=1000&q=80',
        'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1000&q=80',
      ],
      latitude: 27.0515,
      longitude: 88.2508,
      durationMin: 75,
      bestTime: 'Late afternoon light on the white stupa',
      suitabilityTags: ['family', 'monastery', 'viewpoint', 'sunset'],
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Peace+Pagoda+Darjeeling',
      googleRating: 4.5,
      googleReviewCount: 4100,
    },
  },
  {
    name: 'Ghoom Monastery',
    key: 'ghoom-monastery',
    kind: 'landmark',
    parentKey: 'darjeeling',
    country: 'India',
    region: 'East',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['himalayan', 'hill-circuit'],
    profile: {
      description:
        'Historic Yiga Choeling monastery near Ghoom — butter lamps, prayer wheels, and a classic stop on the toy-train line.',
      imageUrls: [
        'https://images.unsplash.com/photo-1483728642387-6c3bdd4aa93d?auto=format&fit=crop&w=1000&q=80',
      ],
      latitude: 27.0186,
      longitude: 88.2392,
      durationMin: 45,
      bestTime: 'Morning after Tiger Hill, before lunch in town',
      suitabilityTags: ['monastery', 'culture', 'family', 'photography'],
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Ghoom+Monastery+Darjeeling',
      googleRating: 4.5,
      googleReviewCount: 3800,
    },
  },
  {
    name: 'Delo Hill',
    key: 'delo-hill',
    kind: 'landmark',
    parentKey: 'kalimpong',
    country: 'India',
    region: 'East',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['himalayan', 'hill-circuit'],
    profile: {
      description:
        'Kalimpong’s elevated viewpoint with pine forests, open lawns, and wide Himalayan skyline views — a calmer counterpoint to Darjeeling bustle.',
      imageUrls: [
        'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1000&q=80',
      ],
      latitude: 27.0702,
      longitude: 88.4858,
      durationMin: 90,
      bestTime: 'Clear mornings or golden hour',
      suitabilityTags: ['viewpoint', 'family', 'picnic', 'kalimpong'],
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Delo+Hill+Kalimpong',
      googleRating: 4.5,
      googleReviewCount: 3100,
    },
  },
  {
    name: 'Durpin Monastery',
    key: 'durpin-monastery',
    kind: 'landmark',
    parentKey: 'kalimpong',
    country: 'India',
    region: 'East',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['himalayan', 'hill-circuit'],
    profile: {
      description:
        'Zang Dhok Palri Phodang on Durpin Hill — prayer flags, relics, and sweeping Teesta valley views above Kalimpong town.',
      imageUrls: [
        'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1000&q=80',
      ],
      latitude: 27.0548,
      longitude: 88.4582,
      durationMin: 60,
      bestTime: 'Morning clarity for Teesta valley views',
      suitabilityTags: ['monastery', 'viewpoint', 'culture', 'kalimpong'],
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Durpin+Monastery+Kalimpong',
      googleRating: 4.6,
      googleReviewCount: 2700,
    },
  },

  // Kerala cities
  {
    name: 'Munnar',
    key: 'munnar',
    kind: 'city',
    parentKey: 'kerala',
    country: 'India',
    region: 'South',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['western-ghats', 'hill-circuit'],
  },
  {
    name: 'Alleppey',
    key: 'alleppey',
    kind: 'city',
    parentKey: 'kerala',
    country: 'India',
    region: 'South',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['beach-circuit'],
  },

  // Rajasthan cities
  {
    name: 'Jaipur',
    key: 'jaipur',
    kind: 'city',
    parentKey: 'rajasthan',
    country: 'India',
    region: 'North',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['heritage-circuit'],
  },
  {
    name: 'Udaipur',
    key: 'udaipur',
    kind: 'city',
    parentKey: 'rajasthan',
    country: 'India',
    region: 'North',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['heritage-circuit'],
  },

  // Himachal cities
  {
    name: 'Manali',
    key: 'manali',
    kind: 'city',
    parentKey: 'himachal',
    country: 'India',
    region: 'North',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['himalayan', 'hill-circuit'],
  },
  {
    name: 'Shimla',
    key: 'shimla',
    kind: 'city',
    parentKey: 'himachal',
    country: 'India',
    region: 'North',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['himalayan', 'hill-circuit'],
  },

  // Other India cities (parent India)
  {
    name: 'Delhi',
    key: 'delhi',
    kind: 'city',
    parentKey: 'india',
    country: 'India',
    region: 'North',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['heritage-circuit'],
  },
  {
    name: 'Mumbai',
    key: 'mumbai',
    kind: 'city',
    parentKey: 'india',
    country: 'India',
    region: 'West',
    domesticOrIntl: 'domestic',
  },
  {
    name: 'Agra',
    key: 'agra',
    kind: 'city',
    parentKey: 'india',
    country: 'India',
    region: 'North',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['heritage-circuit'],
  },
  {
    name: 'Rishikesh',
    key: 'rishikesh',
    kind: 'city',
    parentKey: 'india',
    country: 'India',
    region: 'North',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['himalayan'],
  },
  {
    name: 'Varanasi',
    key: 'varanasi',
    kind: 'city',
    parentKey: 'india',
    country: 'India',
    region: 'North',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['heritage-circuit'],
  },
  {
    name: 'Ranthambore',
    key: 'ranthambore',
    kind: 'city',
    parentKey: 'rajasthan',
    country: 'India',
    region: 'North',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['wildlife-circuit'],
  },
  {
    name: 'Ooty',
    key: 'ooty',
    kind: 'city',
    parentKey: 'india',
    country: 'India',
    region: 'South',
    domesticOrIntl: 'domestic',
    subcategoryKeys: ['western-ghats', 'hill-circuit'],
  },

  // International cities
  {
    name: 'Dubai',
    key: 'dubai',
    kind: 'city',
    parentKey: 'uae',
    country: 'UAE',
    region: 'Middle East',
    domesticOrIntl: 'international',
    subcategoryKeys: ['intl-middle-east'],
  },
  {
    name: 'Bali',
    key: 'bali',
    kind: 'region',
    parentKey: 'indonesia',
    country: 'Indonesia',
    domesticOrIntl: 'international',
    subcategoryKeys: ['intl-asia', 'intl-islands'],
  },
  {
    name: 'Bangkok',
    key: 'bangkok',
    kind: 'city',
    parentKey: 'thailand',
    country: 'Thailand',
    domesticOrIntl: 'international',
    subcategoryKeys: ['intl-asia'],
  },
  {
    name: 'Phuket',
    key: 'phuket',
    kind: 'city',
    parentKey: 'thailand',
    country: 'Thailand',
    domesticOrIntl: 'international',
    subcategoryKeys: ['intl-asia', 'island-beach'],
  },
  {
    name: 'Paris',
    key: 'paris',
    kind: 'city',
    parentKey: 'france',
    country: 'France',
    region: 'Europe',
    domesticOrIntl: 'international',
    subcategoryKeys: ['intl-europe'],
  },
];

/** @deprecated Use SYSTEM_PLACES */
export const SYSTEM_DESTINATIONS = SYSTEM_PLACES;

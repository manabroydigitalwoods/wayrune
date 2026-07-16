/** Global vehicle types for transfer itinerary items (seeded as isSystem). */
export type SystemVehicleType = {
  name: string;
  key: string;
  description?: string;
  seats?: number;
  profile?: {
    imageUrl?: string;
    imageUrls?: string[];
    suitabilityTags?: string[];
  };
};

export const SYSTEM_VEHICLE_TYPES: SystemVehicleType[] = [
  {
    name: 'Hatchback / Sedan',
    key: 'hatchback-sedan',
    description: 'Compact AC car for 2–3 travellers with light luggage — city hops and couple trips.',
    seats: 4,
    profile: {
      imageUrl:
        'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=800&q=80',
      suitabilityTags: ['couple', 'city', 'airport'],
    },
  },
  {
    name: 'SUV / Innova',
    key: 'suv-innova',
    description: 'Family favourite for hill roads — Bagdogra climbs, luggage space, and elders’ comfort.',
    seats: 6,
    profile: {
      imageUrl:
        'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=800&q=80',
      suitabilityTags: ['family', 'hills', 'airport', 'luggage'],
    },
  },
  {
    name: 'Tempo Traveller (12)',
    key: 'tempo-traveller-12',
    description: '12-seater mini-coach for small groups — sightseeing days and intercity hops.',
    seats: 12,
    profile: {
      imageUrl:
        'https://images.unsplash.com/photo-1544620341-1adc1baa5c27?auto=format&fit=crop&w=800&q=80',
      suitabilityTags: ['group', 'sightseeing', 'hills'],
    },
  },
  {
    name: 'Tempo Traveller (17)',
    key: 'tempo-traveller-17',
    description: '17-seater for larger family groups or school / office leisure trips.',
    seats: 17,
    profile: {
      imageUrl:
        'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=800&q=80',
      suitabilityTags: ['group', 'corporate', 'sightseeing'],
    },
  },
  {
    name: 'Mini bus',
    key: 'mini-bus',
    description: '20–25 seater coach for mid-size groups on circuit packages.',
    seats: 22,
    profile: {
      imageUrl:
        'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=800&q=80',
      suitabilityTags: ['group', 'circuit'],
    },
  },
  {
    name: 'AC Coach',
    key: 'ac-coach',
    description: 'Full-size AC bus for large groups and long highway segments.',
    seats: 40,
    profile: {
      imageUrl:
        'https://images.unsplash.com/photo-1544620341-1adc1baa5c27?auto=format&fit=crop&w=800&q=80',
      suitabilityTags: ['large-group', 'highway'],
    },
  },
];

/** Global room types shared across agencies (seeded as isSystem). */
export const SYSTEM_ROOM_TYPES: Array<{
  name: string;
  key: string;
  description?: string;
}> = [
  { name: 'Standard Room', key: 'standard-room' },
  { name: 'Deluxe Room', key: 'deluxe-room' },
  { name: 'Superior Room', key: 'superior-room' },
  { name: 'Premium Room', key: 'premium-room' },
  { name: 'Executive Room', key: 'executive-room' },
  { name: 'Single Room', key: 'single-room' },
  { name: 'Double Room', key: 'double-room' },
  { name: 'Twin Room', key: 'twin-room' },
  { name: 'Triple Room', key: 'triple-room' },
  { name: 'Family Room', key: 'family-room' },
  { name: 'Junior Suite', key: 'junior-suite' },
  { name: 'Suite', key: 'suite' },
  { name: 'Presidential Suite', key: 'presidential-suite' },
  { name: 'Connecting Rooms', key: 'connecting-rooms' },
  { name: 'Villa', key: 'villa' },
  { name: 'Cottage', key: 'cottage' },
  { name: 'Tent', key: 'tent' },
  { name: 'Dormitory', key: 'dormitory' },
];

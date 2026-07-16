/** Common inquiry preference suggestions — structured values for quotes later. */
export const HOTEL_CATEGORY_OPTIONS = [
  { value: '3-star', label: '3★' },
  { value: '4-star', label: '4★' },
  { value: '5-star', label: '5★' },
  { value: 'boutique', label: 'Boutique' },
  { value: 'resort', label: 'Resort' },
  { value: 'homestay', label: 'Homestay' },
  { value: 'any', label: 'Any' },
] as const;

export const MEAL_PLAN_OPTIONS = [
  { value: 'room-only', label: 'Room only' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'map', label: 'Breakfast + dinner' },
  { value: 'ap', label: 'All meals' },
  { value: 'all-inclusive', label: 'All inclusive' },
] as const;

export const TRANSPORT_PREF_OPTIONS = [
  { value: 'private-cab', label: 'Private cab' },
  { value: 'shared', label: 'Shared transfer' },
  { value: 'self-drive', label: 'Self-drive' },
  { value: 'flights-only', label: 'Flights only' },
  { value: 'not-needed', label: 'Not needed' },
] as const;

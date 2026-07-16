/** System place-level hotel rate defaults (INR per room / night). */

export type SystemHotelRateSeed = {
  placeKey: string;
  roomType: string | null;
  unitCost: number;
  currency?: string;
};

export const SYSTEM_HOTEL_RATES: SystemHotelRateSeed[] = [
  { placeKey: 'darjeeling', roomType: null, unitCost: 4500 },
  { placeKey: 'darjeeling', roomType: 'Deluxe', unitCost: 5500 },
  { placeKey: 'darjeeling', roomType: 'Suite', unitCost: 8500 },
  { placeKey: 'kalimpong', roomType: null, unitCost: 3800 },
  { placeKey: 'kalimpong', roomType: 'Deluxe', unitCost: 4800 },
  { placeKey: 'gangtok', roomType: null, unitCost: 4200 },
  { placeKey: 'gangtok', roomType: 'Deluxe', unitCost: 5200 },
  { placeKey: 'gangtok', roomType: 'Suite', unitCost: 8000 },
  { placeKey: 'pelling', roomType: null, unitCost: 4000 },
  { placeKey: 'siliguri', roomType: null, unitCost: 2800 },
  { placeKey: 'guwahati', roomType: null, unitCost: 3500 },
  { placeKey: 'guwahati', roomType: 'Deluxe', unitCost: 4500 },
  { placeKey: 'shillong', roomType: null, unitCost: 4000 },
  { placeKey: 'shillong', roomType: 'Deluxe', unitCost: 5200 },
  { placeKey: 'sohra', roomType: null, unitCost: 3800 },
  { placeKey: 'kaziranga', roomType: null, unitCost: 5500 },
  { placeKey: 'kaziranga', roomType: 'Deluxe', unitCost: 7500 },
  { placeKey: 'tawang', roomType: null, unitCost: 4500 },
  { placeKey: 'kohima', roomType: null, unitCost: 3200 },
  { placeKey: 'imphal', roomType: null, unitCost: 3000 },
  { placeKey: 'agartala', roomType: null, unitCost: 2800 },
];

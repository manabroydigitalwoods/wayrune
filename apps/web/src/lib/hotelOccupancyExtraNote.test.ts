import { describe, expect, it } from 'vitest';
import {
  formatHotelAdultBandNote,
  formatHotelOccupancyExtraNote,
  formatHotelPaxBuySplitNote,
} from './hotelOccupancyExtraNote';

describe('formatHotelOccupancyExtraNote', () => {
  it('returns null without extras or band', () => {
    expect(formatHotelOccupancyExtraNote(null)).toBeNull();
    expect(formatHotelOccupancyExtraNote({ occupancyExtraTotal: 0 })).toBeNull();
    expect(formatHotelOccupancyExtraNote({ occupancyExtraTotal: -1 })).toBeNull();
  });

  it('formats amount and party breakdown', () => {
    expect(
      formatHotelOccupancyExtraNote({
        occupancyExtraTotal: 1500,
        extraAdultCount: 1,
      }),
    ).toBe('+₹1,500 · 1 extra adult');

    expect(
      formatHotelOccupancyExtraNote(
        {
          occupancyExtraTotal: 3200,
          extraAdultCount: 2,
          childWithBedCount: 1,
          childWithoutBedCount: 1,
        },
        { formatAmount: (n) => `INR ${n}` },
      ),
    ).toBe('+INR 3200 · 2 extra adults · 1 child w/ bed · 1 child w/o bed');
  });

  it('formats SGL/DBL band alone or with extras', () => {
    expect(
      formatHotelAdultBandNote({ adultBandAdults: 1, adultBandUnitCost: 3600 }),
    ).toBe('1A band · ₹3,600/n');
    expect(
      formatHotelOccupancyExtraNote({
        adultBandAdults: 1,
        adultBandUnitCost: 3600,
        occupancyExtraTotal: 0,
      }),
    ).toBe('1A band · ₹3,600/n');
    expect(
      formatHotelOccupancyExtraNote({
        adultBandAdults: 3,
        adultBandUnitCost: 5800,
        occupancyExtraTotal: 1500,
        extraAdultCount: 1,
      }),
    ).toBe('3A band · ₹5,800/n · +₹1,500 · 1 extra adult');
  });

  it('formats per-pax buy split over band note', () => {
    expect(
      formatHotelPaxBuySplitNote({
        buyMode: 'per_pax_split',
        paxBuySplitTotalPerNight: 5350,
        paxBuySplits: [
          { nationality: 'IN', sharePerNight: 2250 },
          { nationality: 'US', sharePerNight: 3100 },
        ],
      }),
    ).toBe('Split · IN ₹2,250 + US ₹3,100 = ₹5,350/n');
    expect(
      formatHotelOccupancyExtraNote({
        buyMode: 'per_pax_split',
        paxBuySplitTotalPerNight: 5350,
        paxBuySplits: [
          { nationality: 'IN', sharePerNight: 2250 },
          { nationality: 'US', sharePerNight: 3100 },
        ],
        adultBandAdults: 2,
        adultBandUnitCost: 5350,
      }),
    ).toMatch(/^Split ·/);
  });

  it('appends child extras onto per-pax split cue', () => {
    expect(
      formatHotelOccupancyExtraNote({
        buyMode: 'per_pax_split',
        paxBuySplitTotalPerNight: 5350,
        paxBuySplits: [
          { nationality: 'IN', sharePerNight: 2250 },
          { nationality: 'US', sharePerNight: 3100 },
        ],
        occupancyExtraTotal: 1800,
        childWithBedCount: 1,
      }),
    ).toBe(
      'Split · IN ₹2,250 + US ₹3,100 = ₹5,350/n · +₹1,800 · 1 child w/ bed',
    );
  });

  it('appends × N rooms on multi-room per-pax split cue', () => {
    expect(
      formatHotelPaxBuySplitNote({
        buyMode: 'per_pax_split',
        paxBuySplitTotalPerNight: 5350,
        rooms: 2,
        paxBuySplits: [
          { nationality: 'IN', sharePerNight: 2250 },
          { nationality: 'US', sharePerNight: 3100 },
        ],
      }),
    ).toBe('Split · IN ₹2,250 + US ₹3,100 = ₹5,350/n · × 2 rooms');
  });

  it('formats three-way TPL per-pax split cue', () => {
    expect(
      formatHotelPaxBuySplitNote({
        buyMode: 'per_pax_split',
        paxBuySplitTotalPerNight: 6900,
        paxBuySplits: [
          { nationality: 'IN', sharePerNight: 2200 },
          { nationality: 'US', sharePerNight: 2400 },
          { nationality: 'GB', sharePerNight: 2300 },
        ],
      }),
    ).toBe('Split · IN ₹2,200 + US ₹2,400 + GB ₹2,300 = ₹6,900/n');
  });

  it('formats DBL+SGL cue without × rooms', () => {
    expect(
      formatHotelPaxBuySplitNote({
        buyMode: 'per_pax_split',
        composition: 'dbl_sgl',
        rooms: 2,
        paxBuySplitTotalPerNight: 9150,
        paxBuySplits: [
          { nationality: 'IN', sharePerNight: 2250 },
          { nationality: 'US', sharePerNight: 3100 },
          { nationality: 'GB', sharePerNight: 3800 },
        ],
      }),
    ).toBe(
      'Split · IN ₹2,250 + US ₹3,100 + GB ₹3,800 = ₹9,150/n · DBL+SGL',
    );
  });

  it('formats 2DBL+2SGL cue for 6A/4R', () => {
    expect(
      formatHotelPaxBuySplitNote({
        buyMode: 'per_pax_split',
        composition: 'dbl_sgl',
        rooms: 4,
        paxBuySplitTotalPerNight: 18300,
        paxBuySplits: [
          { nationality: 'IN', sharePerNight: 2250 },
          { nationality: 'IN', sharePerNight: 2250 },
          { nationality: 'US', sharePerNight: 3100 },
          { nationality: 'US', sharePerNight: 3100 },
          { nationality: 'GB', sharePerNight: 3800 },
          { nationality: 'GB', sharePerNight: 3800 },
        ],
      }),
    ).toBe(
      'Split · IN ₹2,250 + IN ₹2,250 + US ₹3,100 + US ₹3,100 + GB ₹3,800 + GB ₹3,800 = ₹18,300/n · 2DBL+2SGL',
    );
  });

  it('appends alone traveller name on DBL+SGL cue', () => {
    expect(
      formatHotelPaxBuySplitNote({
        buyMode: 'per_pax_split',
        composition: 'dbl_sgl',
        rooms: 2,
        aloneTravellerName: 'Asha',
        paxBuySplitTotalPerNight: 9150,
        paxBuySplits: [
          { nationality: 'IN', sharePerNight: 2250 },
          { nationality: 'US', sharePerNight: 3100 },
          { nationality: 'GB', sharePerNight: 3800 },
        ],
      }),
    ).toMatch(/DBL\+SGL · Alone Asha/);
  });

  it('tags mixed child nationality extras on occupancy cue', () => {
    expect(
      formatHotelOccupancyExtraNote({
        occupancyExtraTotal: 4000,
        childWithBedCount: 1,
        childWithoutBedCount: 1,
        childNationalityExtras: [
          { nationality: 'IN', withBed: false, total: 1000 },
          { nationality: 'US', withBed: true, total: 3000 },
        ],
      }),
    ).toMatch(/child mkts IN\+US/);
  });
});

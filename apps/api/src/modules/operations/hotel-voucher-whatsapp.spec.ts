import { describe, expect, it } from 'vitest';
import {
  composeHotelVouchersEmailBody,
  composeHotelVouchersWhatsappText,
  isEligibleHotelVoucherBooking,
  selectVoucherBookingsForMarkSent,
  voucherLineFromBooking,
} from './hotel-voucher-whatsapp';

describe('isEligibleHotelVoucherBooking', () => {
  it('accepts confirmed hotel/transfer/activity with voucher note', () => {
    expect(
      isEligibleHotelVoucherBooking({
        type: 'hotel',
        status: 'confirmed',
        voucherNote: 'Confirmed HTL-1',
      }),
    ).toBe(true);
    expect(
      isEligibleHotelVoucherBooking({
        type: 'transfer',
        status: 'confirmed',
        voucherNote: 'ok',
      }),
    ).toBe(true);
    expect(
      isEligibleHotelVoucherBooking({
        type: 'activity',
        status: 'confirmed',
        voucherNote: 'ok',
      }),
    ).toBe(true);
    expect(
      isEligibleHotelVoucherBooking({
        type: 'hotel',
        status: 'confirmed',
        voucherNote: '  ',
      }),
    ).toBe(false);
    expect(
      isEligibleHotelVoucherBooking({
        type: 'flight_ref',
        status: 'confirmed',
        voucherNote: 'ok',
      }),
    ).toBe(false);
  });
});

describe('selectVoucherBookingsForMarkSent', () => {
  const rows = [
    {
      id: 'h1',
      type: 'hotel',
      status: 'confirmed',
      voucherNote: 'HTL',
    },
    {
      id: 't1',
      type: 'transfer',
      status: 'confirmed',
      voucherNote: 'XFER',
    },
    {
      id: 'x1',
      type: 'hotel',
      status: 'confirmed',
      voucherNote: '',
    },
  ];

  it('returns all eligible when bookingIds omitted', () => {
    expect(selectVoucherBookingsForMarkSent(rows).map((b) => b.id)).toEqual([
      'h1',
      't1',
    ]);
  });

  it('intersects with bookingIds and skips ineligible', () => {
    expect(
      selectVoucherBookingsForMarkSent(rows, ['h1', 'x1', 'missing']).map(
        (b) => b.id,
      ),
    ).toEqual(['h1']);
  });
});

describe('voucherLineFromBooking', () => {
  it('maps transfer corridor and activity name', () => {
    const transfer = voucherLineFromBooking({
      type: 'transfer',
      title: 'Bagdogra → Darjeeling Innova',
      supplierName: 'North Bengal Fleet',
      confirmationRef: 'XFER-1',
      startAt: new Date('2026-10-05T00:00:00.000Z'),
      travellerRequirementsJson: {
        fromPlaceName: 'Bagdogra Airport',
        toPlaceName: 'Darjeeling',
        serviceDate: '2026-10-05',
      },
    });
    expect(transfer.type).toBe('transfer');
    expect(transfer.routeLabel).toBe('Bagdogra Airport → Darjeeling');
    expect(transfer.serviceDate).toBe('2026-10-05');

    const activity = voucherLineFromBooking({
      type: 'activity',
      title: 'Tiger Hill sunrise',
      supplierName: 'Sunrise Desk',
      travellerRequirementsJson: {
        activityName: 'Tiger Hill sunrise',
        placeName: 'Tiger Hill',
        serviceDate: '2026-10-06',
      },
    });
    expect(activity.type).toBe('activity');
    expect(activity.activityName).toBe('Tiger Hill sunrise');
    expect(activity.placeName).toBe('Tiger Hill');
  });
});

describe('composeHotelVouchersWhatsappText', () => {
  it('lists hotels with stay and confirmation', () => {
    const text = composeHotelVouchersWhatsappText({
      agencyName: 'Demo Travel',
      guestName: 'Sneha',
      tripNumber: 'TRP-SEED-02',
      tripTitle: 'Darjeeling honeymoon',
      hotels: [
        {
          type: 'hotel',
          hotelName: 'Darjeeling Heritage Lodge',
          confirmationRef: 'HTL-SEED-1',
          checkIn: '2026-10-05',
          checkOut: '2026-10-08',
        },
      ],
    });
    expect(text).toContain('Hi Sneha');
    expect(text).toContain('TRP-SEED-02');
    expect(text).toContain('Darjeeling Heritage Lodge');
    expect(text).toContain('HTL-SEED-1');
    expect(text).toContain('Demo Travel');
    expect(text).toMatch(/voucher is ready/i);
  });

  it('lists transfer and activity bullets', () => {
    const text = composeHotelVouchersWhatsappText({
      agencyName: 'Demo Travel',
      tripNumber: 'TRP-1',
      tripTitle: 'Trip',
      hotels: [
        {
          type: 'transfer',
          hotelName: 'North Bengal Fleet',
          routeLabel: 'Bagdogra → Darjeeling',
          serviceDate: '2026-10-05',
          confirmationRef: 'XFER-1',
        },
        {
          type: 'activity',
          hotelName: 'Sunrise Desk',
          activityName: 'Tiger Hill sunrise',
          placeName: 'Tiger Hill',
          serviceDate: '2026-10-06',
        },
      ],
    });
    expect(text).toMatch(/vouchers are ready/i);
    expect(text).toContain('Bagdogra → Darjeeling');
    expect(text).toContain('Tiger Hill sunrise');
    expect(text).toContain('XFER-1');
  });

  it('uses plural copy for multiple hotels', () => {
    const text = composeHotelVouchersWhatsappText({
      agencyName: 'Demo Travel',
      tripNumber: 'TRP-1',
      tripTitle: 'Trip',
      hotels: [{ hotelName: 'Hotel A' }, { hotelName: 'Hotel B' }],
    });
    expect(text).toMatch(/vouchers are ready/i);
    expect(text).toContain('Hotel A');
    expect(text).toContain('Hotel B');
  });

  it('mentions PDF attachment when Cloud will send documents', () => {
    const text = composeHotelVouchersWhatsappText({
      agencyName: 'Demo Travel',
      tripNumber: 'TRP-1',
      tripTitle: 'Trip',
      hotels: [{ hotelName: 'Hotel A' }],
      pdfAttached: true,
    });
    expect(text).toMatch(/PDF voucher/i);
    expect(text).not.toMatch(/if you need the PDF/i);
  });
});

describe('composeHotelVouchersEmailBody', () => {
  it('builds subject and lists hotels', () => {
    const { subject, body } = composeHotelVouchersEmailBody({
      agencyName: 'Demo Travel',
      guestName: 'Sneha',
      tripNumber: 'TRP-SEED-02',
      tripTitle: 'Darjeeling honeymoon',
      hotels: [
        {
          hotelName: 'Darjeeling Heritage Lodge',
          confirmationRef: 'HTL-SEED-1',
        },
      ],
    });
    expect(subject).toContain('TRP-SEED-02');
    expect(subject).toMatch(/^Voucher/);
    expect(body).toContain('Hi Sneha');
    expect(body).toContain('Darjeeling Heritage Lodge');
    expect(body).toContain('attached');
  });
});

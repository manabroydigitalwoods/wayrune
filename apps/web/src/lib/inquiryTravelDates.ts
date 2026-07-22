import { formatDateInput, parseDateInput } from './dateInput';

/** End date = start + nights (checkout morning after N nights). */
export function endDateFromStartAndNights(
  startDate: string,
  nights: number,
): string {
  const start = parseDateInput(startDate);
  if (!start || !Number.isFinite(nights) || nights < 1) return '';
  const end = new Date(start);
  end.setDate(end.getDate() + Math.floor(nights));
  return formatDateInput(end);
}

/** Whole nights between start and end (exclusive of end day as stay night count). */
export function nightsFromStartAndEnd(
  startDate: string,
  endDate: string,
): number | null {
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  const nights = Math.round(ms / (24 * 60 * 60 * 1000));
  if (nights < 1) return null;
  return nights;
}

export function patchTravelDates(input: {
  startDate: string;
  nights: number | null;
  endDate: string;
  change: 'start' | 'nights' | 'end';
  nextStart?: string;
  nextNights?: number | null;
  nextEnd?: string;
}): { startDate: string; nights: number | null; endDate: string } {
  let startDate = input.startDate;
  let nights = input.nights;
  let endDate = input.endDate;

  if (input.change === 'start') {
    startDate = input.nextStart ?? '';
    if (startDate && nights && nights >= 1) {
      endDate = endDateFromStartAndNights(startDate, nights);
    } else if (startDate && endDate) {
      nights = nightsFromStartAndEnd(startDate, endDate);
    }
  } else if (input.change === 'nights') {
    nights = input.nextNights ?? null;
    if (startDate && nights && nights >= 1) {
      endDate = endDateFromStartAndNights(startDate, nights);
    }
  } else {
    endDate = input.nextEnd ?? '';
    if (startDate && endDate) {
      nights = nightsFromStartAndEnd(startDate, endDate);
    }
  }

  return { startDate, nights, endDate };
}

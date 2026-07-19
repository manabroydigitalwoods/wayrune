/** Compact post-Match cue when activity/transfer ages are reclassified. */

export type ActivityChildAgeCalc = {
  /** Declared adults on the quote line / party. */
  partyAdults?: number | null;
  /** Declared children count. */
  partyChildren?: number | null;
  /** Declared infants (transfer); ignored when ages drive infant heads. */
  partyInfants?: number | null;
  /** Heads charged at adult rate after classify. */
  adultsCharged?: number | null;
  /** Heads charged at child rate after classify. */
  childrenCharged?: number | null;
  /** Heads charged at infant rate after classify (transfer). */
  infantsCharged?: number | null;
  childAgeMin?: number | null;
  childAgeMax?: number | null;
};

export function formatActivityChildAgeNote(
  calc: ActivityChildAgeCalc | null | undefined,
): string | null {
  if (!calc) return null;
  const partyAdults = Math.max(0, Math.round(Number(calc.partyAdults) || 0));
  const partyInfants = Math.max(0, Math.round(Number(calc.partyInfants) || 0));
  const adultsCharged = Math.max(0, Math.round(Number(calc.adultsCharged) || 0));
  const infantsCharged = Math.max(
    0,
    Math.round(Number(calc.infantsCharged) || 0),
  );
  const reclassifiedAdults = adultsCharged - partyAdults;
  const reclassifiedInfants = infantsCharged - partyInfants;
  if (reclassifiedAdults <= 0 && reclassifiedInfants <= 0) return null;

  const ageMin =
    calc.childAgeMin != null && Number.isFinite(Number(calc.childAgeMin))
      ? Math.round(Number(calc.childAgeMin))
      : null;
  const ageMax =
    calc.childAgeMax != null && Number.isFinite(Number(calc.childAgeMax))
      ? Math.round(Number(calc.childAgeMax))
      : null;
  const window =
    ageMin != null && ageMax != null ? ` (card ${ageMin}–${ageMax})` : '';

  const parts: string[] = [];
  if (reclassifiedAdults > 0) {
    parts.push(
      `${reclassifiedAdults} priced as adult${reclassifiedAdults === 1 ? '' : 's'}`,
    );
  }
  if (reclassifiedInfants > 0) {
    parts.push(
      `${reclassifiedInfants} priced as infant${reclassifiedInfants === 1 ? '' : 's'}`,
    );
  }
  return `${parts.join(' · ')}${window}`;
}

/** Map provenance calculation (+ optional top-level stamps) into note input. */
export function activityChildAgeCalcFromProvenance(input: {
  calculation?: {
    adults?: number | null;
    children?: number | null;
    infants?: number | null;
    partyAdults?: number | null;
    partyChildren?: number | null;
    partyInfants?: number | null;
    childAgeMin?: number | null;
    childAgeMax?: number | null;
    adultsCharged?: number | null;
    childrenCharged?: number | null;
    infantsCharged?: number | null;
  } | null;
}): ActivityChildAgeCalc | null {
  const c = input.calculation;
  if (!c) return null;
  return {
    partyAdults: c.partyAdults ?? undefined,
    partyChildren: c.partyChildren ?? undefined,
    partyInfants: c.partyInfants ?? undefined,
    adultsCharged: c.adultsCharged ?? c.adults ?? undefined,
    childrenCharged: c.childrenCharged ?? c.children ?? undefined,
    infantsCharged: c.infantsCharged ?? c.infants ?? undefined,
    childAgeMin: c.childAgeMin ?? undefined,
    childAgeMax: c.childAgeMax ?? undefined,
  };
}

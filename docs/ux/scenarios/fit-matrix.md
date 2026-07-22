# FIT scenario matrix (wedge dogfood)

Eight scenarios for FIT quotation and revision. Run on Wayrune; score with `docs/ux/sembark-wedge-comparison.md`.

| ID | Scenario | Pass criteria |
| --- | --- | --- |
| FIT-01 | Couple, single destination | Enquiry → Match hotel/transfer/activity → send; margin visible; no Excel |
| FIT-02 | Family with child | Child occupancy / extras correct on Match; sell/tax sensible |
| FIT-03 | Multi-city trip | Multiple destination days represented; quote sends |
| FIT-04 | Two hotel alternatives | Match alts compare; Use / Use (keep markup); choice sticky |
| FIT-05 | Date-change revision | Dates change; rematch or clear stale; Resend latest; revision banner |
| FIT-06 | Passenger / rooming revision | Adults/children/rooms update; pricing refresh without calc escape |
| FIT-07 | Package reuse | Use template or Use previous trip; lines + story seed; send |
| FIT-08 | Stop-sale / unavailable replacement | Blocked rate cue; replace hotel/rate; continue without eng |

## Automation

| ID | Automated now |
| --- | --- |
| FIT-02 + FIT-05 + FIT-07 + accept→voucher thin | `family-fit-revise-book-voucher` (demo path) |
| FIT-01 thin | `standard-fit-quote` |
| FIT-03, FIT-04 deep, FIT-06, FIT-08 | Human + friction log |

## Evidence → depth

Repeated spreadsheet/rate-model failures → P5 workbook. Do not invent Sembark matrix columns without ≥3 escapes of the same pattern.

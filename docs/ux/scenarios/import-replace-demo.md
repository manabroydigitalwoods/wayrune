# Human script — Real supplier & rate import (+ Replace demo)

**Wedge priority 2.** Evidence for P5 workbook. Demo pack is not enough for real-agency track.

**Persona:** owner or sales manager with import rights.

## Steps

1. On a staging/pilot org with demo operate data, open Settings → About → **Replace demo**.
2. Confirm demo suppliers are soft-archived / unavailable in Match for live docs.
3. Suppliers → Import CSV (name, type, email, phone). Note invalid rows.
4. Correct failed rows → replay import until contact-complete hotel/transfer/activity exist.
5. Rates → Import hotel contracts (CSV/XLSX). Capture failures (row/column, expected rate).
6. Import transfer rates; import activity rates.
7. Activate rate version tips where dual-control applies.
8. Open a new FIT quote → Match → confirm imported suppliers/rates appear.
9. Send a thin quote using only real (non-demo) rates.
10. Spot-check a live document (proposal/voucher) — **no `[Demo]` labels**.

## Measure

| Metric | Record |
| --- | --- |
| % rows imported successfully | |
| Manual corrections count | |
| Unsupported spreadsheet structures | |
| Time to quote-ready after Replace demo | |
| Return to original spreadsheet? (escape) | |

## Pass

Real suppliers + rates usable in Match and a sent quote; demo data absent from live docs; failures understandable and replayable.

Preserve every failed sheet for P5 (≥3 same-pattern escapes before depth work).

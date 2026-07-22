# Golden scenario — Family FIT → revision → booking → voucher

Human script for Agency Competitive Validation. Automate what you can (`family-fit-revise-book-voucher` e2e); observe trust and confusion live.

**Persona:** sales executive (quote) + operations (confirm/voucher) + finance glance.

**Party:** 2 adults + 1 child. INR. Demo operate pack or real import (real-agency track prefers Replace demo first).

## Steps

1. Create enquiry (2A+1C, dates, destination, rooming).
2. Convert / open trip.
3. Apply reusable package (or Use previous trip).
4. Match hotel with meal and occupancy rules.
5. Add transfer and activity (Match if needed).
6. Open Match alternatives once; note sort / keep-markup.
7. Review cost, sell, tax, margin — no calculator.
8. Generate and send quotation.
9. Change travel dates.
10. Replace hotel (swap preserves stay dates when possible).
11. Resend revised quotation (public “Revised quote · vN”).
12. Accept quotation (guest or staff).
13. Follow Next action — missing-supplier check.
14. Send supplier enquiries (hotel at minimum; transfer/activity if present).
15. Confirm services (confirmation ref).
16. Generate / open vouchers.
17. Record partial customer payment (or Schedule from terms).
18. Verify AR/AP cues and departure readiness checklist.

## Measure

| Metric | Target / note |
| --- | --- |
| Total time | Record; golden e2e budget ≤ 300s (demo path) |
| Clicks / screens | Record |
| Validation errors | Prefer 0 |
| Calculator / Excel | Escape if used for core pricing |
| Confusion / trust | Think-aloud only |
| Pricing correctness | Spot-check hotel stay + tax display |
| Developer help | Escape |

## Pass (human)

User completes enquiry → revised send → accept → confirm → voucher → partial collection **without** Excel, manual PDF, or eng/DB help. WhatsApp to supplier OK if status is captured in Wayrune without reconstruction.

Demo/seed timings never flip FIT Proven.

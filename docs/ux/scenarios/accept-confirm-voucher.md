# Human script — Accept → confirm → voucher

**Wedge priority 3.** Proves Wayrune is an operating product, not only a quotation builder.

**Persona:** sales (accept) + operations (enquiry/confirm/voucher).

Automation covers a thin demo path (`family-fit-revise-book-voucher`). This script is for **observed** clarity and escapes.

## Steps

1. Start from an accepted (or just-accepted) FIT quote with hotel + transfer + activity lines.
2. Follow **Next action** on trip control — note if missing-supplier warnings appear.
3. Operations → send supplier enquiry (hotel; then transfer/activity).
4. Mark enquiry sent if using wa.me fallback.
5. Confirm each service with confirmation ref (partial confirm: leave one pending).
6. Confirm remaining service after a delay (simulate confirmation delay).
7. Generate / open vouchers; download or revise voucher note.
8. Optional: replace one supplier after accept; re-confirm.
9. Optional: cancel one service → credit-note path glance.
10. Score: time acceptance → booking-ready; unclear next steps; status mismatches.

## Measure

| Metric | Record |
| --- | --- |
| Time accept → all confirmed | |
| Unclear next actions | |
| Status mismatches | |
| Manual WhatsApp reconstruction (escape?) | |
| Voucher errors | |
| Developer intervention | |

## Pass

Hotel (and ideally T/A) confirmed + vouchered without Excel/manual PDF/eng help. WA to supplier OK if status is captured in Wayrune without reconstruction.

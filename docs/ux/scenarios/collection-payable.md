# Human script — Collection & supplier payment

**Wedge priority 4.** Evidence for P8 party/supplier ledger views.

**Persona:** finance + ops glance.

## Steps

1. On an accepted trip with receivables (or Schedule from terms).
2. Create / view customer instalments.
3. Generate Razorpay link if keys present (else mock/manual mark).
4. Record **partial** collection.
5. Open overdue / aging chase cue if applicable.
6. Allocate receipt to instalment.
7. Confirm supplier payable exists after confirm; mark one payable paid.
8. Issue credit note path (cancel or CN) and note refund due.
9. Request write-off on a small overdue remainder → approve with second user if SoD.
10. Answer aloud (no export first):

- How much has the customer paid?
- What remains due?
- What must be paid to suppliers?
- What is expected margin?
- What has been refunded or written off?

## Measure

| Metric | Record |
| --- | --- |
| Answered without export? | Y/N each question |
| Escapes (Excel/calculator) | |
| Trust in totals | |

## Pass

Operator answers the five questions from in-product cues without a spreadsheet. Repeated “need a ledger view” escapes → P8.

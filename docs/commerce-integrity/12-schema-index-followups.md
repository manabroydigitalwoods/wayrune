# Deferred schema and search follow-ups

> **Deferred does not mean required next. Each item needs production evidence before reopening.**

## Status

The hot-path index productionization pass is complete.

Applied migrations:

- `20260722103735_productionize_hot_path_indexes_a`
- `20260722103816_productionize_hot_path_indexes_b`
- `20260722103928_productionize_hot_path_indexes_qv_created`

This document records intentionally deferred follow-ups.
It does not authorize implementation.

## Reopening rule

Open a follow-up only when:

- a production query or workflow is measurably affected,
- the triggering evidence is captured,
- the actual SQL and EXPLAIN plan have been reviewed,
- the proposed change is scoped as a separate project.

### What counts as production evidence

Evidence should normally include at least one of:

- Slow-query-log entry
- `EXPLAIN ANALYZE`
- Rows examined versus rows returned
- Filesort or temporary-table impact
- Measured endpoint latency
- Search failure rate
- Per-table tombstone ratio
- Duplicate/import conflict examples

---

## 1. Place search

### Current decision

Stay with purpose-aware B-tree search (kind / system / org / parent compounds plus existing `key` and list filters).

### Evidence that may reopen this

- Search latency exceeds the agreed threshold
- `contains` queries examine excessive rows
- Users fail to find valid Places
- Catalog size increases materially
- Alias, typo, or multilingual needs become significant

### Preferred progression

1. Normalized/indexed search columns
2. MySQL FULLTEXT
3. Dedicated search service

### Do not do pre-emptively

- Add Elasticsearch/OpenSearch solely because the catalog reached 5k–20k rows
- Replace the current PlacePicker without measured search failures

---

## 2. Rate-table `deletedAt` compounds

### Current decision

Do not append `deletedAt` to rate-table compounds while tombstones are rare. Soft-delete remains out of hot-path indexes from the productionization pass.

### Evidence that may reopen this

Re-evaluate when tombstones reach approximately 10–20% on a high-read table **and** query plans show deleted rows materially increasing work.

That ratio is a **review threshold**, not an instruction to rebuild indexes immediately. Prefer tables where all three hold:

1. High read volume
2. Significant deleted-row ratio
3. EXPLAIN shows rows examined because deleted records remain in the range

Likely candidates if evidence appears: supplier hotel rates, transfer fares, activity rates, availability calendars.

### Preferred progression

1. Measure per-table tombstone ratio and hot query shapes
2. Rebuild only the compounds that match those shapes
3. Re-EXPLAIN after each selective change

### Do not do pre-emptively

- Rebuild every rate index uniformly with trailing `deletedAt`
- Add soft-delete to every soft-deleted model “for consistency”

---

## 3. QuotationVersion organisation scoping

### Current decision

Keep organisation filtering via the parent `Quotation` relation. Shipped indexes already support global status/time scans and quotation-linked status/time lookup.

### Evidence that may reopen this

- Organisation-scoped dashboard quote queries are genuinely hot
- Joins remain expensive at realistic scale (`EXPLAIN ANALYZE` confirms the join is the bottleneck)
- Query rewrite and caching are insufficient

### Preferred progression

1. Rewrite so MySQL starts from organisation `quotations` and joins matching versions
2. Only then consider denormalizing `organizationId` onto `QuotationVersion`

### Do not do pre-emptively

- Denormalize without proving join cost at production-like volume
- Accept `organizationId` from client input

If `organizationId` is ever denormalized onto `QuotationVersion`, it must be immutable, derived from the parent Quotation, backfilled transactionally, and never accepted from client input.

---

## 4. Place unique key redesign

### Current decision

Treat Place identity uniqueness as a separate data-model project, not an index task. Do not add a unique constraint in an index/migration pass.

### Evidence that may reopen this

- CSV imports repeatedly create duplicates
- Picker deduplication becomes unreliable
- Upsert logic cannot deterministically identify a Place
- Partner contributions require conflict resolution

### Preferred progression

1. Audit existing duplicates (system vs org, null parents, aliases, soft-deleted rows)
2. Define system vs tenant override rules and upsert identity
3. Design invariants (for example system vs organisation uniqueness on kind/parent/normalized key)
4. Migrate only after conflict resolution is agreed

### Do not do pre-emptively

A unique constraint must not be introduced before auditing existing duplicates, null-parent behaviour, system-versus-organisation ownership, deleted records, aliases, and import upsert rules.

Translating a candidate invariant directly into a migration risks failed applies or incorrect merging.

---

## 5. Blanket FK indexes

### Current decision

Continue avoiding “index every uncovered FK just in case.” InnoDB often already maintains supporting indexes under `*_fkey` names.

### Evidence that may reopen this

- The actual database does not already have a supporting index
- Reverse lookup is hot
- A compound beginning with that FK matches a real query
- Deletion/cascade checks are slow
- EXPLAIN proves the current access path is inadequate

### Preferred progression

1. Inspect existing indexes:

```sql
SHOW INDEX FROM <table>;
```

   (or the project’s schema-index inspection approach)

2. Prefer compounds that match real SQL, for example `@@index([leadId, occurredAt])` over a lone `@@index([leadId])`
3. Add only the proven index

### Do not do pre-emptively

- Duplicate InnoDB FK-supporting indexes under a second Prisma name
- Index every FK column without a measured query shape

---

## Recommended observe order

1. Observe production slow queries and rows examined
2. Place query rewrite or search quality, only if picker/search becomes measurable
3. QuotationVersion query rewrite, if organisation dashboards degrade
4. Selective `deletedAt` compounds, table by table
5. Place unique-key redesign, as a dedicated data-integrity project
6. FK indexes only from proven query evidence

-- Leftover from EXPLAIN gate: dashboard 30d QuotationVersion created_at window still scanned ALL without status+createdAt.
-- Soft-delete compounds deferred until tombstones exceed ~10–20% on hot tables.

CREATE INDEX `quotation_versions_status_created_at_idx` ON `quotation_versions`(`status`, `created_at`);

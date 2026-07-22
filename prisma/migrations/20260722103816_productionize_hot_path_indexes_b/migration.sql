-- Migration B: verified growth-path compounds after SHOW INDEX + pre-migrate EXPLAIN.
-- Skipped: FK singles already covered by InnoDB (*_fkey); PlaceSubcategoryLink.subcategory_id already indexed.
-- Soft-delete compounds deferred until tombstones exceed ~10–20% on hot tables.

-- CreateIndex
CREATE INDEX `activities_organization_id_inquiry_id_created_at_idx` ON `activities`(`organization_id`, `inquiry_id`, `created_at`);

-- CreateIndex
CREATE INDEX `activities_organization_id_trip_id_created_at_idx` ON `activities`(`organization_id`, `trip_id`, `created_at`);

-- CreateIndex
CREATE INDEX `audit_events_organization_id_action_created_at_idx` ON `audit_events`(`organization_id`, `action`, `created_at`);

-- CreateIndex
CREATE INDEX `interactions_organization_id_staff_user_id_occurred_at_idx` ON `interactions`(`organization_id`, `staff_user_id`, `occurred_at`);

-- CreateIndex
CREATE INDEX `trips_organization_id_start_date_idx` ON `trips`(`organization_id`, `start_date`);

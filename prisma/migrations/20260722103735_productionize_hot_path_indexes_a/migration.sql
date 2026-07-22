-- Migration A: proven hot-path compounds (dashboard / queues / Place purpose / QV).
-- Soft-delete compounds deferred until tombstones exceed ~10–20% on hot tables.
-- FK single-column indexes already present via InnoDB — not duplicated here.

-- CreateIndex
CREATE INDEX `booking_components_organization_id_status_created_at_idx` ON `booking_components`(`organization_id`, `status`, `created_at`);

-- CreateIndex
CREATE INDEX `inquiries_organization_id_status_updated_at_idx` ON `inquiries`(`organization_id`, `status`, `updated_at`);

-- CreateIndex
CREATE INDEX `inquiries_organization_id_updated_at_idx` ON `inquiries`(`organization_id`, `updated_at`);

-- CreateIndex
CREATE INDEX `leads_organization_id_follow_up_at_idx` ON `leads`(`organization_id`, `follow_up_at`);

-- CreateIndex
CREATE INDEX `leads_organization_id_owner_id_follow_up_at_idx` ON `leads`(`organization_id`, `owner_id`, `follow_up_at`);

-- CreateIndex
CREATE INDEX `leads_organization_id_updated_at_idx` ON `leads`(`organization_id`, `updated_at`);

-- CreateIndex
CREATE INDEX `places_organization_id_is_active_kind_idx` ON `places`(`organization_id`, `is_active`, `kind`);

-- CreateIndex
CREATE INDEX `places_is_system_is_active_kind_idx` ON `places`(`is_system`, `is_active`, `kind`);

-- CreateIndex
CREATE INDEX `places_parent_id_is_active_idx` ON `places`(`parent_id`, `is_active`);

-- CreateIndex
CREATE INDEX `quotation_versions_status_updated_at_idx` ON `quotation_versions`(`status`, `updated_at`);

-- CreateIndex
CREATE INDEX `quotation_versions_quotation_id_status_updated_at_idx` ON `quotation_versions`(`quotation_id`, `status`, `updated_at`);

-- CreateIndex
CREATE INDEX `tasks_organization_id_assignee_id_status_due_at_idx` ON `tasks`(`organization_id`, `assignee_id`, `status`, `due_at`);

-- CreateIndex
CREATE INDEX `trip_payments_organization_id_status_due_at_idx` ON `trip_payments`(`organization_id`, `status`, `due_at`);

-- CreateIndex
CREATE INDEX `trips_organization_id_updated_at_idx` ON `trips`(`organization_id`, `updated_at`);

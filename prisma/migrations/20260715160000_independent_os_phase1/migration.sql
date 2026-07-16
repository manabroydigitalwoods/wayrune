-- Independent OS Phase 1: named stay modify ops, sell-vs-assign, folio/checkout blockers,
-- PropertyDayClose, HK/Maintenance depth, homestay attributes.

-- stay_reservations: assignment history + homestay attributes
ALTER TABLE `stay_reservations`
  ADD COLUMN `assignment_history_json` JSON NULL,
  ADD COLUMN `inventory_mode` VARCHAR(191) NULL,
  ADD COLUMN `host_present` BOOLEAN NULL,
  ADD COLUMN `house_rules_ack_at` DATETIME(3) NULL,
  ADD COLUMN `meal_cutoff_hours` INT NULL,
  ADD COLUMN `flexible_check_in` BOOLEAN NULL;

-- housekeeping_tasks: lifecycle timestamps + reopen reason
ALTER TABLE `housekeeping_tasks`
  ADD COLUMN `started_at` DATETIME(3) NULL,
  ADD COLUMN `completed_at` DATETIME(3) NULL,
  ADD COLUMN `inspected_at` DATETIME(3) NULL,
  ADD COLUMN `inspected_by_user_id` VARCHAR(191) NULL,
  ADD COLUMN `reopened_reason` TEXT NULL;

-- maintenance_work_orders: category, vendor, downtime window, parts, recurrence
ALTER TABLE `maintenance_work_orders`
  ADD COLUMN `category` VARCHAR(191) NULL,
  ADD COLUMN `vendor_name` VARCHAR(191) NULL,
  ADD COLUMN `downtime_from` DATETIME(3) NULL,
  ADD COLUMN `downtime_to` DATETIME(3) NULL,
  ADD COLUMN `parts_json` JSON NULL,
  ADD COLUMN `recurring` BOOLEAN NOT NULL DEFAULT false;

-- Property-level end-of-day close-out
CREATE TABLE `property_day_closes` (
  `id` VARCHAR(191) NOT NULL,
  `asset_id` VARCHAR(191) NOT NULL,
  `business_date` DATE NOT NULL,
  `posted_room_charges` INT NOT NULL DEFAULT 0,
  `no_shows_marked` INT NOT NULL DEFAULT 0,
  `unresolved_arrivals_json` JSON NULL,
  `unpaid_departures_json` JSON NULL,
  `summary_json` JSON NULL,
  `closed_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `property_day_closes_asset_id_business_date_key`(`asset_id`, `business_date`),
  CONSTRAINT `property_day_closes_asset_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Durable log for failed multi-step workflows needing retry/compensation
CREATE TABLE `workflow_recovery_items` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `workflow_type` VARCHAR(191) NOT NULL,
  `failed_step` VARCHAR(191) NOT NULL,
  `affected_entities_json` JSON NULL,
  `last_error` TEXT NULL,
  `retry_eligible` BOOLEAN NOT NULL DEFAULT true,
  `compensation_json` JSON NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'open',
  `assigned_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `workflow_recovery_items_org_status_idx`(`organization_id`, `status`),
  CONSTRAINT `workflow_recovery_items_org_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

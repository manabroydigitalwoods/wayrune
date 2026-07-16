-- Mobility Driver OS 1.0: driver jobs (assignment → complete → pay)

CREATE TABLE `driver_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `inventory_allocation_id` VARCHAR(191) NULL,
    `inventory_hold_id` VARCHAR(191) NULL,
    `service_request_id` VARCHAR(191) NULL,
    `party_id` VARCHAR(191) NULL,
    `guest_name` VARCHAR(191) NOT NULL,
    `guest_phone` VARCHAR(191) NULL,
    `pickup_location` VARCHAR(191) NULL,
    `drop_location` VARCHAR(191) NULL,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'offered',
    `rate_amount` DECIMAL(14, 2) NULL,
    `amount_paid` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `notes` TEXT NULL,
    `completion_note` TEXT NULL,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `driver_jobs_asset_id_status_idx` ON `driver_jobs`(`asset_id`, `status`);
CREATE INDEX `driver_jobs_asset_id_start_at_end_at_idx` ON `driver_jobs`(`asset_id`, `start_at`, `end_at`);
CREATE INDEX `driver_jobs_service_request_id_idx` ON `driver_jobs`(`service_request_id`);
CREATE INDEX `driver_jobs_party_id_idx` ON `driver_jobs`(`party_id`);

ALTER TABLE `driver_jobs`
  ADD CONSTRAINT `driver_jobs_asset_id_fkey`
  FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `driver_jobs_inventory_allocation_id_fkey`
  FOREIGN KEY (`inventory_allocation_id`) REFERENCES `inventory_allocations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `driver_jobs_inventory_hold_id_fkey`
  FOREIGN KEY (`inventory_hold_id`) REFERENCES `inventory_holds`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `driver_jobs_service_request_id_fkey`
  FOREIGN KEY (`service_request_id`) REFERENCES `service_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `driver_jobs_party_id_fkey`
  FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

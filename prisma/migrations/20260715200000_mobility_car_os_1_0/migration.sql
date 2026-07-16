-- Mobility OS 1.0 (car rental): rates, rental reservations, folio link

CREATE TABLE `asset_fleet_rates` (
    `id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `amount_per_day` DECIMAL(14, 2) NOT NULL,
    `deposit_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `asset_fleet_rates_asset_id_is_active_idx` ON `asset_fleet_rates`(`asset_id`, `is_active`);

CREATE TABLE `rental_reservations` (
    `id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `fleet_unit_id` VARCHAR(191) NOT NULL,
    `fleet_rate_id` VARCHAR(191) NULL,
    `inventory_allocation_id` VARCHAR(191) NULL,
    `inventory_hold_id` VARCHAR(191) NULL,
    `party_id` VARCHAR(191) NULL,
    `guest_name` VARCHAR(191) NOT NULL,
    `guest_phone` VARCHAR(191) NULL,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'held',
    `rate_amount` DECIMAL(14, 2) NULL,
    `deposit_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `deposit_paid` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `amount_paid` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `checkout_checklist_json` JSON NULL,
    `return_checklist_json` JSON NULL,
    `damage_note` TEXT NULL,
    `notes` TEXT NULL,
    `rate_snapshot_json` JSON NULL,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `rental_reservations_asset_id_status_idx` ON `rental_reservations`(`asset_id`, `status`);
CREATE INDEX `rental_reservations_fleet_unit_id_start_at_end_at_idx` ON `rental_reservations`(`fleet_unit_id`, `start_at`, `end_at`);
CREATE INDEX `rental_reservations_party_id_idx` ON `rental_reservations`(`party_id`);

ALTER TABLE `folio_charges` ADD COLUMN `rental_reservation_id` VARCHAR(191) NULL;
CREATE INDEX `folio_charges_rental_reservation_id_idx` ON `folio_charges`(`rental_reservation_id`);

ALTER TABLE `asset_fleet_rates`
  ADD CONSTRAINT `asset_fleet_rates_asset_id_fkey`
  FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `rental_reservations`
  ADD CONSTRAINT `rental_reservations_asset_id_fkey`
  FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `rental_reservations_fleet_unit_id_fkey`
  FOREIGN KEY (`fleet_unit_id`) REFERENCES `asset_fleet_units`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `rental_reservations_fleet_rate_id_fkey`
  FOREIGN KEY (`fleet_rate_id`) REFERENCES `asset_fleet_rates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `rental_reservations_inventory_allocation_id_fkey`
  FOREIGN KEY (`inventory_allocation_id`) REFERENCES `inventory_allocations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `rental_reservations_inventory_hold_id_fkey`
  FOREIGN KEY (`inventory_hold_id`) REFERENCES `inventory_holds`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `rental_reservations_party_id_fkey`
  FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `folio_charges`
  ADD CONSTRAINT `folio_charges_rental_reservation_id_fkey`
  FOREIGN KEY (`rental_reservation_id`) REFERENCES `rental_reservations`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

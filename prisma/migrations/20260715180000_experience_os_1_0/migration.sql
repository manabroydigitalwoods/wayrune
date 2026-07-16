-- Experience / Farmstay OS 1.0: reservations, participants, waivers

CREATE TABLE `experience_reservations` (
    `id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `experience_product_id` VARCHAR(191) NOT NULL,
    `experience_slot_id` VARCHAR(191) NOT NULL,
    `inventory_hold_id` VARCHAR(191) NULL,
    `party_id` VARCHAR(191) NULL,
    `booker_name` VARCHAR(191) NOT NULL,
    `booker_phone` VARCHAR(191) NULL,
    `guest_count` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'requested',
    `rate_amount` DECIMAL(14, 2) NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `notes` TEXT NULL,
    `waiver_ack_at` DATETIME(3) NULL,
    `waiver_text_snapshot` TEXT NULL,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `experience_reservations_asset_id_status_idx` ON `experience_reservations`(`asset_id`, `status`);
CREATE INDEX `experience_reservations_experience_slot_id_idx` ON `experience_reservations`(`experience_slot_id`);
CREATE INDEX `experience_reservations_party_id_idx` ON `experience_reservations`(`party_id`);

CREATE TABLE `experience_participants` (
    `id` VARCHAR(191) NOT NULL,
    `experience_reservation_id` VARCHAR(191) NOT NULL,
    `full_name` VARCHAR(191) NOT NULL,
    `age` INTEGER NULL,
    `attended` BOOLEAN NOT NULL DEFAULT false,
    `attended_at` DATETIME(3) NULL,
    `waiver_ack_at` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `experience_participants_experience_reservation_id_idx` ON `experience_participants`(`experience_reservation_id`);

ALTER TABLE `experience_reservations`
  ADD CONSTRAINT `experience_reservations_asset_id_fkey`
  FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `experience_reservations_experience_product_id_fkey`
  FOREIGN KEY (`experience_product_id`) REFERENCES `experience_products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `experience_reservations_experience_slot_id_fkey`
  FOREIGN KEY (`experience_slot_id`) REFERENCES `experience_slots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `experience_reservations_inventory_hold_id_fkey`
  FOREIGN KEY (`inventory_hold_id`) REFERENCES `inventory_holds`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `experience_reservations_party_id_fkey`
  FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `experience_participants`
  ADD CONSTRAINT `experience_participants_experience_reservation_id_fkey`
  FOREIGN KEY (`experience_reservation_id`) REFERENCES `experience_reservations`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Restaurant OS 1.0: MealInquiry, meal folio, hold link, Party FK, amountPaid

ALTER TABLE `folio_charges` MODIFY `stay_reservation_id` VARCHAR(191) NULL;
ALTER TABLE `folio_charges` ADD COLUMN `meal_reservation_id` VARCHAR(191) NULL;
CREATE INDEX `folio_charges_meal_reservation_id_idx` ON `folio_charges`(`meal_reservation_id`);

ALTER TABLE `meal_reservations`
  ADD COLUMN `inventory_hold_id` VARCHAR(191) NULL,
  ADD COLUMN `meal_inquiry_id` VARCHAR(191) NULL,
  ADD COLUMN `amount_paid` DECIMAL(14, 2) NOT NULL DEFAULT 0;

CREATE INDEX `meal_reservations_party_id_idx` ON `meal_reservations`(`party_id`);
CREATE INDEX `meal_reservations_meal_inquiry_id_idx` ON `meal_reservations`(`meal_inquiry_id`);

CREATE TABLE `meal_inquiries` (
    `id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `party_id` VARCHAR(191) NULL,
    `contact_name` VARCHAR(191) NOT NULL,
    `contact_phone` VARCHAR(191) NULL,
    `contact_email` VARCHAR(191) NULL,
    `guest_count` INTEGER NOT NULL,
    `preferred_service_at` DATETIME(3) NULL,
    `meal_package_id` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `quoted_amount` DECIMAL(14, 2) NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `commercial_document_id` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `meal_inquiries_asset_id_status_idx` ON `meal_inquiries`(`asset_id`, `status`);
CREATE INDEX `meal_inquiries_party_id_idx` ON `meal_inquiries`(`party_id`);

ALTER TABLE `folio_charges`
  ADD CONSTRAINT `folio_charges_meal_reservation_id_fkey`
  FOREIGN KEY (`meal_reservation_id`) REFERENCES `meal_reservations`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `meal_reservations`
  ADD CONSTRAINT `meal_reservations_inventory_hold_id_fkey`
  FOREIGN KEY (`inventory_hold_id`) REFERENCES `inventory_holds`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `meal_reservations_meal_inquiry_id_fkey`
  FOREIGN KEY (`meal_inquiry_id`) REFERENCES `meal_inquiries`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `meal_reservations_party_id_fkey`
  FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `meal_inquiries`
  ADD CONSTRAINT `meal_inquiries_asset_id_fkey`
  FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `meal_inquiries_party_id_fkey`
  FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `meal_inquiries_meal_package_id_fkey`
  FOREIGN KEY (`meal_package_id`) REFERENCES `meal_packages`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `meal_inquiries_commercial_document_id_fkey`
  FOREIGN KEY (`commercial_document_id`) REFERENCES `commercial_documents`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

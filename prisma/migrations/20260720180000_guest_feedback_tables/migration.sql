-- Catch-up: guest rating/feedback tables were applied via db push and missing from history.
-- IF NOT EXISTS keeps this safe on databases that already have them.

CREATE TABLE IF NOT EXISTS `service_offering_ratings` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `offering_id` VARCHAR(191) NOT NULL,
    `service_order_id` VARCHAR(191) NULL,
    `stars` INTEGER NOT NULL,
    `comment` TEXT NULL,
    `fingerprint` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `service_offering_ratings_asset_id_offering_id_idx`(`asset_id`, `offering_id`),
    INDEX `service_offering_ratings_organization_id_created_at_idx`(`organization_id`, `created_at`),
    UNIQUE INDEX `service_offering_ratings_offering_id_service_order_id_key`(`offering_id`, `service_order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `guest_qr_feedbacks` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `service_location_id` VARCHAR(191) NOT NULL,
    `table_session_id` VARCHAR(191) NULL,
    `stay_reservation_id` VARCHAR(191) NULL,
    `nps` INTEGER NOT NULL,
    `stars` INTEGER NULL,
    `tags_json` JSON NULL,
    `comment` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `guest_qr_feedbacks_asset_id_created_at_idx`(`asset_id`, `created_at`),
    INDEX `guest_qr_feedbacks_organization_id_created_at_idx`(`organization_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add FKs only when missing (fresh shadow needs them; live already has them).
SET @db := DATABASE();

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = @db
        AND TABLE_NAME = 'service_offering_ratings'
        AND CONSTRAINT_NAME = 'service_offering_ratings_organization_id_fkey'
    ),
    'SELECT 1',
    'ALTER TABLE `service_offering_ratings` ADD CONSTRAINT `service_offering_ratings_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = @db
        AND TABLE_NAME = 'service_offering_ratings'
        AND CONSTRAINT_NAME = 'service_offering_ratings_asset_id_fkey'
    ),
    'SELECT 1',
    'ALTER TABLE `service_offering_ratings` ADD CONSTRAINT `service_offering_ratings_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = @db
        AND TABLE_NAME = 'service_offering_ratings'
        AND CONSTRAINT_NAME = 'service_offering_ratings_offering_id_fkey'
    ),
    'SELECT 1',
    'ALTER TABLE `service_offering_ratings` ADD CONSTRAINT `service_offering_ratings_offering_id_fkey` FOREIGN KEY (`offering_id`) REFERENCES `service_offerings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = @db
        AND TABLE_NAME = 'guest_qr_feedbacks'
        AND CONSTRAINT_NAME = 'guest_qr_feedbacks_organization_id_fkey'
    ),
    'SELECT 1',
    'ALTER TABLE `guest_qr_feedbacks` ADD CONSTRAINT `guest_qr_feedbacks_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = @db
        AND TABLE_NAME = 'guest_qr_feedbacks'
        AND CONSTRAINT_NAME = 'guest_qr_feedbacks_asset_id_fkey'
    ),
    'SELECT 1',
    'ALTER TABLE `guest_qr_feedbacks` ADD CONSTRAINT `guest_qr_feedbacks_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = @db
        AND TABLE_NAME = 'guest_qr_feedbacks'
        AND CONSTRAINT_NAME = 'guest_qr_feedbacks_service_location_id_fkey'
    ),
    'SELECT 1',
    'ALTER TABLE `guest_qr_feedbacks` ADD CONSTRAINT `guest_qr_feedbacks_service_location_id_fkey` FOREIGN KEY (`service_location_id`) REFERENCES `service_locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

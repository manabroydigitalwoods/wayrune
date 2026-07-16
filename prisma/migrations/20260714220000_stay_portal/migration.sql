-- Stay portal: room units, rate plans, stay reservations

CREATE TABLE `asset_room_units` (
    `id` VARCHAR(191) NOT NULL,
    `room_product_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `floor` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'vacant_clean',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `asset_room_units_room_product_id_is_active_idx`(`room_product_id`, `is_active`),
    INDEX `asset_room_units_room_product_id_status_idx`(`room_product_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `asset_rate_plans` (
    `id` VARCHAR(191) NOT NULL,
    `room_product_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `start_date` DATE NULL,
    `end_date` DATE NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `asset_rate_plans_room_product_id_is_active_idx`(`room_product_id`, `is_active`),
    INDEX `asset_rate_plans_room_product_id_start_date_end_date_idx`(`room_product_id`, `start_date`, `end_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `stay_reservations` (
    `id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `room_product_id` VARCHAR(191) NULL,
    `room_unit_id` VARCHAR(191) NULL,
    `check_in` DATE NOT NULL,
    `check_out` DATE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'confirmed',
    `guest_name` VARCHAR(191) NOT NULL,
    `guest_phone` VARCHAR(191) NULL,
    `guest_email` VARCHAR(191) NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'manual',
    `booking_component_id` VARCHAR(191) NULL,
    `inventory_allocation_id` VARCHAR(191) NULL,
    `rate_amount` DECIMAL(14, 2) NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `notes` TEXT NULL,
    `confirmation_ref` VARCHAR(191) NULL,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `stay_reservations_asset_id_status_idx`(`asset_id`, `status`),
    INDEX `stay_reservations_asset_id_check_in_check_out_idx`(`asset_id`, `check_in`, `check_out`),
    INDEX `stay_reservations_booking_component_id_idx`(`booking_component_id`),
    INDEX `stay_reservations_room_unit_id_idx`(`room_unit_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `asset_room_units` ADD CONSTRAINT `asset_room_units_room_product_id_fkey` FOREIGN KEY (`room_product_id`) REFERENCES `asset_room_products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `asset_rate_plans` ADD CONSTRAINT `asset_rate_plans_room_product_id_fkey` FOREIGN KEY (`room_product_id`) REFERENCES `asset_room_products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `stay_reservations` ADD CONSTRAINT `stay_reservations_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `stay_reservations` ADD CONSTRAINT `stay_reservations_room_product_id_fkey` FOREIGN KEY (`room_product_id`) REFERENCES `asset_room_products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `stay_reservations` ADD CONSTRAINT `stay_reservations_room_unit_id_fkey` FOREIGN KEY (`room_unit_id`) REFERENCES `asset_room_units`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `stay_reservations` ADD CONSTRAINT `stay_reservations_booking_component_id_fkey` FOREIGN KEY (`booking_component_id`) REFERENCES `booking_components`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `stay_reservations` ADD CONSTRAINT `stay_reservations_inventory_allocation_id_fkey` FOREIGN KEY (`inventory_allocation_id`) REFERENCES `inventory_allocations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

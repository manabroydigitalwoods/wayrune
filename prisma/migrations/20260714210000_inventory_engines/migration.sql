-- Stage D inventory engines hanging off partner_assets

CREATE TABLE `asset_room_products` (
    `id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `room_type_key` VARCHAR(191) NULL,
    `max_occupancy` INTEGER NOT NULL DEFAULT 2,
    `bed_config` VARCHAR(191) NULL,
    `base_quantity` INTEGER NOT NULL DEFAULT 1,
    `rate_hint` DECIMAL(14, 2) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `asset_room_products_asset_id_is_active_idx`(`asset_id`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `asset_allotments` (
    `id` VARCHAR(191) NOT NULL,
    `room_product_id` VARCHAR(191) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `available_count` INTEGER NOT NULL,
    `stop_sell` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `asset_allotments_room_product_id_start_date_end_date_idx`(`room_product_id`, `start_date`, `end_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `asset_fleet_units` (
    `id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `plate_number` VARCHAR(191) NULL,
    `seats` INTEGER NULL,
    `vehicle_type_key` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `asset_fleet_units_asset_id_is_active_idx`(`asset_id`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inventory_allocations` (
    `id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `room_product_id` VARCHAR(191) NULL,
    `fleet_unit_id` VARCHAR(191) NULL,
    `booking_component_id` VARCHAR(191) NULL,
    `check_in` DATE NULL,
    `check_out` DATE NULL,
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(191) NOT NULL DEFAULT 'hold',
    `notes` TEXT NULL,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `inventory_allocations_asset_id_status_idx`(`asset_id`, `status`),
    INDEX `inventory_allocations_room_product_id_check_in_check_out_idx`(`room_product_id`, `check_in`, `check_out`),
    INDEX `inventory_allocations_fleet_unit_id_start_at_end_at_idx`(`fleet_unit_id`, `start_at`, `end_at`),
    INDEX `inventory_allocations_booking_component_id_idx`(`booking_component_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `asset_calendar_blocks` (
    `id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `fleet_unit_id` VARCHAR(191) NULL,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'blocked',
    `allocation_id` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `asset_calendar_blocks_asset_id_start_at_end_at_idx`(`asset_id`, `start_at`, `end_at`),
    INDEX `asset_calendar_blocks_fleet_unit_id_start_at_end_at_idx`(`fleet_unit_id`, `start_at`, `end_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `asset_service_offers` (
    `id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `capacity` INTEGER NULL,
    `service_date` DATE NULL,
    `service_window` VARCHAR(191) NULL,
    `rate_hint` DECIMAL(14, 2) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `asset_service_offers_asset_id_is_active_idx`(`asset_id`, `is_active`),
    INDEX `asset_service_offers_asset_id_service_date_idx`(`asset_id`, `service_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `asset_room_products` ADD CONSTRAINT `asset_room_products_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `asset_allotments` ADD CONSTRAINT `asset_allotments_room_product_id_fkey` FOREIGN KEY (`room_product_id`) REFERENCES `asset_room_products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `asset_fleet_units` ADD CONSTRAINT `asset_fleet_units_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `inventory_allocations` ADD CONSTRAINT `inventory_allocations_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `inventory_allocations` ADD CONSTRAINT `inventory_allocations_room_product_id_fkey` FOREIGN KEY (`room_product_id`) REFERENCES `asset_room_products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `inventory_allocations` ADD CONSTRAINT `inventory_allocations_fleet_unit_id_fkey` FOREIGN KEY (`fleet_unit_id`) REFERENCES `asset_fleet_units`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `inventory_allocations` ADD CONSTRAINT `inventory_allocations_booking_component_id_fkey` FOREIGN KEY (`booking_component_id`) REFERENCES `booking_components`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `asset_calendar_blocks` ADD CONSTRAINT `asset_calendar_blocks_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `asset_calendar_blocks` ADD CONSTRAINT `asset_calendar_blocks_fleet_unit_id_fkey` FOREIGN KEY (`fleet_unit_id`) REFERENCES `asset_fleet_units`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `asset_calendar_blocks` ADD CONSTRAINT `asset_calendar_blocks_allocation_id_fkey` FOREIGN KEY (`allocation_id`) REFERENCES `inventory_allocations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `asset_service_offers` ADD CONSTRAINT `asset_service_offers_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

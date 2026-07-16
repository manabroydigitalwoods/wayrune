-- Agency rate directory: hotel supplier costs + transfer fares

CREATE TABLE `supplier_hotel_rates` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `supplier_id` VARCHAR(191) NOT NULL,
    `room_type` VARCHAR(191) NULL,
    `unit_cost` DECIMAL(14, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `start_date` DATE NULL,
    `end_date` DATE NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `supplier_hotel_rates_organization_id_supplier_id_is_active_idx`(`organization_id`, `supplier_id`, `is_active`),
    INDEX `supplier_hotel_rates_organization_id_is_active_idx`(`organization_id`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `transfer_fares` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `from_place_id` VARCHAR(191) NOT NULL,
    `to_place_id` VARCHAR(191) NOT NULL,
    `vehicle_type_id` VARCHAR(191) NOT NULL,
    `unit_cost` DECIMAL(14, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `start_date` DATE NULL,
    `end_date` DATE NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `transfer_fares_organization_id_from_to_vehicle_active_idx`(`organization_id`, `from_place_id`, `to_place_id`, `vehicle_type_id`, `is_active`),
    INDEX `transfer_fares_organization_id_is_active_idx`(`organization_id`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `supplier_hotel_rates` ADD CONSTRAINT `supplier_hotel_rates_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `supplier_hotel_rates` ADD CONSTRAINT `supplier_hotel_rates_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `transfer_fares` ADD CONSTRAINT `transfer_fares_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `transfer_fares` ADD CONSTRAINT `transfer_fares_from_place_id_fkey` FOREIGN KEY (`from_place_id`) REFERENCES `places`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `transfer_fares` ADD CONSTRAINT `transfer_fares_to_place_id_fkey` FOREIGN KEY (`to_place_id`) REFERENCES `places`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `transfer_fares` ADD CONSTRAINT `transfer_fares_vehicle_type_id_fkey` FOREIGN KEY (`vehicle_type_id`) REFERENCES `vehicle_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

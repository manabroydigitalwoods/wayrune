-- CreateTable
CREATE TABLE `supplier_activity_rates` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `supplier_id` VARCHAR(191) NULL,
    `place_id` VARCHAR(191) NULL,
    `activity_name` VARCHAR(191) NOT NULL,
    `activity_key` VARCHAR(191) NOT NULL,
    `private_or_sic` VARCHAR(191) NULL,
    `adult_unit_cost` DECIMAL(14, 2) NOT NULL,
    `child_unit_cost` DECIMAL(14, 2) NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `start_date` DATE NULL,
    `end_date` DATE NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `sar_org_key_active_idx`(`organization_id`, `activity_key`, `is_active`),
    INDEX `sar_org_supplier_active_idx`(`organization_id`, `supplier_id`, `is_active`),
    INDEX `sar_org_place_active_idx`(`organization_id`, `place_id`, `is_active`),
    INDEX `sar_org_active_idx`(`organization_id`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `supplier_activity_rates` ADD CONSTRAINT `supplier_activity_rates_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_activity_rates` ADD CONSTRAINT `supplier_activity_rates_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_activity_rates` ADD CONSTRAINT `supplier_activity_rates_place_id_fkey` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

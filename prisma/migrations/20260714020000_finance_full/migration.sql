-- AlterTable trip_payments
ALTER TABLE `trip_payments` ADD COLUMN `amount_paid` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `method` VARCHAR(191) NULL,
    ADD COLUMN `reference` VARCHAR(191) NULL,
    ADD COLUMN `supplier_invoice_id` VARCHAR(191) NULL,
    ADD COLUMN `booking_component_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `supplier_invoices` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `trip_id` VARCHAR(191) NOT NULL,
    `supplier_id` VARCHAR(191) NOT NULL,
    `booking_component_id` VARCHAR(191) NULL,
    `invoice_number` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `due_at` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `notes` TEXT NULL,
    `created_by` VARCHAR(191) NULL,
    `updated_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `supplier_invoices_trip_id_status_idx`(`trip_id`, `status`),
    INDEX `supplier_invoices_organization_id_supplier_id_idx`(`organization_id`, `supplier_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trip_feedback` (
    `id` VARCHAR(191) NOT NULL,
    `trip_id` VARCHAR(191) NOT NULL,
    `score` INTEGER NOT NULL,
    `note` TEXT NULL,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `trip_feedback_trip_id_created_at_idx`(`trip_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `supplier_invoices` ADD CONSTRAINT `supplier_invoices_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `supplier_invoices` ADD CONSTRAINT `supplier_invoices_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `supplier_invoices` ADD CONSTRAINT `supplier_invoices_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `supplier_invoices` ADD CONSTRAINT `supplier_invoices_booking_component_id_fkey` FOREIGN KEY (`booking_component_id`) REFERENCES `booking_components`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `trip_feedback` ADD CONSTRAINT `trip_feedback_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `trip_payments` ADD CONSTRAINT `trip_payments_supplier_invoice_id_fkey` FOREIGN KEY (`supplier_invoice_id`) REFERENCES `supplier_invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `trip_payments` ADD CONSTRAINT `trip_payments_booking_component_id_fkey` FOREIGN KEY (`booking_component_id`) REFERENCES `booking_components`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

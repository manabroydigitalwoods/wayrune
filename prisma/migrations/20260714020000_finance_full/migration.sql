-- Ops finance core tables (originally applied via db push; restored here so shadow replay works).

-- CreateTable
CREATE TABLE `suppliers` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'other',
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `suppliers_organization_id_type_idx`(`organization_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_components` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `trip_id` VARCHAR(191) NOT NULL,
    `supplier_id` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `confirmation_ref` VARCHAR(191) NULL,
    `voucher_note` TEXT NULL,
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `cost_amount` DECIMAL(14, 2) NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `created_by` VARCHAR(191) NULL,
    `updated_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `booking_components_trip_id_status_idx`(`trip_id`, `status`),
    INDEX `booking_components_organization_id_idx`(`organization_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable (includes finance columns that earlier ALTER assumed already existed)
CREATE TABLE `trip_payments` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `trip_id` VARCHAR(191) NOT NULL,
    `direction` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `amount_paid` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `method` VARCHAR(191) NULL,
    `reference` VARCHAR(191) NULL,
    `due_at` DATETIME(3) NULL,
    `paid_at` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'scheduled',
    `notes` TEXT NULL,
    `supplier_invoice_id` VARCHAR(191) NULL,
    `booking_component_id` VARCHAR(191) NULL,
    `created_by` VARCHAR(191) NULL,
    `updated_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `trip_payments_trip_id_direction_status_idx`(`trip_id`, `direction`, `status`),
    INDEX `trip_payments_organization_id_idx`(`organization_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- CreateTable
CREATE TABLE `trip_readiness_items` (
    `id` VARCHAR(191) NOT NULL,
    `trip_id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `position` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `trip_readiness_items_trip_id_idx`(`trip_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `suppliers` ADD CONSTRAINT `suppliers_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `booking_components` ADD CONSTRAINT `booking_components_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `booking_components` ADD CONSTRAINT `booking_components_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `trip_payments` ADD CONSTRAINT `trip_payments_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `supplier_invoices` ADD CONSTRAINT `supplier_invoices_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `supplier_invoices` ADD CONSTRAINT `supplier_invoices_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `supplier_invoices` ADD CONSTRAINT `supplier_invoices_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `supplier_invoices` ADD CONSTRAINT `supplier_invoices_booking_component_id_fkey` FOREIGN KEY (`booking_component_id`) REFERENCES `booking_components`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `trip_feedback` ADD CONSTRAINT `trip_feedback_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `trip_readiness_items` ADD CONSTRAINT `trip_readiness_items_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `trip_payments` ADD CONSTRAINT `trip_payments_supplier_invoice_id_fkey` FOREIGN KEY (`supplier_invoice_id`) REFERENCES `supplier_invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `trip_payments` ADD CONSTRAINT `trip_payments_booking_component_id_fkey` FOREIGN KEY (`booking_component_id`) REFERENCES `booking_components`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

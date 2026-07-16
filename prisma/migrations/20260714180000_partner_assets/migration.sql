-- AlterTable
ALTER TABLE `refresh_tokens` ADD COLUMN `organization_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `partner_assets` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `asset_kind` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `place_id` VARCHAR(191) NULL,
    `profile_json` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `partner_assets_organization_id_is_active_idx`(`organization_id`, `is_active`),
    INDEX `partner_assets_organization_id_asset_kind_idx`(`organization_id`, `asset_kind`),
    INDEX `partner_assets_place_id_idx`(`place_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `suppliers` ADD COLUMN `linked_asset_id` VARCHAR(191) NULL;

-- DropIndex
DROP INDEX `suppliers_organization_id_linked_organization_id_key` ON `suppliers`;

-- CreateIndex
CREATE INDEX `suppliers_linked_asset_id_idx` ON `suppliers`(`linked_asset_id`);

-- CreateIndex
CREATE UNIQUE INDEX `suppliers_organization_id_linked_asset_id_key` ON `suppliers`(`organization_id`, `linked_asset_id`);

-- AddForeignKey
ALTER TABLE `partner_assets` ADD CONSTRAINT `partner_assets_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_assets` ADD CONSTRAINT `partner_assets_place_id_fkey` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `suppliers` ADD CONSTRAINT `suppliers_linked_asset_id_fkey` FOREIGN KEY (`linked_asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

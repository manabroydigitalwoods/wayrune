-- AlterTable
ALTER TABLE `booking_components` ADD COLUMN `partner_asset_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `booking_components_partner_asset_id_idx` ON `booking_components`(`partner_asset_id`);

-- AddForeignKey
ALTER TABLE `booking_components` ADD CONSTRAINT `booking_components_partner_asset_id_fkey` FOREIGN KEY (`partner_asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

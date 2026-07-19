-- AlterTable
ALTER TABLE `transfer_fares` ADD COLUMN `supplier_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `transfer_fares_organization_id_supplier_id_is_active_idx` ON `transfer_fares`(`organization_id`, `supplier_id`, `is_active`);

-- AddForeignKey
ALTER TABLE `transfer_fares` ADD CONSTRAINT `transfer_fares_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
